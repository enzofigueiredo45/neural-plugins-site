const { Pool } = require("pg");

let sqlite3;
const path = require("path");
const fs = require("fs");

const root = process.cwd();
const sqliteFile = process.env.SQLITE_FILE || path.join(root, "data.sqlite");

const databaseUrl = process.env.DATABASE_URL || "";
const usePostgres = !!databaseUrl;

let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
  const poolMax = Math.min(
    Math.max(Number.parseInt(process.env.DATABASE_POOL_MAX || "3", 10) || 3, 1),
    10,
  );
  pgPool = new Pool({
    connectionString: databaseUrl,
    max: poolMax,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    application_name: "neural-x-store",
    allowExitOnIdle: true,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  pgPool.on("error", (err) =>
    console.error("Postgres pool error", {
      name: err?.name,
      code: err?.code,
      message: err?.message,
    }),
  );
} else {
  sqlite3 = require("sqlite3").verbose();

  if (!fs.existsSync(sqliteFile)) {
    fs.writeFileSync(sqliteFile, "");
  }

  sqliteDb = new sqlite3.Database(sqliteFile);
}

async function query(text, params) {
  if (usePostgres) {
    const res = await pgPool.query(text, params);
    return res.rows;
  }
  return new Promise((resolve, reject) => {
    sqliteDb.all(text, params || [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function getOne(text, params) {
  const rows = await query(text, params);
  return rows && rows.length ? rows[0] : null;
}

async function run(text, params) {
  if (usePostgres) {
    const res = await pgPool.query(text, params);
    return res.rows?.[0] || null;
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(text, params || [], function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function initPostgres() {
  await pgPool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    name TEXT,
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret TEXT,
    email_verified_at TIMESTAMPTZ,
    auth_version INTEGER NOT NULL DEFAULT 1,
    terms_accepted_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    buyer_email TEXT NOT NULL,
    product_id TEXT,
    product TEXT NOT NULL,
    status TEXT NOT NULL,
    price NUMERIC(10,2),
    image TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query(`CREATE TABLE IF NOT EXISTS account_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'password_reset')),
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query(`CREATE TABLE IF NOT EXISTS email_outbox (
    id BIGSERIAL PRIMARY KEY,
    dedupe_key TEXT UNIQUE NOT NULL,
    email_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query(`CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGSERIAL PRIMARY KEY,
    requester_email TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    order_reference TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Aberto',
    consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query(`CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    interest TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Novo',
    recommendation_requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    marketing_consent_at TIMESTAMPTZ,
    marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    landing_page TEXT,
    referrer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT");
  await pgPool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ",
  );
  await pgPool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
  );
  await pgPool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP",
  );
  await pgPool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ",
  );
  await pgPool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1",
  );
  await pgPool.query(
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_id TEXT",
  );
  await pgPool.query(
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1",
  );
  await pgPool.query(
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT",
  );
  await pgPool.query(
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_price_id TEXT",
  );
  await pgPool.query(
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
  );
  await pgPool.query(
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommendation_requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP",
  );
  await pgPool.query(
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false",
  );
  await pgPool.query(
    "UPDATE leads SET marketing_opt_in = true WHERE marketing_consent_at IS NOT NULL AND marketing_opt_in = false",
  );
  await pgPool.query(
    "ALTER TABLE leads ALTER COLUMN marketing_consent_at DROP NOT NULL",
  );
  await pgPool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_price_idx ON orders (stripe_session_id, stripe_price_id) WHERE stripe_session_id IS NOT NULL AND stripe_price_id IS NOT NULL",
  );
  await pgPool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_product_idx ON orders (stripe_session_id, product_id) WHERE stripe_session_id IS NOT NULL AND product_id IS NOT NULL",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS orders_buyer_created_idx ON orders (buyer_email, created_at DESC)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders (user_id, created_at DESC)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS account_tokens_user_purpose_idx ON account_tokens (user_id, purpose, created_at DESC)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON email_outbox (status, available_at, created_at)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS support_tickets_email_created_idx ON support_tickets (requester_email, created_at DESC)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS leads_status_created_idx ON leads (status, created_at DESC)",
  );
}

async function initSqlite() {
  if (usePostgres) return initPostgres();
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      name TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      mfa_secret TEXT,
      email_verified_at DATETIME,
      auth_version INTEGER NOT NULL DEFAULT 1,
      terms_accepted_at DATETIME,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_email TEXT NOT NULL,
      product_id TEXT,
      product TEXT NOT NULL,
      status TEXT NOT NULL,
      price REAL,
      quantity INTEGER NOT NULL DEFAULT 1,
      image TEXT,
      stripe_session_id TEXT,
      stripe_price_id TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS account_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'password_reset')),
      token_hash TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT UNIQUE NOT NULL,
      email_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      last_error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_email TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      order_reference TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Aberto',
      consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      interest TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Novo',
      recommendation_requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      marketing_consent_at DATETIME,
      marketing_opt_in INTEGER NOT NULL DEFAULT 0,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      utm_term TEXT,
      landing_page TEXT,
      referrer TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const statement of statements) await run(statement);
  await run("ALTER TABLE users ADD COLUMN name TEXT").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN last_login_at DATETIME").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN updated_at DATETIME").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN email_verified_at DATETIME").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await run(
    "UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
  ).catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN product_id TEXT").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN stripe_session_id TEXT").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN stripe_price_id TEXT").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL").catch(() => {});
  await run("ALTER TABLE leads ADD COLUMN recommendation_requested_at DATETIME").catch(() => {});
  await run("ALTER TABLE leads ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await run(
    "UPDATE leads SET recommendation_requested_at = COALESCE(recommendation_requested_at, created_at, CURRENT_TIMESTAMP)",
  ).catch(() => {});
  await run(
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_price_idx ON orders (stripe_session_id, stripe_price_id)",
  ).catch(() => {});
  await run(
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_product_idx ON orders (stripe_session_id, product_id)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS orders_buyer_created_idx ON orders (buyer_email, created_at DESC)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders (user_id, created_at DESC)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS account_tokens_user_purpose_idx ON account_tokens (user_id, purpose, created_at DESC)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON email_outbox (status, available_at, created_at)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS support_tickets_email_created_idx ON support_tickets (requester_email, created_at DESC)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS leads_status_created_idx ON leads (status, created_at DESC)",
  ).catch(() => {});
}

async function close() {
  if (pgPool) await pgPool.end();
  if (sqliteDb)
    await new Promise((resolve, reject) =>
      sqliteDb.close((err) => (err ? reject(err) : resolve())),
    );
}

module.exports = { query, getOne, run, initSqlite, close, usePostgres };
