const express = require("express");
console.log("================================");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SIM" : "NAO");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("================================");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const session = require("express-session");
const { default: RedisStore } = require("connect-redis");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const multer = require("multer");
const { randomUUID, timingSafeEqual } = require("crypto");
const cookieParser = require("cookie-parser");
const { createClient } = require("redis");
const db = require("./lib/db");
const fetch = global.fetch || require("node-fetch");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

const PORT = process.env.PORT || 4173;
const isProduction = process.env.NODE_ENV === "production";
const canonicalUrl = (
  process.env.SITE_URL || `http://localhost:${PORT}`
).replace(/\/$/, "");
const root = process.cwd();
const uploadsDir = path.join(root, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const indexablePages = [
  { path: "/", priority: "1.0" },
  { path: "/produto-neural-x.html", priority: "0.9" },
  { path: "/produto-fl-studio.html", priority: "0.8" },
  { path: "/produto-reaper.html", priority: "0.8" },
  { path: "/contact.html", priority: "0.6" },
  { path: "/privacy.html", priority: "0.4" },
  { path: "/terms.html", priority: "0.4" },
];

function xmlEscape(value) {
  return String(value).replace(
    /[<>&'"]/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[char],
  );
}

// init db sqlite if used
const dbReady = db
  .initSqlite()
  .then(() => seedDemoData())
  .catch((err) => {
    console.error("Database init error", err);
    throw err;
  });

// Redis and session store
const redisUrl = process.env.REDIS_URL || "";
const redisClient = redisUrl ? createClient({ url: redisUrl }) : null;
if (redisClient)
  redisClient
    .connect()
    .catch((err) => console.error("Redis connect error", err));

const app = express();
app.set("trust proxy", 1);

// Helmet with CSP tightened
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://*.stripe.com"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  }),
);

// body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// sessions
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production");
}
if (isProduction && !redisClient) {
  throw new Error("REDIS_URL is required in production");
}

app.use(
  session({
    store: redisClient ? new RedisStore({ client: redisClient }) : undefined,
    secret:
      process.env.SESSION_SECRET ||
      (isProduction ? undefined : "dev-only-change-this-secret"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// CSRF protection for state-changing API requests.
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = randomUUID();
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (safeMethod) return next();

  const provided = String(req.get("X-CSRF-Token") || "");
  const expected = String(req.session.csrfToken || "");
  const valid =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!valid) return res.status(403).json({ ok: false, error: "csrf_error" });
  return next();
});

app.use("/api", async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch {
    res.status(500).json({ ok: false, error: "database_not_ready" });
  }
});

// rate limiters
app.use(rateLimit({ windowMs: 60 * 1000, max: 500 }));
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// uploads
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/"))
      return cb(new Error("Only images allowed"));
    cb(null, true);
  },
});

app.get("/robots.txt", (req, res) => {
  res
    .type("text/plain")
    .send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /client-dashboard.html",
        "Disallow: /api/",
        "",
        `Sitemap: ${canonicalUrl}/sitemap.xml`,
      ].join("\n"),
    );
});

app.get("/sitemap.xml", (req, res) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = indexablePages
    .map(
      (page) =>
        `  <url><loc>${xmlEscape(canonicalUrl + page.path)}</loc><lastmod>${lastmod}</lastmod><priority>${page.priority}</priority></url>`,
    )
    .join("\n");
  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    );
});

// serve static and uploads
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(root)));

// helpers: account lockout using Redis
async function recordFailedLogin(email) {
  try {
    const key = `login:fail:${email}`;
    if (!redisClient) return 0;
    const v = await redisClient.incr(key);
    if (v === 1) await redisClient.expire(key, 15 * 60); // 15 min window
    if (v >= 5)
      await redisClient.set(`login:lock:${email}`, "1", { EX: 30 * 60 }); // lock 30 min
    return v;
  } catch (e) {
    console.error("redis err", e);
  }
}
async function isLocked(email) {
  try {
    return redisClient
      ? (await redisClient.get(`login:lock:${email}`)) === "1"
      : false;
  } catch {
    return false;
  }
}
async function clearFailed(email) {
  try {
    if (redisClient) {
      await redisClient.del(`login:fail:${email}`);
      await redisClient.del(`login:lock:${email}`);
    }
  } catch {}
}

async function seedDemoData() {
  if (isProduction || process.env.DEMO_ACCOUNTS_ENABLED === "false") return;
  const demoEmail = "demo@neuralx.com";
  const exists = await getUserByEmail(demoEmail);
  if (!exists) {
    const hash = await bcrypt.hash("neuralx123", 10);
    await createUser(demoEmail, hash, "client", "Cliente Neural X");
  }
  const order = await db.getOne(
    db.usePostgres
      ? "SELECT id FROM orders WHERE buyer_email = $1 LIMIT 1"
      : "SELECT id FROM orders WHERE buyer_email = ? LIMIT 1",
    [demoEmail],
  );
  if (!order) {
    await db.run(
      db.usePostgres
        ? "INSERT INTO orders (buyer_email, product, status, price, image, download_url) VALUES ($1, $2, $3, $4, $5, $6)"
        : "INSERT INTO orders (buyer_email, product, status, price, image, download_url) VALUES (?, ?, ?, ?, ?, ?)",
      [
        demoEmail,
        "Pacote Neural X",
        "Disponível",
        29.9,
        "/assets/neural-collection.svg",
        "/produto-neural-x.html",
      ],
    );
  }
}

function getStripeSecret() {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || "";
}

console.log("===== STRIPE CONFIG =====");
console.log("SECRET:", !!process.env.STRIPE_SECRET_KEY);
console.log("NEURAL:", process.env.STRIPE_PRICE_NEURAL_X);
console.log("FL:", process.env.STRIPE_PRICE_FL_STUDIO);
console.log("REAPER:", process.env.STRIPE_PRICE_REAPER);
console.log("=========================");

function getProductCatalog() {
  return {
    "neural-x": {
      price: process.env.STRIPE_PRICE_NEURAL_X,
      name: "Pacote Neural X",
    },
    "fl-studio": {
      price: process.env.STRIPE_PRICE_FL_STUDIO,
      name: "FL Studio",
    },
    reaper: { price: process.env.STRIPE_PRICE_REAPER, name: "REAPER" },
  };
}

// captcha verification
async function verifyCaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // no captcha configured: bypass (but recommend to set)
  try {
    const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return data.success === true && data.score && data.score >= 0.3;
  } catch (e) {
    console.error("captcha verify err", e);
    return false;
  }
}

// helper db functions
async function getUserByEmail(email) {
  if (!email) return null;
  const row = await db.getOne(
    db.usePostgres
      ? "SELECT * FROM users WHERE email = $1"
      : "SELECT * FROM users WHERE email = ?",
    [email],
  );
  return row;
}
async function createUser(
  email,
  hash,
  role = "client",
  name = "Cliente Neural X",
) {
  if (db.usePostgres) {
    return db.run(
      "INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING *",
      [email, hash, role, name],
    );
  }
  return db.run(
    "INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)",
    [email, hash, role, name],
  );
}

// expose csrf token
app.get("/api/csrf-token", (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = randomUUID();
  res.json({ csrfToken: req.session.csrfToken });
});

// register
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, captcha } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ ok: false, error: "missing_fields" });
    if (!(await verifyCaptcha(captcha)))
      return res.status(400).json({ ok: false, error: "captcha_failed" });
    const exists = await getUserByEmail(email);
    if (exists)
      return res.status(409).json({ ok: false, error: "email_taken" });
    const hash = await bcrypt.hash(password, 10);
    await createUser(email, hash);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// login
app.post("/api/login/:role", loginLimiter, async (req, res) => {
  try {
    const role = req.params.role;
    const { email, password, captcha, mfa_token } = req.body || {};
    if (role !== "client")
      return res.status(404).json({ ok: false, error: "portal_disabled" });
    if (!email || !password)
      return res.status(400).json({ ok: false, error: "missing_fields" });
    if (!(await verifyCaptcha(captcha)))
      return res.status(400).json({ ok: false, error: "captcha_failed" });
    if (await isLocked(email))
      return res.status(429).json({ ok: false, error: "account_locked" });
    const user = await getUserByEmail(email);
    if (!user) {
      await recordFailedLogin(email);
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }
    if (user.role !== role) {
      await recordFailedLogin(email);
      return res.status(401).json({ ok: false, error: "invalid_role" });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await recordFailedLogin(email);
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }

    // if MFA enabled, verify token
    if (user.mfa_enabled) {
      if (!mfa_token)
        return res.status(400).json({ ok: false, error: "mfa_required" });
      const verified = speakeasy.totp.verify({
        secret: user.mfa_secret,
        encoding: "base32",
        token: String(mfa_token),
      });
      if (!verified) {
        await recordFailedLogin(email);
        return res.status(401).json({ ok: false, error: "mfa_failed" });
      }
    }

    // success
    await clearFailed(email);
    req.session.user = { id: user.id, email: user.email, role: user.role };
    res.json({ ok: true, role: user.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// MFA setup (requires authentication)
app.post("/api/mfa/setup", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  const email = req.session.user.email;
  const secret = speakeasy.generateSecret({ name: `NeuralX (${email})` });
  const otpauth = secret.otpauth_url;
  const qr = await qrcode.toDataURL(otpauth);
  // store secret temporarily in session until verified
  req.session.mfaTemp = { secret: secret.base32 };
  res.json({ ok: true, qr, secret: secret.base32 });
});

app.post("/api/mfa/verify", async (req, res) => {
  if (!req.session.user || !req.session.mfaTemp)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  const { token } = req.body || {};
  const email = req.session.user.email;
  const secret = req.session.mfaTemp.secret;
  const verified = speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token),
  });
  if (!verified)
    return res.status(400).json({ ok: false, error: "mfa_failed" });
  // persist to user
  if (db.usePostgres) {
    await db.run(
      "UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE email = $2",
      [secret, email],
    );
  } else {
    await db.run(
      "UPDATE users SET mfa_enabled = 1, mfa_secret = ? WHERE email = ?",
      [secret, email],
    );
  }
  delete req.session.mfaTemp;
  res.json({ ok: true });
});

// logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// me
app.get("/api/me", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  const user = await getUserByEmail(req.session.user.email);
  res.json({
    ok: true,
    user: {
      email: req.session.user.email,
      role: req.session.user.role,
      name: user?.name || "Cliente Neural X",
      avatarUrl: user?.avatar_url || "",
    },
  });
});

app.post("/api/profile", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  const name = String(req.body?.name || "")
    .trim()
    .slice(0, 80);
  const avatarUrl = String(req.body?.avatarUrl || "")
    .trim()
    .slice(0, 500);
  if (!name) return res.status(400).json({ ok: false, error: "missing_name" });
  await db.run(
    db.usePostgres
      ? "UPDATE users SET name = $1, avatar_url = $2 WHERE email = $3"
      : "UPDATE users SET name = ?, avatar_url = ? WHERE email = ?",
    [name, avatarUrl, req.session.user.email],
  );
  res.json({
    ok: true,
    user: {
      email: req.session.user.email,
      role: req.session.user.role,
      name,
      avatarUrl,
    },
  });
});

// orders
app.get("/api/orders", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  const email = req.session.user.email;
  try {
    const rows = await db.query(
      db.usePostgres
        ? "SELECT id, product, status, price, image, download_url FROM orders WHERE buyer_email = $1"
        : "SELECT id, product, status, price, image, download_url FROM orders WHERE buyer_email = ?",
      [email],
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// uploads
app.post(
  "/api/uploads",
  (req, res, next) => {
    if (!req.session.user)
      return res.status(401).json({ ok: false, error: "unauthorized" });
    next();
  },
  upload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: "no_file" });
    const ext = path.extname(req.file.originalname) || "";
    const filename = randomUUID() + ext;
    const dest = path.join(uploadsDir, filename);
    fs.rename(req.file.path, dest, (err) => {
      if (err) return res.status(500).json({ ok: false, error: "save_error" });
      res.json({ ok: true, url: "/uploads/" + filename });
    });
  },
);

// Stripe checkout endpoint (server-side only)
app.post("/api/create-checkout-session", async (req, res) => {
  const stripeSecret = getStripeSecret();
  if (!stripeSecret)
    return res.status(501).json({ ok: false, error: "stripe_not_configured" });

  const cart = Array.isArray(req.body?.cart) ? req.body.cart : [];
  const catalog = getProductCatalog();
  const lineItems = cart
    .map((item) => {
      const product = catalog[item.id];
      const quantity = Number.parseInt(item.quantity, 10);
      if (
        !product?.price ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      )
        return null;
      return { price: product.price, quantity };
    })
    .filter(Boolean);

  if (!lineItems.length || lineItems.length !== cart.length) {
    return res
      .status(400)
      .json({ ok: false, error: "invalid_cart_or_missing_price_ids" });
  }

  const stripe = require("stripe")(stripeSecret);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      success_url: `${canonicalUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${canonicalUrl}/cart.html?checkout=cancelled`,
      metadata: { source: "neural-x-site" },
    });
    res.json({ ok: true, url: session.url });
  } catch (e) {
    console.error("stripe err", e);
    res.status(500).json({ ok: false, error: "stripe_error" });
  }
});

// health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`),
  );
}

module.exports = app;
