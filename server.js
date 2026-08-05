const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const session = require('express-session');
const RedisStoreFactory = require('connect-redis');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const { createClient } = require('redis');
const db = require('./lib/db');
const fetch = global.fetch || require('node-fetch');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const PORT = process.env.PORT || 4173;
const root = process.cwd();
const uploadsDir = path.join(root, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// init db sqlite if used
db.initSqlite().catch(() => {});

// Redis and session store
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });
redisClient.connect().catch((err) => console.error('Redis connect error', err));
const RedisStore = RedisStoreFactory(session);

const app = express();
app.set('trust proxy', 1);

// Helmet with CSP tightened
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  }
}));

// body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// sessions
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));

// CSRF
app.use(csurf({ cookie: true }));

// rate limiters
app.use(rateLimit({ windowMs: 60 * 1000, max: 500 }));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// uploads
const upload = multer({ dest: uploadsDir, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
  cb(null, true);
}});

// serve static and uploads
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(root)));

// helpers: account lockout using Redis
async function recordFailedLogin(email) {
  try {
    const key = `login:fail:${email}`;
    const v = await redisClient.incr(key);
    if (v === 1) await redisClient.expire(key, 15 * 60); // 15 min window
    if (v >= 5) await redisClient.set(`login:lock:${email}`, '1', { EX: 30 * 60 }); // lock 30 min
    return v;
  } catch (e) { console.error('redis err', e); }
}
async function isLocked(email) {
  try { return await redisClient.get(`login:lock:${email}`) === '1'; } catch { return false; }
}
async function clearFailed(email) {
  try { await redisClient.del(`login:fail:${email}`); await redisClient.del(`login:lock:${email}`); } catch { }
}

// captcha verification
async function verifyCaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // no captcha configured: bypass (but recommend to set)
  try {
    const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`
    });
    const data = await res.json();
    return data.success === true && data.score && data.score >= 0.3;
  } catch (e) { console.error('captcha verify err', e); return false; }
}

// helper db functions
async function getUserByEmail(email) {
  if (!email) return null;
  const row = await db.getOne(db.usePostgres ? 'SELECT * FROM users WHERE email = $1' : 'SELECT * FROM users WHERE email = ?', [email]);
  return row;
}
async function createUser(email, hash, role='client') {
  if (db.usePostgres) {
    const res = await db.run('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [email, hash, role]);
    return res;
  }
  const res = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, role]);
  return res;
}

// expose csrf token
app.get('/api/csrf-token', (req, res) => {
  try { res.json({ csrfToken: req.csrfToken() }); } catch (e) { res.status(500).json({ ok: false, error: 'csrf_error' }); }
});

// register
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, captcha } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'missing_fields' });
    if (!await verifyCaptcha(captcha)) return res.status(400).json({ ok: false, error: 'captcha_failed' });
    const exists = await getUserByEmail(email);
    if (exists) return res.status(409).json({ ok: false, error: 'email_taken' });
    const hash = await bcrypt.hash(password, 10);
    await createUser(email, hash);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'server_error' }); }
});

// login
app.post('/api/login/:role', loginLimiter, async (req, res) => {
  try {
    const role = req.params.role;
    const { email, password, captcha, mfa_token } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'missing_fields' });
    if (!await verifyCaptcha(captcha)) return res.status(400).json({ ok: false, error: 'captcha_failed' });
    if (await isLocked(email)) return res.status(429).json({ ok: false, error: 'account_locked' });
    const user = await getUserByEmail(email);
    if (!user) { await recordFailedLogin(email); return res.status(401).json({ ok: false, error: 'invalid_credentials' }); }
    if (user.role !== role) { await recordFailedLogin(email); return res.status(401).json({ ok: false, error: 'invalid_role' }); }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) { await recordFailedLogin(email); return res.status(401).json({ ok: false, error: 'invalid_credentials' }); }

    // if MFA enabled, verify token
    if (user.mfa_enabled) {
      if (!mfa_token) return res.status(400).json({ ok: false, error: 'mfa_required' });
      const verified = speakeasy.totp.verify({ secret: user.mfa_secret, encoding: 'base32', token: String(mfa_token) });
      if (!verified) { await recordFailedLogin(email); return res.status(401).json({ ok: false, error: 'mfa_failed' }); }
    }

    // success
    await clearFailed(email);
    req.session.user = { id: user.id, email: user.email, role: user.role };
    res.json({ ok: true, role: user.role });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'server_error' }); }
});

// MFA setup (requires authentication)
app.post('/api/mfa/setup', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const email = req.session.user.email;
  const secret = speakeasy.generateSecret({ name: `NeuralX (${email})` });
  const otpauth = secret.otpauth_url;
  const qr = await qrcode.toDataURL(otpauth);
  // store secret temporarily in session until verified
  req.session.mfaTemp = { secret: secret.base32 };
  res.json({ ok: true, qr, secret: secret.base32 });
});

app.post('/api/mfa/verify', async (req, res) => {
  if (!req.session.user || !req.session.mfaTemp) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const { token } = req.body || {};
  const email = req.session.user.email;
  const secret = req.session.mfaTemp.secret;
  const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token: String(token) });
  if (!verified) return res.status(400).json({ ok: false, error: 'mfa_failed' });
  // persist to user
  if (db.usePostgres) {
    await db.run('UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE email = $2', [secret, email]);
  } else {
    await db.run('UPDATE users SET mfa_enabled = 1, mfa_secret = ? WHERE email = ?', [secret, email]);
  }
  delete req.session.mfaTemp;
  res.json({ ok: true });
});

// logout
app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

// me
app.get('/api/me', (req, res) => { if (!req.session.user) return res.status(401).json({ ok: false, error: 'unauthorized' }); res.json({ ok: true, user: { email: req.session.user.email, role: req.session.user.role } }); });

// orders
app.get('/api/orders', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const email = req.session.user.email;
  try {
    const rows = await db.query(db.usePostgres ? 'SELECT id, product, status, price, image FROM orders WHERE buyer_email = $1' : 'SELECT id, product, status, price, image FROM orders WHERE buyer_email = ?', [email]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'db_error' }); }
});

// uploads
app.post('/api/uploads', (req, res, next) => { if (!req.session.user) return res.status(401).json({ ok: false, error: 'unauthorized' }); next(); }, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no_file' });
  const ext = path.extname(req.file.originalname) || '';
  const filename = uuidv4() + ext;
  const dest = path.join(uploadsDir, filename);
  fs.rename(req.file.path, dest, (err) => { if (err) return res.status(500).json({ ok: false, error: 'save_error' }); res.json({ ok: true, url: '/uploads/' + filename }); });
});

// Stripe checkout endpoint (server-side only)
app.post('/api/create-checkout-session', async (req, res) => {
  const stripeSecret = process.env.STRIPE_SECRET;
  if (!stripeSecret) return res.status(501).json({ ok: false, error: 'stripe_not_configured' });
  const stripe = require('stripe')(stripeSecret);
  const { priceId } = req.body || {};
  if (!priceId) return res.status(400).json({ ok: false, error: 'missing_price' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.protocol}://${req.get('host')}/success.html`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel.html`
    });
    res.json({ ok: true, url: session.url });
  } catch (e) { console.error('stripe err', e); res.status(500).json({ ok: false, error: 'stripe_error' }); }
});

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// fallback
app.get('*', (req, res) => { res.sendFile(path.join(root, 'index.html')); });

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
