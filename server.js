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
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const { createClient } = require('redis');

const PORT = process.env.PORT || 4173;
const root = process.cwd();
const uploadsDir = path.join(root, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Setup DB (sqlite)
const dbFile = path.join(root, 'data.sqlite');
const db = new sqlite3.Database(dbFile);

// Initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_email TEXT NOT NULL,
    product TEXT NOT NULL,
    status TEXT NOT NULL,
    price REAL,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed demo users if not exist
  db.get(`SELECT COUNT(1) as c FROM users`, (err, row) => {
    if (err) return console.error('DB check users error', err);
    if (row && row.c === 0) {
      const insert = db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`);
      const demoPassword = 'neuralx123';
      const sellerPassword = 'neuralx123';
      const saltRounds = 10;
      bcrypt.hash(demoPassword, saltRounds).then(hash => {
        insert.run('demo@neuralx.com', hash, 'client');
        bcrypt.hash(sellerPassword, saltRounds).then(hash2 => {
          insert.run('seller@neuralx.com', hash2, 'seller');
          insert.finalize();
          // Seed a demo order
          db.run(`INSERT INTO orders (buyer_email, product, status, price, image) VALUES (?, ?, ?, ?, ?)`,
            ['demo@neuralx.com', 'Pacote Neural X', 'Enviado', 199.9, '/assets/placeholder.png']);
        });
      }).catch(console.error);
    }
  });
});

const app = express();

// Security headers
app.use(helmet());

// JSON limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Redis client and session store
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });
redisClient.connect().catch((err) => console.error('Redis connect error', err));
const RedisStore = RedisStoreFactory(session);

app.set('trust proxy', 1);
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));

// CSRF protection (cookie-based)
app.use(csurf({ cookie: true }));

// Rate limiter (general)
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use(generalLimiter);

// Rate limiter for login
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Multer for uploads
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
    cb(null, true);
  }
});

// Serve static frontend and uploads
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(root)));

// Helper: require auth
function requireAuth(req, res, next) {
  if (req.session && req.session.user && req.session.user.email) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

// Expose CSRF token for clients (GET should be safe)
app.get('/api/csrf-token', (req, res) => {
  try {
    res.json({ csrfToken: req.csrfToken() });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'csrf_error' });
  }
});

// API: register
app.post('/api/register', async (req, res) => {
  const { email, password, role = 'client' } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'missing_fields' });
  // simple validation
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ ok: false, error: 'invalid_types' });
  try {
    db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
      if (err) return res.status(500).json({ ok: false, error: 'db_error' });
      if (row) return res.status(409).json({ ok: false, error: 'email_taken' });
      const saltRounds = 10;
      bcrypt.hash(password, saltRounds).then(hash => {
        db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, role], function(err2) {
          if (err2) return res.status(500).json({ ok: false, error: 'db_error' });
          res.json({ ok: true, id: this.lastID, email, role });
        });
      }).catch(e => res.status(500).json({ ok: false, error: 'hash_error' }));
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// API: login
app.post('/api/login/:role', loginLimiter, (req, res) => {
  const role = req.params.role;
  const { email, password, hp } = req.body || {};
  if (hp) return res.status(400).json({ ok: false, error: 'bot_detected' });
  if (!email || !password) return res.status(400).json({ ok: false, error: 'missing_fields' });

  db.get('SELECT id, email, password_hash, role FROM users WHERE email = ?', [email], (err, user) => {
    if (err) return res.status(500).json({ ok: false, error: 'db_error' });
    if (!user) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    if (user.role !== role) return res.status(401).json({ ok: false, error: 'invalid_role' });
    bcrypt.compare(password, user.password_hash).then(match => {
      if (!match) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
      // set session
      req.session.user = { id: user.id, email: user.email, role: user.role };
      return res.json({ ok: true, role: user.role });
    }).catch(e => res.status(500).json({ ok: false, error: 'bcrypt_error' }));
  });
});

// API: logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// API: current user
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  res.json({ ok: true, user: { email: req.session.user.email, role: req.session.user.role } });
});

// API: orders for current user
app.get('/api/orders', requireAuth, (req, res) => {
  const email = req.session.user.email;
  db.all('SELECT id, product, status, price, image FROM orders WHERE buyer_email = ?', [email], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: 'db_error' });
    res.json(rows);
  });
});

// API: upload (image) - requires auth
app.post('/api/uploads', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no_file' });
  // rename file to uuid + ext
  const ext = path.extname(req.file.originalname) || '';
  const filename = uuidv4() + ext;
  const dest = path.join(uploadsDir, filename);
  fs.rename(req.file.path, dest, (err) => {
    if (err) return res.status(500).json({ ok: false, error: 'save_error' });
    const url = '/uploads/' + filename;
    res.json({ ok: true, url });
  });
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Fallback - serve index.html
app.get('*', (req, res) => {
  const index = path.join(root, 'index.html');
  res.sendFile(index);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
