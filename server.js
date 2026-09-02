const express = require("express");
const databaseUrl = process.env.DATABASE_URL || "";
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const connectRedis = require("connect-redis");
const RedisStore =
  connectRedis.RedisStore || connectRedis.default || connectRedis;
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} = require("crypto");
const cookieParser = require("cookie-parser");
const { createClient } = require("redis");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const { createDatabaseReadiness } = require("./lib/database-readiness");
const {
  isStripePriceId,
  isStripeSessionId,
  validateRuntimeConfig,
} = require("./lib/validation");
const {
  getProductCatalog,
  parseCheckoutCartMetadata,
  resolveLineItemProduct,
  toPublicCatalog,
} = require("./lib/catalog");
const {
  getEmailConfig,
  sendOrderConfirmationEmail,
  sendRecommendationEmail,
  sendSupportConfirmationEmail,
  sendSupportNotificationEmail,
  sendWelcomeEmail,
} = require("./lib/email");
const {
  createPreference: createMercadoPagoPreference,
  getPayment: getMercadoPagoPayment,
  isMercadoPagoPaymentId,
  verifyWebhookSignature: verifyMercadoPagoWebhookSignature,
} = require("./lib/mercado-pago");

const PORT = process.env.PORT || 4173;
const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = "neuralx.sid";
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
  { path: "/", priority: "1.0", changefreq: "weekly" },
  {
    path: "/produto-neural-x.html",
    priority: "0.9",
    changefreq: "weekly",
    images: [
      "/assets/neural-dsp/archetype-john-mayer-x.png",
      "/assets/neural-dsp/archetype-gojira-x.png",
      "/assets/neural-dsp/parallax-x.png",
      "/assets/neural-dsp/mantra.png",
    ],
  },
  {
    path: "/produto-fl-studio.html",
    priority: "0.8",
    changefreq: "weekly",
    images: ["/assets/product-fl-studio.jpg"],
  },
  {
    path: "/produto-reaper.html",
    priority: "0.8",
    changefreq: "weekly",
    images: ["/assets/product-reaper.jpg"],
  },
  { path: "/guias.html", priority: "0.8", changefreq: "weekly" },
  {
    path: "/guia-plugins-guitarra.html",
    priority: "0.8",
    changefreq: "monthly",
    images: ["/assets/neural-dsp/archetype-john-mayer-x.png"],
  },
  {
    path: "/guia-escolher-daw.html",
    priority: "0.8",
    changefreq: "monthly",
    images: ["/assets/product-fl-studio.jpg", "/assets/product-reaper.jpg"],
  },
  {
    path: "/checklist-software-musical.html",
    priority: "0.8",
    changefreq: "monthly",
  },
  { path: "/contact.html", priority: "0.6", changefreq: "monthly" },
  { path: "/privacy.html", priority: "0.4", changefreq: "yearly" },
  { path: "/terms.html", priority: "0.4", changefreq: "yearly" },
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

function logEvent(event, details = {}) {
  console.log("application_event", { event, ...details });
}

async function sendEmailSafely(type, operation, details = {}) {
  try {
    const result = await operation();
    logEvent("transactional_email", {
      type,
      sent: Boolean(result?.sent),
      skipped: result?.skipped || undefined,
      ...details,
    });
    return result;
  } catch (error) {
    logError(`transactional_email_${type}_error`, error, details.requestId);
    return { sent: false, error: true };
  }
}

const ensureDatabaseReady = db
  ? createDatabaseReadiness({
      initialize: () => db.initSqlite(),
      onError: (error) => logError("database_init_error", error),
    })
  : async () => false;
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
    frameguard: { action: "deny" },
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://www.googletagmanager.com",
        ],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://*.stripe.com",
          "https://www.google.com",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://region1.google-analytics.com",
          "https://www.googleadservices.com",
          "https://googleads.g.doubleclick.net",
        ],
        frameSrc: ["https://www.google.com", "https://recaptcha.google.com"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", "https://*.stripe.com"],
        upgradeInsecureRequests: isProduction ? [] : null,
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

// Mercado Pago signs request metadata. Parse only this isolated webhook route
// before the session, origin and CSRF middleware.
app.post(
  "/api/mercado-pago-webhook",
  express.json({ type: ["application/json", "application/*+json"], limit: "256kb" }),
  handleMercadoPagoWebhook,
);

// body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(cookieParser());

const sessionMiddleware = session({
  name: sessionCookieName,
  store: redisClient ? new RedisStore({ client: redisClient }) : undefined,
  secret:
    process.env.SESSION_SECRET ||
    (isProduction ? randomUUID() : "dev-only-change-this-secret"),
  resave: false,
  saveUninitialized: false,
  proxy: isProduction,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  },
});
const statelessApiPaths = new Set([
  "/api/health",
  "/api/catalog",
  "/api/public-config",
  "/api/checkout-session",
  "/api/mercado-pago-payment",
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

// Provider webhooks are registered above and use signature verification. Every
// other cross-site state change is rejected before CSRF validation.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (String(req.get("Sec-Fetch-Site") || "").toLowerCase() === "cross-site")
    return res.status(403).json({
      ok: false,
      error: "origin_not_allowed",
      requestId: req.requestId,
    });

  const origin = req.get("Origin");
  if (!origin) return next();
  const allowedOrigins = new Set([new URL(canonicalUrl).origin]);
  if (process.env.VERCEL_ENV === "preview" && req.get("host"))
    allowedOrigins.add(`https://${req.get("host")}`);
  if (!isProduction) {
    allowedOrigins.add(`http://localhost:${PORT}`);
    allowedOrigins.add(`http://127.0.0.1:${PORT}`);
  }
  if (!allowedOrigins.has(origin))
    return res.status(403).json({
      ok: false,
      error: "origin_not_allowed",
      requestId: req.requestId,
    });
  return next();
});

// CSRF protection for state-changing API requests.
app.use((req, res, next) => {
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (safeMethod) return next();
  if (!req.session)
    return res.status(503).json({
      ok: false,
      error: "session_not_ready",
      requestId: req.requestId,
    });

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
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const accountLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/robots.txt", (req, res) => {
  res
    .type("text/plain")
    .send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /cart.html",
        "Disallow: /client-dashboard.html",
        "Disallow: /client-login.html",
        "Disallow: /client-register.html",
        "Disallow: /success.html",
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
        `  <url><loc>${xmlEscape(canonicalUrl + page.path)}</loc><lastmod>${lastmod}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority>${(page.images || []).map((image) => `<image:image><image:loc>${xmlEscape(canonicalUrl + image)}</image:loc></image:image>`).join("")}</url>`,
    )
    .join("\n");
  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>`,
    );
});

// Publish only intentional web assets. Serving the repository root would also
// expose backend source, package metadata and operational documentation.
app.use("/assets", express.static(path.join(root, "assets"), {
  dotfiles: "deny",
  maxAge: "1h",
  setHeaders: (res) => res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400"),
}));
app.get(["/main.js", "/styles.css", "/llms.txt", "/site.webmanifest"], (req, res) =>
  res.sendFile(path.join(root, req.path.slice(1))),
);
const publicPages = new Set([
  "404.html", "index.html", "cart.html", "client-dashboard.html",
  "client-login.html", "client-register.html", "contact.html", "privacy.html",
  "googleab9c8b948f79ec49.html",
  "produto-fl-studio.html",
  "produto-neural-x.html", "produto-reaper.html", "success.html", "terms.html",
]);
app.get(["/", /^\/[^/]+\.html$/], (req, res, next) => {
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

function getStripeSecret() {
  return process.env.STRIPE_SECRET_KEY || "";
}

// Build the SDK client at startup instead of paying module initialization cost
// on the customer's checkout request.
const stripeSecret = getStripeSecret();
const stripeClient = stripeSecret
  ? require("stripe")(stripeSecret, { maxNetworkRetries: 2, timeout: 10_000 })
  : null;
const mercadoPagoAccessToken = String(
  process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
).trim();
const mercadoPagoWebhookSecret = String(
  process.env.MERCADO_PAGO_WEBHOOK_SECRET || "",
).trim();

function isMercadoPagoConfigured() {
  return Boolean(
    db &&
      mercadoPagoAccessToken &&
      mercadoPagoWebhookSecret &&
      !hasConfigurationError(
        "MERCADO_PAGO_ACCESS_TOKEN",
        "MERCADO_PAGO_WEBHOOK_SECRET",
      ),
  );
}

function normalizeAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const limits = {
    utm_source: 120,
    utm_medium: 120,
    utm_campaign: 120,
    utm_content: 120,
    utm_term: 120,
    referrer: 400,
    landing_page: 400,
    first_seen_at: 40,
  };
  return Object.fromEntries(
    Object.entries(limits)
      .map(([key, limit]) => [key, String(value[key] || "").trim().slice(0, limit)])
      .filter(([, fieldValue]) => fieldValue),
  );
}

let stripeCatalogCheck = { checkedAt: 0, valid: false };
let stripeCatalogPromise = null;
async function validateStripeCatalog() {
  if (!stripeClient) return false;
  const cacheTtl = stripeCatalogCheck.valid ? 15 * 60 * 1000 : 30 * 1000;
  if (Date.now() - stripeCatalogCheck.checkedAt < cacheTtl)
    return stripeCatalogCheck.valid;
  if (stripeCatalogPromise) return stripeCatalogPromise;

  stripeCatalogPromise = Promise.all(
    Object.entries(getProductCatalog()).map(async ([id, product]) => {
      if (!isStripePriceId(product.price)) return { id, valid: false };
      const price = await stripeClient.prices.retrieve(product.price);
      const keyIsLive = /^(?:sk|rk)_live_/.test(stripeSecret);
      return {
        id,
        valid:
          price.active === true &&
          price.type === "one_time" &&
          price.currency === "brl" &&
          price.unit_amount === product.unitAmount &&
          price.livemode === keyIsLive,
      };
    }),
  )
    .then((checks) => {
      const invalidProducts = checks
        .filter((check) => !check.valid)
        .map((check) => check.id);
      stripeCatalogCheck = {
        checkedAt: Date.now(),
        valid: invalidProducts.length === 0,
      };
      if (invalidProducts.length)
        console.error("stripe_catalog_invalid", { invalidProducts });
      return stripeCatalogCheck.valid;
    })
    .catch((error) => {
      stripeCatalogCheck = { checkedAt: Date.now(), valid: false };
      logError("stripe_catalog_validation_error", error);
      return false;
    })
    .finally(() => {
      stripeCatalogPromise = null;
    });
  return stripeCatalogPromise;
}

const supportCategories = new Map([
  ["pre_sale", "Dúvida antes da compra"],
  ["payment", "Pagamento"],
  ["order", "Pedido ou entrega"],
  ["access", "Acesso à conta"],
  ["compatibility", "Compatibilidade"],
  ["privacy", "Privacidade e dados"],
  ["other", "Outro assunto"],
]);
const leadInterests = new Map([
  ["guitar", {
    id: "neural-x",
    name: "Coleção Neural DSP",
    url: "/produto-neural-x.html",
    reason: "23 plugins para guitarra, baixo e voz, com demonstração real para comparar timbres antes da compra.",
  }],
  ["beats", {
    id: "fl-studio",
    name: "FL Studio 2026",
    url: "/produto-fl-studio.html",
    reason: "Um fluxo visual para padrões, piano roll, arranjos e mixagem sem tirar a ideia do ritmo.",
  }],
  ["recording", {
    id: "reaper",
    name: "REAPER 2026",
    url: "/produto-reaper.html",
    reason: "Gravação, edição precisa, roteamento flexível e desempenho leve para home studio.",
  }],
  ["compare", {
    id: "compare",
    name: "Comparação dos três produtos",
    url: "/#produtos",
    reason: "Compare objetivo, sistemas, diferencial e preço antes de escolher.",
  }],
]);

function isValidEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length > 0 && email.length <= 254 && /^\S+@\S+\.\S+$/.test(email);
}

function hashEnhancedConversionEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return isValidEmail(email)
    ? createHash("sha256").update(email, "utf8").digest("hex")
    : "";
}

function isStrongPassword(value) {
  const password = String(value || "");
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
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
async function getUserSummaryByEmail(email) {
  if (!email) return null;
  return db.getOne(
    db.usePostgres
      ? "SELECT id, email, role, name, mfa_enabled FROM users WHERE email = $1 LIMIT 1"
      : "SELECT id, email, role, name, mfa_enabled FROM users WHERE email = ? LIMIT 1",
    [email],
  );
}

async function getUserAuthByEmail(email) {
  if (!email) return null;
  return db.getOne(
    db.usePostgres
      ? "SELECT id, email, password_hash, role, name, mfa_enabled, mfa_secret FROM users WHERE email = $1 LIMIT 1"
      : "SELECT id, email, password_hash, role, name, mfa_enabled, mfa_secret FROM users WHERE email = ? LIMIT 1",
    [email],
  );
}
async function createUser(
  email,
  hash,
  role = "client",
  name = "Cliente Neural X",
  acceptedTerms = false,
) {
  if (db.usePostgres) {
    return db.run(
      "INSERT INTO users (email, password_hash, role, name, terms_accepted_at) VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END) RETURNING id, email, role, name",
      [email, hash, role, name, acceptedTerms],
    );
  }
  const inserted = await db.run(
    "INSERT INTO users (email, password_hash, role, name, terms_accepted_at) VALUES (?, ?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)",
    [email, hash, role, name, acceptedTerms ? 1 : 0],
  );
  return { id: inserted.lastID, email, role, name };
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

async function establishUserSession(req, user) {
  // Rotate the anonymous session before authenticating and persist it before
  // responding. Never use an email lookup to authenticate a duplicate signup.
  await new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.user = { id: user.id, email: user.email, role: user.role };
  req.session.csrfToken = randomUUID();
  await saveSession(req);
}

function getMfaEncryptionKey() {
  return createHash("sha256")
    .update(`neural-x:mfa:${process.env.SESSION_SECRET || "development"}`)
    .digest();
}

function encryptMfaSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMfaEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(secret), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptMfaSecret(value) {
  const stored = String(value || "");
  if (!stored.startsWith("v1.")) return stored;
  const [, ivValue, tagValue, encryptedValue] = stored.split(".");
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error("Invalid encrypted MFA secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getMfaEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getOrderAccessStatus(product) {
  if (product.accessMode === "automatic") return "Acesso liberado";
  return "Pagamento confirmado · entrega por e-mail em até 4h";
}

function isOrderAccessRevoked(status) {
  return new Set([
    "Pagamento reembolsado",
    "Pagamento parcialmente reembolsado",
    "Pagamento contestado",
    "Pagamento cancelado",
    "Pagamento recusado",
  ]).has(String(status || ""));
}

function isMercadoPagoReference(value) {
  return /^nx_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function mercadoPagoProcessingError(code, statusCode = 400) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function getMercadoPagoOrderStatus(providerStatus, product) {
  if (providerStatus === "approved") return getOrderAccessStatus(product);
  return (
    {
      refunded: "Pagamento reembolsado",
      charged_back: "Pagamento contestado",
      partially_refunded: "Pagamento parcialmente reembolsado",
      cancelled: "Pagamento cancelado",
      rejected: "Pagamento recusado",
    }[providerStatus] || null
  );
}

async function getMercadoPagoCheckout(reference) {
  if (!db || !isMercadoPagoReference(reference)) return null;
  return db.getOne(
    db.usePostgres
      ? "SELECT * FROM payment_checkouts WHERE reference = $1 AND provider = 'mercado_pago'"
      : "SELECT * FROM payment_checkouts WHERE reference = ? AND provider = 'mercado_pago'",
    [reference],
  );
}

function resolveMercadoPagoCart(checkoutRow) {
  let storedCart;
  try {
    storedCart = JSON.parse(String(checkoutRow.cart_json || ""));
  } catch {
    throw mercadoPagoProcessingError("payment_integrity_error", 409);
  }
  const catalog = getProductCatalog();
  const seen = new Set();
  if (!Array.isArray(storedCart) || storedCart.length < 1)
    throw mercadoPagoProcessingError("payment_integrity_error", 409);
  const resolved = storedCart.map((item) => {
    const id = String(item?.id || "");
    const quantity = Number.parseInt(item?.quantity, 10);
    const unitAmount = Number.parseInt(item?.unitAmount, 10);
    if (
      !catalog[id] ||
      seen.has(id) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10 ||
      !Number.isInteger(unitAmount) ||
      unitAmount < 1
    )
      throw mercadoPagoProcessingError("payment_integrity_error", 409);
    seen.add(id);
    return { product: catalog[id], quantity, unitAmount };
  });
  const storedTotal = resolved.reduce(
    (total, item) => total + item.unitAmount * item.quantity,
    0,
  );
  if (storedTotal !== Number(checkoutRow.amount_total))
    throw mercadoPagoProcessingError("payment_integrity_error", 409);
  return resolved;
}

async function persistMercadoPagoPayment(payment) {
  const paymentId = String(payment?.id || "");
  const reference = String(payment?.external_reference || "");
  if (!isMercadoPagoPaymentId(paymentId) || !isMercadoPagoReference(reference))
    throw mercadoPagoProcessingError("unknown_payment_reference", 404);
  const checkoutRow = await getMercadoPagoCheckout(reference);
  if (!checkoutRow)
    throw mercadoPagoProcessingError("unknown_payment_reference", 404);
  if (
    checkoutRow.approved_payment_id &&
    String(checkoutRow.approved_payment_id) !== paymentId
  )
    throw mercadoPagoProcessingError("duplicate_payment_reference", 409);

  // Mercado Pago test and production tokens can share the APP_USR prefix.
  // Vercel's environment boundary is therefore the reliable mode signal here.
  const expectedLiveMode = process.env.VERCEL_ENV === "preview" ? false : isProduction;
  const transactionAmount = Number(payment.transaction_amount);
  const unroundedAmountCents = transactionAmount * 100;
  const amountCents = Math.round(unroundedAmountCents);
  if (
    String(payment.currency_id || "").toUpperCase() !==
      String(checkoutRow.currency || "").toUpperCase() ||
    !Number.isFinite(amountCents) ||
    Math.abs(unroundedAmountCents - amountCents) > 0.000001 ||
    amountCents !== Number(checkoutRow.amount_total) ||
    Boolean(payment.live_mode) !== expectedLiveMode
  )
    throw mercadoPagoProcessingError("payment_integrity_error", 409);

  const items = resolveMercadoPagoCart(checkoutRow);
  const refundedAmount = Number(payment.transaction_amount_refunded || 0);
  const refundedAmountCents = Math.round(refundedAmount * 100);
  if (
    !Number.isFinite(refundedAmountCents) ||
    refundedAmountCents < 0 ||
    refundedAmountCents > amountCents
  )
    throw mercadoPagoProcessingError("payment_integrity_error", 409);
  const providerStatus =
    refundedAmountCents > 0 && refundedAmountCents < amountCents
      ? "partially_refunded"
      : refundedAmountCents === amountCents && amountCents > 0
        ? "refunded"
        : String(payment.status || "unknown").slice(0, 80);
  const providerEmail = String(payment.payer?.email || "").trim().toLowerCase();
  const storedEmail = String(checkoutRow.buyer_email || "").trim().toLowerCase();
  const buyerEmail = isValidEmail(providerEmail)
    ? providerEmail
    : isValidEmail(storedEmail)
      ? storedEmail
      : "";

  await db.run(
    db.usePostgres
      ? "UPDATE payment_checkouts SET payment_id = $1, status = $2, approved_payment_id = COALESCE(approved_payment_id, $3), buyer_email = COALESCE($4, buyer_email), live_mode = $5, updated_at = CURRENT_TIMESTAMP WHERE reference = $6 AND provider = 'mercado_pago' AND (approved_payment_id IS NULL OR approved_payment_id = $1)"
      : "UPDATE payment_checkouts SET payment_id = ?, status = ?, approved_payment_id = COALESCE(approved_payment_id, ?), buyer_email = COALESCE(?, buyer_email), live_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ? AND provider = 'mercado_pago' AND (approved_payment_id IS NULL OR approved_payment_id = ?)",
    [
      paymentId,
      providerStatus,
      providerStatus === "approved" ? paymentId : null,
      buyerEmail || null,
      db.usePostgres ? Boolean(payment.live_mode) : Number(Boolean(payment.live_mode)),
      reference,
      ...(db.usePostgres ? [] : [paymentId]),
    ],
  );
  const updatedCheckoutRow = await getMercadoPagoCheckout(reference);
  if (
    updatedCheckoutRow?.approved_payment_id &&
    String(updatedCheckoutRow.approved_payment_id) !== paymentId
  )
    throw mercadoPagoProcessingError("duplicate_payment_reference", 409);

  if (providerStatus !== "approved") {
    const terminalOrderStatus = getMercadoPagoOrderStatus(providerStatus);
    if (terminalOrderStatus)
      await db.run(
        db.usePostgres
          ? "UPDATE orders SET status = $1, download_url = NULL WHERE payment_provider = 'mercado_pago' AND provider_payment_id = $2"
          : "UPDATE orders SET status = ?, download_url = NULL WHERE payment_provider = 'mercado_pago' AND provider_payment_id = ?",
        [terminalOrderStatus, paymentId],
      );
    return {
      recorded: false,
      providerStatus,
      paymentStatus: ["pending", "in_process", "authorized"].includes(
        providerStatus,
      )
        ? "pending"
        : "not_paid",
      fulfillment: "not_paid",
      products: items.map(({ product, quantity }) => ({
        id: product.id,
        name: product.name,
        quantity,
      })),
      amountTotal: Number(checkoutRow.amount_total),
      currency: checkoutRow.currency,
    };
  }

  if (!buyerEmail)
    throw mercadoPagoProcessingError("payment_email_missing", 422);

  for (const { product, quantity, unitAmount } of items) {
    const status = getOrderAccessStatus(product);
    const values = [
      buyerEmail,
      product.id,
      product.name,
      status,
      (unitAmount * quantity) / 100,
      quantity,
      product.image,
      product.accessUrl,
      "mercado_pago",
      paymentId,
      checkoutRow.preference_id,
    ];
    await db.run(
      db.usePostgres
        ? "INSERT INTO orders (buyer_email, product_id, product, status, price, quantity, image, download_url, payment_provider, provider_payment_id, provider_checkout_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING"
        : "INSERT OR IGNORE INTO orders (buyer_email, product_id, product, status, price, quantity, image, download_url, payment_provider, provider_payment_id, provider_checkout_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      values,
    );
    await db.run(
      db.usePostgres
        ? "UPDATE orders SET buyer_email = $1, status = $2, download_url = COALESCE(download_url, $3), provider_checkout_id = COALESCE(provider_checkout_id, $4) WHERE payment_provider = 'mercado_pago' AND provider_payment_id = $5 AND product_id = $6"
        : "UPDATE orders SET buyer_email = ?, status = ?, download_url = COALESCE(download_url, ?), provider_checkout_id = COALESCE(provider_checkout_id, ?) WHERE payment_provider = 'mercado_pago' AND provider_payment_id = ? AND product_id = ?",
      [
        buyerEmail,
        status,
        product.accessUrl,
        checkoutRow.preference_id,
        paymentId,
        product.id,
      ],
    );
  }

  const accessReady = items.every(
    ({ product }) => product.accessMode === "automatic",
  );
  const accessRequestRequired = items.some(
    ({ product }) => product.accessMode === "request",
  );
  return {
    recorded: true,
    providerStatus,
    paymentStatus: "paid",
    fulfillment: accessReady
      ? "ready"
      : accessRequestRequired
        ? "request_required"
        : "recorded_pending_access",
    accessReady,
    accessRequestRequired,
    buyerEmail,
    productIds: items.map(({ product }) => product.id),
    products: items.map(({ product, quantity }) => ({
      id: product.id,
      name: product.name,
      quantity,
      accessUrl: product.accessUrl,
      accessMode: product.accessMode,
    })),
    amountTotal: Number(checkoutRow.amount_total),
    currency: checkoutRow.currency,
  };
}

async function processMercadoPagoPayment(paymentId, expectedReference = "") {
  if (!isMercadoPagoConfigured() || !(await ensureDatabaseReady()))
    throw mercadoPagoProcessingError("mercado_pago_not_configured", 503);
  const payment = await getMercadoPagoPayment({
    accessToken: mercadoPagoAccessToken,
    paymentId,
  });
  if (String(payment.id || "") !== String(paymentId))
    throw mercadoPagoProcessingError("payment_integrity_error", 409);
  if (
    expectedReference &&
    String(payment.external_reference || "") !== String(expectedReference)
  )
    throw mercadoPagoProcessingError("payment_integrity_error", 409);
  const result = await persistMercadoPagoPayment(payment);
  if (result.recorded) {
    await sendEmailSafely(
      "order_confirmation",
      () =>
        sendOrderConfirmationEmail({
          checkoutId: `mercado-pago:${paymentId}`,
          email: result.buyerEmail,
          products: result.products,
          amountTotal: result.amountTotal,
          currency: result.currency,
        }),
      { mercadoPagoPaymentId: paymentId },
    );
  }
  return result;
}

function getMercadoPagoWebhookDataId(req) {
  try {
    return new URL(req.originalUrl, canonicalUrl).searchParams.get("data.id") || "";
  } catch {
    return "";
  }
}

async function handleMercadoPagoWebhook(req, res) {
  if (!isMercadoPagoConfigured())
    return res
      .status(503)
      .json({ ok: false, error: "webhook_not_configured" });
  const dataId = getMercadoPagoWebhookDataId(req);
  const bodyDataId = String(req.body?.data?.id || "");
  const requestId = String(req.get("x-request-id") || "");
  const signatureHeader = String(req.get("x-signature") || "");
  if (!dataId || (bodyDataId && bodyDataId.toLowerCase() !== dataId.toLowerCase()))
    return res.status(400).json({ ok: false, error: "invalid_notification" });
  if (
    !verifyMercadoPagoWebhookSignature({
      dataId,
      requestId,
      signatureHeader,
      secret: mercadoPagoWebhookSecret,
    })
  )
    return res.status(401).json({ ok: false, error: "invalid_signature" });

  const notificationType = String(
    req.body?.type || req.query?.type || req.query?.topic || "",
  ).toLowerCase();
  if (notificationType && notificationType !== "payment")
    return res.json({ received: true, processed: false });
  if (!isMercadoPagoPaymentId(dataId))
    return res.status(400).json({ ok: false, error: "invalid_payment_id" });

  try {
    const result = await processMercadoPagoPayment(dataId);
    logEvent("mercado_pago_notification_processed", {
      requestId: req.requestId,
      mercadoPagoPaymentId: dataId,
      providerStatus: result.providerStatus,
      productIds: result.productIds || [],
    });
    return res.json({ received: true, processed: true });
  } catch (error) {
    logError("mercado_pago_webhook_error", error, req.requestId);
    if (
      [
        "unknown_payment_reference",
        "payment_integrity_error",
        "duplicate_payment_reference",
        "payment_email_missing",
      ].includes(
        error?.code,
      ) ||
      (error?.statusCode === 404 && req.body?.live_mode === false)
    )
      return res.json({ received: true, processed: false });
    return res.status(error?.statusCode === 400 ? 400 : 502).json({
      ok: false,
      error: "payment_processing_failed",
      requestId: req.requestId,
    });
  }
}

async function persistPaidCheckout(checkout) {
  if (checkout.payment_status !== "paid")
    return {
      recorded: false,
      accessReady: false,
      accessRequestRequired: false,
      productIds: [],
    };

  const buyerEmail = String(
    checkout.customer_details?.email || checkout.customer_email || "",
  )
    .trim()
    .toLowerCase();
  if (!buyerEmail) throw new Error("Paid checkout session has no customer email");

  const catalog = getProductCatalog();
  const lineItems = checkout.line_items?.data || [];
  const metadataCart = parseCheckoutCartMetadata(
    checkout.metadata?.cart,
    catalog,
  );
  if (!lineItems.length) throw new Error("Paid checkout session has no line items");

  const resolvedItems = lineItems.map((item, index) => {
    const priceId = typeof item.price === "string" ? item.price : item.price?.id;
    const metadataItem = metadataCart[index];
    const product = resolveLineItemProduct(item, catalog, metadataItem);
    if (!product)
      throw new Error(`Unrecognized paid checkout item at index ${index}`);
    const quantity = Math.max(Number.parseInt(item.quantity, 10) || 1, 1);
    if (
      metadataItem &&
      (metadataItem.id !== product.id || metadataItem.quantity !== quantity)
    )
      throw new Error(`Checkout item metadata mismatch at index ${index}`);
    return { item, priceId, product, quantity };
  });

  for (const { item, priceId, product, quantity } of resolvedItems) {
    const amount = Number(item.amount_total || 0) / 100;
    const status = getOrderAccessStatus(product);
    const values = [
      buyerEmail,
      product.id,
      product.name,
      status,
      amount,
      quantity,
      product.image,
      product.accessUrl,
      checkout.id,
      priceId,
    ];
    await db.run(
      db.usePostgres
        ? "INSERT INTO orders (buyer_email, product_id, product, status, price, quantity, image, download_url, stripe_session_id, stripe_price_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING"
        : "INSERT OR IGNORE INTO orders (buyer_email, product_id, product, status, price, quantity, image, download_url, stripe_session_id, stripe_price_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
      values,
    );
    await db.run(
      db.usePostgres
        ? "UPDATE orders SET product_id = $1, status = $2, download_url = COALESCE(download_url, $3) WHERE stripe_session_id = $4 AND stripe_price_id = $5"
        : "UPDATE orders SET product_id = ?, status = ?, download_url = COALESCE(download_url, ?) WHERE stripe_session_id = ? AND stripe_price_id = ?",
      [product.id, status, product.accessUrl, checkout.id, priceId],
    );
  }
  return {
    recorded: true,
    accessReady: resolvedItems.every(
      ({ product }) => product.accessMode === "automatic",
    ),
    accessRequestRequired: resolvedItems.some(
      ({ product }) => product.accessMode === "request",
    ),
    productIds: resolvedItems.map(({ product }) => product.id),
    buyerEmail,
    products: resolvedItems.map(({ product, quantity }) => ({
      id: product.id,
      name: product.name,
      quantity,
      accessUrl: product.accessUrl,
      accessMode: product.accessMode,
    })),
    amountTotal: checkout.amount_total,
    currency: checkout.currency,
  };
}

async function fulfillCheckoutSession(sessionId) {
  if (!stripeClient || !db || !(await ensureDatabaseReady()))
    throw new Error("Fulfillment dependencies are not ready");
  const checkout = await stripeClient.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price.product"],
  });
  const fulfillment = await persistPaidCheckout(checkout);
  if (fulfillment.recorded) {
    await sendEmailSafely(
      "order_confirmation",
      () => sendOrderConfirmationEmail({
        checkoutId: checkout.id,
        email: fulfillment.buyerEmail,
        products: fulfillment.products,
        amountTotal: fulfillment.amountTotal,
        currency: fulfillment.currency,
      }),
      { checkoutSessionId: checkout.id },
    );
  }
  return fulfillment;
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
      const fulfillment = await fulfillCheckoutSession(event.data.object.id);
      logEvent("checkout_fulfilled", {
        requestId: req.requestId,
        stripeEventId: event.id,
        checkoutSessionId: event.data.object.id,
        productIds: fulfillment.productIds,
        accessReady: fulfillment.accessReady,
        accessRequestRequired: fulfillment.accessRequestRequired,
      });
    }
    return res.json({ received: true });
  } catch (error) {
    return next(error);
  }
}

app.get("/api/public-config", (req, res) =>
  res.json({
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "",
    mercadoPagoCheckoutEnabled: isMercadoPagoConfigured(),
  }),
);

app.get("/api/catalog", (req, res) => {
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  );
  return res.json({ products: toPublicCatalog(getProductCatalog()) });
});

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
    const { password, captcha, acceptTerms } = req.body || {};
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    if (!email || !password || !name || acceptTerms !== true)
      return res.status(400).json({ ok: false, error: "missing_fields" });
    if (!isValidEmail(email) || name.length < 2 || name.length > 80)
      return res
        .status(400)
        .json({ ok: false, error: "invalid_credentials_format" });
    if (!isStrongPassword(password))
      return res.status(400).json({ ok: false, error: "weak_password" });
    if (!(await verifyCaptcha(captcha, "register")))
      return res.status(400).json({ ok: false, error: "captcha_failed" });
    // Perform the expensive work on both paths to avoid the old fast duplicate
    // response. Automatic sign-in still makes success distinguishable; this is
    // enumeration reduction, not a substitute for email-ownership verification.
    const passwordHash = await bcrypt.hash(String(password), 12);
    if (await getUserSummaryByEmail(email))
      return res.status(400).json({ ok: false, error: "registration_unavailable" });
    let user;
    try {
      user = await createUser(
        email,
        passwordHash,
        "client",
        name,
        true,
      );
    } catch (error) {
      if (error?.code === "23505" || error?.code === "SQLITE_CONSTRAINT")
        return res.status(400).json({ ok: false, error: "registration_unavailable" });
      throw error;
    }
    await establishUserSession(req, user);
    await sendEmailSafely(
      "welcome",
      () => sendWelcomeEmail({ email, name }),
      { requestId: req.requestId },
    );
    return res.status(201).json({
      ok: true,
      authenticated: true,
      csrfToken: req.session.csrfToken,
    });
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
    if (!isValidEmail(email) || String(password).length > 128)
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    if (!(await verifyCaptcha(captcha, "login")))
      return res.status(400).json({ ok: false, error: "captcha_failed" });
    if (await isLocked(email))
      return res.status(429).json({ ok: false, error: "account_locked" });

    const user = await getUserAuthByEmail(email);
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
      let verified = false;
      try {
        verified = speakeasy.totp.verify({
          secret: decryptMfaSecret(user.mfa_secret),
          encoding: "base32",
          token: String(mfa_token),
          window: 1,
        });
      } catch (error) {
        logError("mfa_secret_error", error, req.requestId);
      }
      if (!verified) {
        await recordFailedLogin(email);
        return res.status(401).json({ ok: false, error: "mfa_failed" });
      }
    }

    await clearFailed(email);
    await db.run(
      db.usePostgres
        ? "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1"
        : "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [user.id],
    );
    await establishUserSession(req, user);
    return res.json({ ok: true, role: user.role, csrfToken: req.session.csrfToken });
  }),
);

app.post(
  "/api/mfa/setup",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const email = req.session.user.email;
    const user = await getUserSummaryByEmail(email);
    if (user?.mfa_enabled)
      return res.status(409).json({ ok: false, error: "mfa_already_enabled" });
    const secret = speakeasy.generateSecret({ name: `NeuralX (${email})` });
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    req.session.mfaTemp = { secret: secret.base32, issuedAt: Date.now() };
    await saveSession(req);
    return res.json({ ok: true, qr });
  }),
);

app.post(
  "/api/mfa/verify",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    if (
      !req.session.mfaTemp ||
      Date.now() - Number(req.session.mfaTemp.issuedAt || 0) > 10 * 60 * 1000
    ) {
      delete req.session.mfaTemp;
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const token = String(req.body?.token || "");
    if (!/^\d{6}$/.test(token))
      return res.status(400).json({ ok: false, error: "mfa_failed" });
    const secret = req.session.mfaTemp.secret;
    if (!speakeasy.totp.verify({ secret, encoding: "base32", token, window: 1 }))
      return res.status(400).json({ ok: false, error: "mfa_failed" });
    await db.run(
      db.usePostgres
        ? "UPDATE users SET mfa_enabled = true, mfa_secret = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2"
        : "UPDATE users SET mfa_enabled = 1, mfa_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?",
      [encryptMfaSecret(secret), req.session.user.email],
    );
    delete req.session.mfaTemp;
    await saveSession(req);
    return res.json({ ok: true });
  }),
);

app.post(
  "/api/mfa/disable",
  accountLimiter,
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "");
    const token = String(req.body?.token || "");
    if (!currentPassword || !/^\d{6}$/.test(token))
      return res.status(400).json({ ok: false, error: "missing_fields" });

    const user = await getUserAuthByEmail(req.session.user.email);
    if (!user?.mfa_enabled)
      return res.status(409).json({ ok: false, error: "mfa_not_enabled" });
    if (!(await bcrypt.compare(currentPassword, user.password_hash)))
      return res.status(401).json({ ok: false, error: "invalid_current_password" });

    let verified = false;
    try {
      verified = speakeasy.totp.verify({
        secret: decryptMfaSecret(user.mfa_secret),
        encoding: "base32",
        token,
        window: 1,
      });
    } catch (error) {
      logError("mfa_secret_error", error, req.requestId);
    }
    if (!verified)
      return res.status(401).json({ ok: false, error: "mfa_failed" });

    await db.run(
      db.usePostgres
        ? "UPDATE users SET mfa_enabled = false, mfa_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1"
        : "UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [user.id],
    );
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.user = { id: user.id, email: user.email, role: user.role };
    req.session.csrfToken = randomUUID();
    await saveSession(req);
    logEvent("mfa_disabled", { requestId: req.requestId, userId: user.id });
    return res.json({ ok: true, csrfToken: req.session.csrfToken });
  }),
);

app.post("/api/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });
    return res.json({ ok: true });
  });
});

app.get(
  "/api/me",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getUserSummaryByEmail(req.session.user.email);
    return res.json({
      ok: true,
      user: {
        email: req.session.user.email,
        role: req.session.user.role,
        name: user?.name || "Cliente Neural X",
        mfaEnabled: Boolean(user?.mfa_enabled),
      },
    });
  }),
);

app.post(
  "/api/profile",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (name.length < 2 || name.length > 80)
      return res.status(400).json({ ok: false, error: "missing_name" });
    await db.run(
      db.usePostgres
        ? "UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2"
        : "UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?",
      [name, req.session.user.email],
    );
    return res.json({
      ok: true,
      user: {
        email: req.session.user.email,
        role: req.session.user.role,
        name,
      },
    });
  }),
);

app.post(
  "/api/account/password",
  accountLimiter,
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!currentPassword || !newPassword)
      return res.status(400).json({ ok: false, error: "missing_fields" });
    if (!isStrongPassword(newPassword))
      return res.status(400).json({ ok: false, error: "weak_password" });
    if (currentPassword === newPassword)
      return res.status(400).json({ ok: false, error: "password_unchanged" });

    const user = await getUserAuthByEmail(req.session.user.email);
    const matches = user
      ? await bcrypt.compare(currentPassword, user.password_hash)
      : false;
    if (!matches)
      return res.status(401).json({ ok: false, error: "invalid_current_password" });

    const hash = await bcrypt.hash(newPassword, 12);
    await db.run(
      db.usePostgres
        ? "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2"
        : "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [hash, user.id],
    );
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.user = { id: user.id, email: user.email, role: user.role };
    req.session.csrfToken = randomUUID();
    await saveSession(req);
    return res.json({ ok: true, csrfToken: req.session.csrfToken });
  }),
);

app.post(
  "/api/leads",
  leadLimiter,
  asyncHandler(requireDatabase),
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const interest = String(req.body?.interest || "");
    const marketingConsent = req.body?.marketingConsent === true;
    if (
      name.length < 2 ||
      name.length > 80 ||
      !isValidEmail(email) ||
      !leadInterests.has(interest) ||
      !marketingConsent
    )
      return res.status(400).json({ ok: false, error: "invalid_lead" });
    if (!(await verifyCaptcha(req.body?.captcha, "lead")))
      return res.status(400).json({ ok: false, error: "captcha_failed" });

    const attribution = normalizeAttribution(req.body?.attribution);
    const values = [
      email,
      name,
      interest,
      attribution.utm_source || null,
      attribution.utm_medium || null,
      attribution.utm_campaign || null,
      attribution.utm_content || null,
      attribution.utm_term || null,
      attribution.landing_page || null,
      attribution.referrer || null,
    ];
    await db.run(
      db.usePostgres
        ? `INSERT INTO leads (email, name, interest, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, interest = EXCLUDED.interest, status = 'Novo', marketing_consent_at = CURRENT_TIMESTAMP, utm_source = EXCLUDED.utm_source, utm_medium = EXCLUDED.utm_medium, utm_campaign = EXCLUDED.utm_campaign, utm_content = EXCLUDED.utm_content, utm_term = EXCLUDED.utm_term, landing_page = EXCLUDED.landing_page, referrer = EXCLUDED.referrer, updated_at = CURRENT_TIMESTAMP`
        : `INSERT INTO leads (email, name, interest, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(email) DO UPDATE SET name = excluded.name, interest = excluded.interest, status = 'Novo', marketing_consent_at = CURRENT_TIMESTAMP, utm_source = excluded.utm_source, utm_medium = excluded.utm_medium, utm_campaign = excluded.utm_campaign, utm_content = excluded.utm_content, utm_term = excluded.utm_term, landing_page = excluded.landing_page, referrer = excluded.referrer, updated_at = CURRENT_TIMESTAMP`,
      values,
    );
    const recommendation = leadInterests.get(interest);
    const emailDelivery = await sendEmailSafely(
      "recommendation",
      () => sendRecommendationEmail({ email, name, recommendation }),
      { requestId: req.requestId },
    );
    return res.status(201).json({
      ok: true,
      recommendation,
      emailSent: Boolean(emailDelivery?.sent),
    });
  }),
);

app.post(
  "/api/support",
  supportLimiter,
  asyncHandler(requireDatabase),
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const category = String(req.body?.category || "");
    const orderReference = String(req.body?.orderReference || "").trim();
    const message = String(req.body?.message || "").trim();
    const privacyConsent = req.body?.privacyConsent === true;

    if (
      name.length < 2 ||
      name.length > 80 ||
      !isValidEmail(email) ||
      !supportCategories.has(category) ||
      orderReference.length > 100 ||
      message.length < 20 ||
      message.length > 2_000 ||
      !privacyConsent
    )
      return res.status(400).json({ ok: false, error: "invalid_support_request" });
    if (!(await verifyCaptcha(req.body?.captcha, "support")))
      return res.status(400).json({ ok: false, error: "captcha_failed" });

    const values = [
      email,
      name,
      category,
      supportCategories.get(category),
      orderReference || null,
      message,
    ];
    const ticket = await db.run(
      db.usePostgres
        ? "INSERT INTO support_tickets (requester_email, requester_name, category, subject, order_reference, message) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"
        : "INSERT INTO support_tickets (requester_email, requester_name, category, subject, order_reference, message) VALUES (?, ?, ?, ?, ?, ?)",
      values,
    );
    const ticketId = String(ticket?.id || ticket?.lastID || "");
    logEvent("support_ticket_created", {
      requestId: req.requestId,
      ticketId,
      category,
    });
    await Promise.all([
      sendEmailSafely(
        "support_confirmation",
        () => sendSupportConfirmationEmail({
          email,
          name,
          ticketId,
          subject: supportCategories.get(category),
        }),
        { requestId: req.requestId, ticketId },
      ),
      sendEmailSafely(
        "support_notification",
        () => sendSupportNotificationEmail({
          email,
          name,
          ticketId,
          subject: supportCategories.get(category),
          orderReference,
          message,
        }),
        { requestId: req.requestId, ticketId },
      ),
    ]);
    return res.status(201).json({
      ok: true,
      ticketId,
    });
  }),
);

app.get(
  "/api/support-tickets",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      db.usePostgres
        ? "SELECT id, subject, status, created_at FROM support_tickets WHERE requester_email = $1 ORDER BY created_at DESC LIMIT 50"
        : "SELECT id, subject, status, created_at FROM support_tickets WHERE requester_email = ? ORDER BY created_at DESC LIMIT 50",
      [req.session.user.email],
    );
    return res.json(rows);
  }),
);

app.get(
  "/api/orders",
  asyncHandler(requireDatabase),
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      db.usePostgres
        ? "SELECT id, product_id, product, status, price, quantity, image, download_url, payment_provider, created_at FROM orders WHERE buyer_email = $1 ORDER BY created_at DESC LIMIT 100"
        : "SELECT id, product_id, product, status, price, quantity, image, download_url, payment_provider, created_at FROM orders WHERE buyer_email = ? ORDER BY created_at DESC LIMIT 100",
      [req.session.user.email],
    );
    const catalog = getProductCatalog();
    return res.json(
      rows.map((order) => {
        const currentProduct = catalog[order.product_id];
        const accessRevoked = isOrderAccessRevoked(order.status);
        const currentAccessUrl = accessRevoked
          ? null
          : currentProduct?.accessUrl || null;
        const downloadUrl = accessRevoked
          ? null
          : order.download_url || currentAccessUrl;
        const accessMode = accessRevoked
          ? "revoked"
          : currentProduct
            ? currentProduct.accessMode === "pending" && order.download_url
              ? "automatic"
              : currentProduct.accessMode
            : order.download_url
              ? "automatic"
              : "pending";
        return {
          ...order,
          status: currentProduct && !accessRevoked
            ? getOrderAccessStatus({ ...currentProduct, accessMode })
            : order.status,
          access_mode: accessMode,
          download_url: downloadUrl,
        };
      }),
    );
  }),
);

app.post(
  "/api/create-checkout-session",
  checkoutLimiter,
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
    if (!(await validateStripeCatalog()))
      return res.status(503).json({
        ok: false,
        error: "stripe_catalog_invalid",
        requestId: req.requestId,
      });

    const catalog = getProductCatalog();
    const cart = Array.isArray(req.body?.cart) ? req.body.cart : [];
    const attribution = normalizeAttribution(req.body?.attribution);
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
          mode: "payment",
          locale: "pt-BR",
          integration_identifier: "neural_x_qmvkzpta",
          line_items: lineItems,
          customer_email: req.session.user?.email || undefined,
          client_reference_id: req.session.user?.id
            ? String(req.session.user.id)
            : undefined,
          success_url: `${canonicalUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${canonicalUrl}/cart.html?checkout=cancelled`,
          after_expiration: { recovery: { enabled: true } },
          custom_text: {
            submit: {
              message: "Use um e-mail que você acessa. O link de download e as instruções de ativação serão enviados a esse endereço em até 4 horas. A licença digital fica vinculada ao computador usado na ativação.",
            },
          },
          metadata: {
            source: "neural-x-site",
            catalog_version: "2026-08-23",
            license_type: "digital",
            device_binding: "computer",
            cart: JSON.stringify(
              cart.map(({ id, quantity }) => ({ id, quantity })),
            ),
            ...attribution,
          },
        },
        { idempotencyKey: `checkout-${idempotencyKey}` },
      );
      logEvent("checkout_created", {
        requestId: req.requestId,
        checkoutSessionId: checkout.id,
        productIds: cart.map((item) => item.id),
        itemCount: cart.reduce((total, item) => total + item.quantity, 0),
      });
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

app.post(
  "/api/create-mercado-pago-checkout",
  checkoutLimiter,
  asyncHandler(requireDatabase),
  asyncHandler(async (req, res) => {
    if (!isMercadoPagoConfigured())
      return res.status(503).json({
        ok: false,
        error: "mercado_pago_not_configured",
        requestId: req.requestId,
      });

    const catalog = getProductCatalog();
    const cart = Array.isArray(req.body?.cart) ? req.body.cart : [];
    const cartIds = cart.map((item) => item?.id);
    if (
      cart.length < 1 ||
      cart.length > Object.keys(catalog).length ||
      new Set(cartIds).size !== cart.length
    )
      return res.status(400).json({
        ok: false,
        error: "invalid_cart",
        requestId: req.requestId,
      });

    const resolvedItems = cart.map((item) => {
      const product = catalog[String(item?.id || "")];
      const quantity = Number.parseInt(item?.quantity, 10);
      if (
        !product ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      )
        return null;
      return { product, quantity, unitAmount: product.unitAmount };
    });
    if (resolvedItems.some((item) => !item))
      return res.status(400).json({
        ok: false,
        error: "invalid_cart",
        requestId: req.requestId,
      });

    const reference = `nx_${randomUUID()}`;
    const amountTotal = resolvedItems.reduce(
      (total, item) => total + item.unitAmount * item.quantity,
      0,
    );
    const attribution = normalizeAttribution(req.body?.attribution);
    const buyerEmail = String(req.session.user?.email || "")
      .trim()
      .toLowerCase();
    const storedCart = resolvedItems.map(({ product, quantity, unitAmount }) => ({
      id: product.id,
      quantity,
      unitAmount,
    }));

    await db.run(
      db.usePostgres
        ? "INSERT INTO payment_checkouts (reference, provider, status, buyer_email, cart_json, amount_total, currency, attribution_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"
        : "INSERT INTO payment_checkouts (reference, provider, status, buyer_email, cart_json, amount_total, currency, attribution_json) VALUES (?,?,?,?,?,?,?,?)",
      [
        reference,
        "mercado_pago",
        "creating_preference",
        isValidEmail(buyerEmail) ? buyerEmail : null,
        JSON.stringify(storedCart),
        amountTotal,
        "BRL",
        JSON.stringify(attribution),
      ],
    );

    try {
      const preference = await createMercadoPagoPreference({
        accessToken: mercadoPagoAccessToken,
        idempotencyKey: reference,
        preference: {
          items: resolvedItems.map(({ product, quantity, unitAmount }) => ({
            id: product.id,
            title: product.name,
            description: product.licenseType,
            picture_url: `${canonicalUrl}${product.image}`,
            quantity,
            currency_id: "BRL",
            unit_price: unitAmount / 100,
          })),
          payer: isValidEmail(buyerEmail) ? { email: buyerEmail } : undefined,
          back_urls: {
            success: `${canonicalUrl}/success.html?provider=mercado_pago&result=approved&external_reference=${encodeURIComponent(reference)}`,
            pending: `${canonicalUrl}/success.html?provider=mercado_pago&result=pending&external_reference=${encodeURIComponent(reference)}`,
            failure: `${canonicalUrl}/success.html?provider=mercado_pago&result=failure&external_reference=${encodeURIComponent(reference)}`,
          },
          auto_return: "approved",
          binary_mode: false,
          external_reference: reference,
          notification_url: `${canonicalUrl}/api/mercado-pago-webhook`,
          statement_descriptor: "NEURAL X",
          metadata: { source: "neural-x-site", checkout_reference: reference },
        },
      });
      await db.run(
        db.usePostgres
          ? "UPDATE payment_checkouts SET preference_id = $1, status = 'preference_created', updated_at = CURRENT_TIMESTAMP WHERE reference = $2"
          : "UPDATE payment_checkouts SET preference_id = ?, status = 'preference_created', updated_at = CURRENT_TIMESTAMP WHERE reference = ?",
        [preference.id, reference],
      );
      logEvent("mercado_pago_checkout_created", {
        requestId: req.requestId,
        preferenceId: preference.id,
        productIds: resolvedItems.map(({ product }) => product.id),
        itemCount: resolvedItems.reduce(
          (total, item) => total + item.quantity,
          0,
        ),
      });
      return res.json({ ok: true, url: preference.url });
    } catch (error) {
      await db
        .run(
          db.usePostgres
            ? "UPDATE payment_checkouts SET status = 'preference_failed', updated_at = CURRENT_TIMESTAMP WHERE reference = $1"
            : "UPDATE payment_checkouts SET status = 'preference_failed', updated_at = CURRENT_TIMESTAMP WHERE reference = ?",
          [reference],
        )
        .catch(() => {});
      logError("mercado_pago_checkout_error", error, req.requestId);
      return res.status(502).json({
        ok: false,
        error:
          [401, 403].includes(error?.statusCode)
            ? "mercado_pago_authentication_error"
            : "mercado_pago_error",
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
        expand: ["line_items.data.price.product"],
      });
      if (checkout.metadata?.source !== "neural-x-site")
        return res.status(404).json({ ok: false, error: "session_not_found" });
      let fulfillment = "not_paid";
      let deliveredProducts = [];
      if (checkout.payment_status === "paid") {
        try {
          if (!db || !(await ensureDatabaseReady()))
            throw new Error("Fulfillment database is not ready");
          const fulfillmentResult = await persistPaidCheckout(checkout);
          if (fulfillmentResult.recorded)
            deliveredProducts = fulfillmentResult.products;
          fulfillment = fulfillmentResult.accessReady
            ? "ready"
            : fulfillmentResult.accessRequestRequired
              ? "request_required"
            : fulfillmentResult.recorded
              ? "recorded_pending_access"
              : "pending";
        } catch (error) {
          fulfillment = "pending";
          logError("checkout_return_fulfillment_error", error, req.requestId);
        }
      }
      const responseCatalog = getProductCatalog();
      const responseMetadataCart = parseCheckoutCartMetadata(
        checkout.metadata?.cart,
        responseCatalog,
      );
      const includeUserData = String(req.query.include_user_data || "") === "1";
      const enhancedEmailHash =
        includeUserData && checkout.payment_status === "paid"
          ? hashEnhancedConversionEmail(
              checkout.customer_details?.email || checkout.customer_email,
            )
          : "";
      const userData = enhancedEmailHash
        ? { sha256_email_address: enhancedEmailHash }
        : null;
      return res.json({
        ok: true,
        status: checkout.status,
        paymentStatus: checkout.payment_status,
        amountTotal: checkout.amount_total,
        currency: checkout.currency,
        fulfillment,
        ...(userData ? { userData } : {}),
        products: (checkout.line_items?.data || []).map((item, index) => {
            const product = resolveLineItemProduct(
            item,
            responseCatalog,
            responseMetadataCart[index],
          );
          return {
            id: product?.id || "",
            name: product?.name || item.description,
            quantity: item.quantity,
            // A session ID alone never unlocks a product: Stripe must confirm
            // payment and the order must be persisted before returning access.
            accessUrl: deliveredProducts.find((entry) => entry.id === product?.id)?.accessUrl || null,
            accessMode: deliveredProducts.find((entry) => entry.id === product?.id)?.accessMode || "pending",
          };
        }),
      });
    } catch (error) {
      logError("stripe_session_lookup_error", error, req.requestId);
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }
  }),
);

app.get(
  "/api/mercado-pago-payment",
  checkoutLimiter,
  asyncHandler(async (req, res) => {
    const paymentId = String(req.query.payment_id || "");
    const reference = String(req.query.external_reference || "");
    if (!isMercadoPagoPaymentId(paymentId) || !isMercadoPagoReference(reference))
      return res.status(400).json({
        ok: false,
        error: "invalid_payment_reference",
        requestId: req.requestId,
      });
    try {
      const result = await processMercadoPagoPayment(paymentId, reference);
      const includeUserData = String(req.query.include_user_data || "") === "1";
      const enhancedEmailHash =
        includeUserData && result.paymentStatus === "paid"
          ? hashEnhancedConversionEmail(result.buyerEmail)
          : "";
      const userData = enhancedEmailHash
        ? { sha256_email_address: enhancedEmailHash }
        : null;
      return res.json({
        ok: true,
        provider: "mercado_pago",
        status: result.providerStatus,
        paymentStatus: result.paymentStatus,
        amountTotal: result.amountTotal,
        currency: result.currency,
        fulfillment: result.fulfillment,
        products: result.products.map(({ id, name, quantity, accessUrl, accessMode }) => ({
          id,
          name,
          quantity,
          accessUrl: result.paymentStatus === "paid" && result.recorded ? accessUrl : null,
          accessMode: result.paymentStatus === "paid" && result.recorded ? accessMode : "pending",
        })),
      });
    } catch (error) {
      logError("mercado_pago_payment_lookup_error", error, req.requestId);
      const statusCode =
        error?.code === "unknown_payment_reference" || error?.statusCode === 404
          ? 404
          : ["payment_integrity_error", "duplicate_payment_reference"].includes(
                error?.code,
              )
            ? 409
            : error?.statusCode === 503
              ? 503
              : 502;
      return res.status(statusCode).json({
        ok: false,
        error:
          statusCode === 404
            ? "payment_not_found"
            : statusCode === 409
              ? "payment_verification_failed"
              : statusCode === 503
                ? "mercado_pago_not_configured"
                : "mercado_pago_error",
        requestId: req.requestId,
      });
    }
  }),
);

app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    const [databaseInitialized, redisConnected, stripeCatalogHealthy] = await Promise.all([
      ensureDatabaseReady(),
      ensureRedisReady(),
      stripeClient && runtimeConfig.errors.length === 0
        ? validateStripeCatalog()
        : Promise.resolve(false),
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
      (!isProduction || stripeCatalogHealthy) &&
      runtimeConfig.errors.length === 0;
    const emailConfig = getEmailConfig();
    return res.status(ok ? 200 : 503).json({
      ok,
      services: {
        database: databaseHealthy ? "ok" : "unavailable",
        redis: redisHealthy ? "ok" : isProduction ? "unavailable" : "optional",
        stripe: stripeCatalogHealthy ? "ok" : "unavailable",
        mercadoPago: isMercadoPagoConfigured()
          ? "configured"
          : mercadoPagoAccessToken && !mercadoPagoWebhookSecret
            ? "pending_webhook_secret"
            : !mercadoPagoAccessToken && mercadoPagoWebhookSecret
              ? "pending_access_token"
              : hasConfigurationError(
                    "MERCADO_PAGO_ACCESS_TOKEN",
                    "MERCADO_PAGO_WEBHOOK_SECRET",
                  )
                ? "misconfigured"
                : "optional",
        email: emailConfig.apiKey ? "configured" : "optional",
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
  return res.status(404).sendFile(path.join(root, "404.html"));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  logError("request_error", error, req.requestId);
  if (error?.type === "entity.too.large")
    return res.status(413).json({
      ok: false,
      error: "payload_too_large",
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
