const express = require("express");
const databaseUrl = process.env.DATABASE_URL || "";
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const { default: RedisStore } = require("connect-redis");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const multer = require("multer");
const { createHash, randomUUID, timingSafeEqual } = require("crypto");
const cookieParser = require("cookie-parser");
const { createClient } = require("redis");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const {
  isStripePriceId,
  isStripeSessionId,
  normalizeAvatarUrl,
  validateRuntimeConfig,
} = require("./lib/validation");

const PORT = process.env.PORT || 4173;
const isProduction = process.env.NODE_ENV === "production";
const runtimeConfig = validateRuntimeConfig(process.env, isProduction);
const canonicalUrl = (
  process.env.SITE_URL || `http://localhost:${PORT}`
).replace(/\/$/, "");
const root = process.cwd();
const db = databaseUrl || !isProduction ? require("./lib/db") : null;

if (runtimeConfig.errors.length)
  console.error("Runtime configuration invalid", {
    missingOrInvalid: runtimeConfig.errors,
  });
if (runtimeConfig.warnings.length)
  console.warn("Optional production configuration missing", {
    variables: runtimeConfig.warnings,
  });

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
    /[<>&'\"]/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '\"': "&quot;",
      })[char],
  );
}

function logError(scope, error, requestId) {
  console.error(scope, {
    requestId,
    name: error?.name,
    code: error?.code,
    type: error?.type,
    message: error?.message || String(error),
    providerRequestId: error?.requestId,
  });
}

let databaseReady = false;
let databaseReadyPromise = null;
let lastDatabaseAttempt = 0;
async function ensureDatabaseReady() {
  if (!db) return false;
  if (databaseReady) return true;
  if (databaseReadyPromise) return databaseReadyPromise;
  if (Date.now() - lastDatabaseAttempt < 5_000) return false;
  lastDatabaseAttempt = Date.now();
  databaseReadyPromise = db
    .initSqlite()
    .then(() => seedDemoData())
    .then(() => {
      databaseReady = true;
      return true;
    })
    .catch((err) => {
      logError("database_init_error", err);
      return false;
    })
    .finally(() => {
      databaseReadyPromise = null;
    });
  return databaseReadyPromise;
}
void ensureDatabaseReady();

// Redis and session store
const redisUrl = process.env.REDIS_URL || "";
const redisClient = redisUrl
  ? createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: (retries) =>
          retries > 2
            ? new Error("Redis connection retry limit reached")
            : Math.min(retries * 200, 2_000),
      },
    })
  : null;
if (redisClient)
  redisClient.on("error", (err) => logError("redis_error", err));
let redisReadyPromise = null;
let lastRedisAttempt = 0;
async function ensureRedisReady() {
  if (!redisClient) return false;
  if (redisClient.isReady) return true;
  if (redisReadyPromise) return redisReadyPromise;
  if (redisClient.isOpen || Date.now() - lastRedisAttempt < 5_000) return false;
  lastRedisAttempt = Date.now();
  redisReadyPromise = redisClient
    .connect()
    .then(() => true)
    .catch((err) => {
      logError("redis_connect_error", err);
      return false;
    })
    .finally(() => {
      redisReadyPromise = null;
    });
  return redisReadyPromise;
}
void ensureRedisReady();

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

// Helmet with CSP tightened
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://www.google.com",
          "https://www.gstatic.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://*.stripe.com",
          "https://www.google.com",
        ],
        frameSrc: ["https://www.google.com", "https://recaptcha.google.com"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  }),
);

// Stripe needs the untouched request body to validate webhook signatures.
app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json", limit: "256kb" }),
  handleStripeWebhook,
);

// body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const sessionMiddleware = session({
  store: redisClient ? new RedisStore({ client: redisClient }) : undefined,
  secret:
    process.env.SESSION_SECRET ||
    (isProduction ? randomUUID() : "dev-only-change-this-secret"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  },
});
const statelessApiPaths = new Set([
  "/api/health",
  "/api/public-config",
  "/api/checkout-session",
]);
app.use("/api", (req, res, next) => {
  if (statelessApiPaths.has(req.originalUrl.split("?")[0])) return next();
  if (isProduction && hasConfigurationError("SESSION_SECRET", "REDIS_URL"))
    return res.status(503).json({
      ok: false,
      error: "session_not_configured",
      requestId: req.requestId,
    });
  return next();
});
app.use(
  asyncHandler(async (req, res, next) => {
    if (!req.path.startsWith("/api/") || statelessApiPaths.has(req.path))
      return next();
    if (isProduction && !(await ensureRedisReady()))
      return res.status(503).json({
        ok: false,
        error: "session_store_not_ready",
        requestId: req.requestId,
      });
    return sessionMiddleware(req, res, next);
  }),
);

// CSRF protection for state-changing API requests.
app.use((req, res, next) => {
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (safeMethod) return next();

  const provided = String(req.get("X-CSRF-Token") || "");
  const expected = String(req.session.csrfToken || "");
  const valid =
    provided.length > 0 &&
    expected.length > 0 &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!valid)
    return res.status(403).json({
      ok: false,
      error: "csrf_error",
      requestId: req.requestId,
    });
  return next();
});

// rate limiters
app.use(
  "/api",
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

// uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype))
      return cb(new Error("Only PNG, JPEG and WebP images are allowed"));
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

// Publish only intentional web assets. Serving the repository root would also
// expose backend source, package metadata and operational documentation.
app.use("/assets", express.static(path.join(root, "assets"), { dotfiles: "deny" }));
app.get(["/main.js", "/styles.css", "/llms.txt"], (req, res) =>
  res.sendFile(path.join(root, req.path.slice(1))),
);
const publicPages = new Set([
  "index.html", "cart.html", "client-dashboard.html", "client-login.html",
  "contact.html", "privacy.html", "produto-fl-studio.html",
  "produto-neural-x.html", "produto-reaper.html", "success.html", "terms.html",
]);
app.get(["/", "/*.html"], (req, res, next) => {
  const page = req.path === "/" ? "index.html" : req.path.slice(1);
  if (!publicPages.has(page)) return next();
  return res.sendFile(path.join(root, page));
});

function asyncHandler(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

async function requireDatabase(req, res, next) {
  if (!db || !(await ensureDatabaseReady()))
    return res.status(503).json({
      ok: false,
      error: "database_not_ready",
      requestId: req.requestId,
    });
  return next();
}

function hasConfigurationError(...variables) {
  return variables.some((variable) => runtimeConfig.errors.includes(variable));
}

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
    logError("redis_login_error", e);
    return 0;
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
  const demosEnabled = String(process.env.DEMO_ACCOUNTS_ENABLED || "") === "true";
  if (isProduction || !demosEnabled) return;
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
  return process.env.STRIPE_SECRET_KEY || "";
}

// Build the SDK client at startup instead of paying module initialization cost
// on the customer's checkout request.
const stripeSecret = getStripeSecret();
const stripeClient = stripeSecret
  ? require("stripe")(stripeSecret, { maxNetworkRetries: 2, timeout: 10_000 })
  : null;

function getProductCatalog() {
  return {
    "neural-x": {
      price: process.env.STRIPE_PRICE_NEURAL_X,
      name: "Pacote Neural X",
      image: "/assets/neural-collection.svg",
    },
    "fl-studio": {
      price: process.env.STRIPE_PRICE_FL_STUDIO,
      name: "FL Studio",
      image: "",
    },
    reaper: {
      price: process.env.STRIPE_PRICE_REAPER,
      name: "REAPER",
      image: "",
    },
  };
}

function getProductByPrice(priceId) {
  return Object.values(getProductCatalog()).find(
    (product) => product.price === priceId,
  );
}

// captcha verification
async function verifyCaptcha(token, expectedAction) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
      signal: AbortSignal.timeout(5_000),
    });
    const data = await res.json();
    // support both v2 (no score) and v3 (with score)
    return (
      data.success === true &&
      (data.score === undefined ? true : data.score >= 0.3) &&
      (!data.action || data.action === expectedAction)
    );
  } catch (e) {
    logError("captcha_verify_error", e);
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

function requireAuth(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

function saveSession(req) {
  return new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
}

async function fulfillCheckoutSession(sessionId) {
  if (!stripeClient || !db || !(await ensureDatabaseReady()))
    throw new Error("Fulfillment dependencies are not ready");

  const checkout = await stripeClient.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });
  if (checkout.payment_status !== "paid") return false;

  const buyerEmail = String(
    checkout.customer_details?.email || checkout.customer_email || "",
  )
    .trim()
    .toLowerCase();
  if (!buyerEmail) throw new Error("Paid checkout session has no customer email");

  for (const item of checkout.line_items?.data || []) {
    const priceId = typeof item.price === "string" ? item.price : item.price?.id;
    const product = getProductByPrice(priceId);
    if (!product) continue;
    const quantity = Math.max(Number.parseInt(item.quantity, 10) || 1, 1);
    const amount = Number(item.amount_total || 0) / 100;
    const values = [
      buyerEmail,
      product.name,
      "Pagamento confirmado",
      amount,
      quantity,
      product.image,
      null,
      checkout.id,
      priceId,
    ];
    await db.run(
      db.usePostgres
        ? "INSERT INTO orders (buyer_email, product, status, price, quantity, image, download_url, stripe_session_id, stripe_price_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING"
        : "INSERT OR IGNORE INTO orders (buyer_email, product, status, price, quantity, image, download_url, stripe_session_id, stripe_price_id) VALUES (?,?,?,?,?,?,?,?,?)",
      values,
    );
  }
  return true;
}

async function handleStripeWebhook(req, res, next) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.get("stripe-signature");
    if (!stripeClient || !webhookSecret)
      return res.status(503).json({ ok: false, error: "webhook_not_configured" });
    if (!signature)
      return res.status(400).json({ ok: false, error: "missing_signature" });

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret,
      );
    } catch (error) {
      logError("stripe_webhook_signature_error", error, req.requestId);
      return res.status(400).json({ ok: false, error: "invalid_signature" });
    }

    if (
      ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(
        event.type,
      )
    ) {
      await fulfillCheckoutSession(event.data.object.id);
    }
    return res.json({ received: true });
  } catch (error) {
    return next(error);
  }
}

app.get("/api/public-config", (req, res) =>
  res.json({ recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "" }),
);

app.get(
  "/api/csrf-token",
  asyncHandler(async (req, res) => {
    if (!req.session.csrfToken) req.session.csrfToken = randomUUID();
    await saveSession(req);
    return res.json({ csrfToken: req.session.csrfToken });
  }),
);

app.post(
  "/api/register",
  registrationLimiter,
  asyncHandler(requireDatabase),
  asyncHandler(async (req, res) => {
    const { password, captcha } = req.body || {};
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !password)
      return res.status(400).json({ ok: false, error: "missing_fields" });
    if (
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      String(password).length < 12 ||
      String(password).length > 128
    )
      return res
        .status(400)
        .json({ ok: false, error: "invalid_credentials_format" });
    if (!(await verifyCaptcha(captcha, "register")))
      return res.status(400).json({ ok: false, error: "captcha_failed" });
    if (await getUserByEmail(email))
      return res.status(409).json({ ok: false, error: "email_taken" });
    await createUser(email, await bcrypt.hash(password, 12));
    return res.status(201).json({ ok: true });
  }),
);

app.post(
  "/api/login/:role",
  loginLimiter,
  asyncHandler(requireDatabase),
  asyncHandler(async (req, res) => {
    const role = req.params.role;
    const { password, captcha, mfa_token } = req.body || {};
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (role !== "client")
      return res.status(404).json({ ok: false, error: "portal_disabled" });
    if (!email || !password)
      return res.status(400).json({ ok: false, error: "missing_fields" });
    if (
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      String(password).length > 128
    )
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    if (!(await verifyCaptcha(captcha, "login")))
      return res.status(400).json({ ok: false, error: "captcha_failed" });
    if (await isLocked(email))
      return res.status(429).json({ ok: false, error: "account_locked" });

    const user = await getUserByEmail(email);
    const matches = user
      ? await bcrypt.compare(String(password), user.password_hash)
      : false;
    if (!user || user.role !== role || !matches) {
      await recordFailedLogin(email);
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }
    if (user.mfa_enabled) {
      if (!mfa_token)
        return res.status(400).json({ ok: false, error: "mfa_required" });
      const verified = speakeasy.totp.verify({
        secret: user.mfa_secret,
        encoding: "base32",
        token: String(mfa_token),
        window: 1,
      });
      if (!verified) {
        await recordFailedLogin(email);
        return res.status(401).json({ ok: false, error: "mfa_failed" });
      }
    }

    await clearFailed(email);
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.user = { id: user.id, email: user.email, role: user.role };
    req.session.csrfToken = randomUUID();
    await saveSession(req);
    return res.json({ ok: true, role: user.role });
  }),
);

app.post(
  "/api/mfa/setup",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const email = req.session.user.email;
    const secret = speakeasy.generateSecret({ name: `NeuralX (${email})` });
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    req.session.mfaTemp = { secret: secret.base32 };
    await saveSession(req);
    return res.json({ ok: true, qr, secret: secret.base32 });
  }),
);

app.post(
  "/api/mfa/verify",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.session.mfaTemp)
      return res.status(401).json({ ok: false, error: "unauthorized" });
    const token = String(req.body?.token || "");
    if (!/^\d{6}$/.test(token))
      return res.status(400).json({ ok: false, error: "mfa_failed" });
    const secret = req.session.mfaTemp.secret;
    if (!speakeasy.totp.verify({ secret, encoding: "base32", token, window: 1 }))
      return res.status(400).json({ ok: false, error: "mfa_failed" });
    await db.run(
      db.usePostgres
        ? "UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE email = $2"
        : "UPDATE users SET mfa_enabled = 1, mfa_secret = ? WHERE email = ?",
      [secret, req.session.user.email],
    );
    delete req.session.mfaTemp;
    await saveSession(req);
    return res.json({ ok: true });
  }),
);

app.post("/api/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("connect.sid");
    return res.json({ ok: true });
  });
});

app.get(
  "/api/me",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getUserByEmail(req.session.user.email);
    return res.json({
      ok: true,
      user: {
        email: req.session.user.email,
        role: req.session.user.role,
        name: user?.name || "Cliente Neural X",
        avatarUrl: user?.avatar_url || "",
      },
    });
  }),
);

app.post(
  "/api/profile",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const avatarUrl = normalizeAvatarUrl(req.body?.avatarUrl);
    if (!name) return res.status(400).json({ ok: false, error: "missing_name" });
    if (avatarUrl === null)
      return res.status(400).json({ ok: false, error: "invalid_avatar_url" });
    await db.run(
      db.usePostgres
        ? "UPDATE users SET name = $1, avatar_url = $2 WHERE email = $3"
        : "UPDATE users SET name = ?, avatar_url = ? WHERE email = ?",
      [name, avatarUrl, req.session.user.email],
    );
    return res.json({
      ok: true,
      user: {
        email: req.session.user.email,
        role: req.session.user.role,
        name,
        avatarUrl,
      },
    });
  }),
);

app.get(
  "/api/orders",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      db.usePostgres
        ? "SELECT id, product, status, price, quantity, image, download_url FROM orders WHERE buyer_email = $1 ORDER BY created_at DESC"
        : "SELECT id, product, status, price, quantity, image, download_url FROM orders WHERE buyer_email = ? ORDER BY created_at DESC",
      [req.session.user.email],
    );
    return res.json(rows);
  }),
);

app.post(
  "/api/uploads",
  asyncHandler(requireDatabase),
  requireAuth,
  upload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: "no_file" });
    const signatures = [
      {
        mime: "image/png",
        test: (buffer) =>
          buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
      },
      {
        mime: "image/jpeg",
        test: (buffer) =>
          buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      },
      {
        mime: "image/webp",
        test: (buffer) =>
          buffer.subarray(0, 4).toString() === "RIFF" &&
          buffer.subarray(8, 12).toString() === "WEBP",
      },
    ];
    const detected = signatures.find(({ test }) => test(req.file.buffer));
    if (!detected)
      return res.status(400).json({ ok: false, error: "invalid_image" });
    return res.json({
      ok: true,
      url: `data:${detected.mime};base64,${req.file.buffer.toString("base64")}`,
    });
  },
);

app.post(
  "/api/create-checkout-session",
  asyncHandler(async (req, res) => {
    if (
      !stripeClient ||
      hasConfigurationError(
        "STRIPE_SECRET_KEY",
        "STRIPE_PRICE_NEURAL_X",
        "STRIPE_PRICE_FL_STUDIO",
        "STRIPE_PRICE_REAPER",
      )
    )
      return res.status(503).json({
        ok: false,
        error: "stripe_not_configured",
        requestId: req.requestId,
      });

    const catalog = getProductCatalog();
    const cart = Array.isArray(req.body?.cart) ? req.body.cart : [];
    const cartIds = cart.map((item) => item?.id);
    const invalidCartShape =
      cart.length < 1 ||
      cart.length > Object.keys(catalog).length ||
      new Set(cartIds).size !== cart.length;
    if (invalidCartShape)
      return res.status(400).json({
        ok: false,
        error: "invalid_cart_or_missing_price_ids",
        requestId: req.requestId,
      });
    const lineItems = cart
      .map((item) => {
        if (!item || typeof item.id !== "string") return null;
        const product = catalog[item.id];
        const quantity = Number.parseInt(item.quantity, 10);
        if (
          !isStripePriceId(product?.price) ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 10
        )
          return null;
        return { price: product.price, quantity };
      })
      .filter(Boolean);

    if (!lineItems.length || lineItems.length !== cart.length)
      return res.status(400).json({
        ok: false,
        error: "invalid_cart_or_missing_price_ids",
        requestId: req.requestId,
      });

    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const idempotencyKey = createHash("sha256")
      .update(`${req.sessionID}:${JSON.stringify(lineItems)}:${bucket}`)
      .digest("hex");

    try {
      const checkout = await stripeClient.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          mode: "payment",
          line_items: lineItems,
          customer_email: req.session.user?.email || undefined,
          client_reference_id: req.session.user?.id
            ? String(req.session.user.id)
            : undefined,
          success_url: `${canonicalUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${canonicalUrl}/cart.html?checkout=cancelled`,
          after_expiration: { recovery: { enabled: true } },
          metadata: {
            source: "neural-x-site",
            cart: JSON.stringify(
              cart.map(({ id, quantity }) => ({ id, quantity })),
            ),
          },
        },
        { idempotencyKey: `checkout-${idempotencyKey}` },
      );
      return res.json({ ok: true, url: checkout.url });
    } catch (error) {
      logError("stripe_checkout_error", error, req.requestId);
      const publicError =
        error?.code === "resource_missing"
          ? "stripe_price_not_found"
          : error?.type === "StripeAuthenticationError"
            ? "stripe_authentication_error"
            : "stripe_error";
      return res.status(error?.statusCode === 400 ? 400 : 502).json({
        ok: false,
        error: publicError,
        requestId: req.requestId,
      });
    }
  }),
);

app.get(
  "/api/checkout-session",
  asyncHandler(async (req, res) => {
    const sessionId = String(req.query.session_id || "");
    if (!stripeClient)
      return res.status(503).json({ ok: false, error: "stripe_not_configured" });
    if (!isStripeSessionId(sessionId))
      return res.status(400).json({ ok: false, error: "invalid_session_id" });
    try {
      const checkout = await stripeClient.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items"],
      });
      return res.json({
        ok: true,
        status: checkout.status,
        paymentStatus: checkout.payment_status,
        amountTotal: checkout.amount_total,
        currency: checkout.currency,
        products: (checkout.line_items?.data || []).map((item) => ({
          name: item.description,
          quantity: item.quantity,
        })),
      });
    } catch (error) {
      logError("stripe_session_lookup_error", error, req.requestId);
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }
  }),
);

app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    const [databaseInitialized, redisConnected] = await Promise.all([
      ensureDatabaseReady(),
      ensureRedisReady(),
    ]);
    let databaseHealthy = false;
    let redisHealthy = false;
    if (databaseInitialized && db) {
      try {
        await db.query("SELECT 1 AS ok");
        databaseHealthy = true;
      } catch (error) {
        logError("database_health_error", error, req.requestId);
      }
    }
    if (redisConnected && redisClient) {
      try {
        redisHealthy = (await redisClient.ping()) === "PONG";
      } catch (error) {
        logError("redis_health_error", error, req.requestId);
      }
    }
    const ok =
      databaseHealthy &&
      (!isProduction || redisHealthy) &&
      runtimeConfig.errors.length === 0;
    return res.status(ok ? 200 : 503).json({
      ok,
      services: {
        database: databaseHealthy ? "ok" : "unavailable",
        redis: redisHealthy ? "ok" : isProduction ? "unavailable" : "optional",
        stripe: stripeClient ? "configured" : "unavailable",
      },
      configuration: {
        valid: runtimeConfig.errors.length === 0,
        missingOrInvalid: runtimeConfig.errors,
        optionalMissing: runtimeConfig.warnings,
      },
      requestId: req.requestId,
    });
  }),
);

// Do not turn unknown or sensitive-looking paths into successful responses.
app.use((req, res) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({
      ok: false,
      error: "not_found",
      requestId: req.requestId,
    });
  return res.status(404).type("text/plain").send("Not found");
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  logError("request_error", error, req.requestId);
  if (error instanceof multer.MulterError || error?.type === "entity.too.large")
    return res.status(413).json({
      ok: false,
      error: "payload_too_large",
      requestId: req.requestId,
    });
  if (error?.message === "Only PNG, JPEG and WebP images are allowed")
    return res.status(400).json({
      ok: false,
      error: "invalid_image_type",
      requestId: req.requestId,
    });
  return res.status(500).json({
    ok: false,
    error: "server_error",
    requestId: req.requestId,
  });
});

if (require.main === module) {
  const server = app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`),
  );
  const shutdown = () => {
    server.close(async () => {
      if (redisClient?.isOpen) await redisClient.quit().catch(() => {});
      if (db) await db.close().catch(() => {});
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

module.exports = app;
