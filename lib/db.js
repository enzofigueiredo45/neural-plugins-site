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
    download_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    marketing_consent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  await pgPool.query(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_user_id BIGINT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT,
    request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS download_url TEXT",
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
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_price_idx ON orders (stripe_session_id, stripe_price_id) WHERE stripe_session_id IS NOT NULL AND stripe_price_id IS NOT NULL",
  );
  await pgPool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_product_idx ON orders (stripe_session_id, product_id) WHERE stripe_session_id IS NOT NULL AND product_id IS NOT NULL",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS orders_buyer_created_idx ON orders (buyer_email, created_at DESC)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS support_tickets_email_created_idx ON support_tickets (requester_email, created_at DESC)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS leads_status_created_idx ON leads (status, created_at DESC)",
  );
  await pgPool.query(
    "CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log (created_at DESC)",
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
      download_url TEXT,
      stripe_session_id TEXT,
      stripe_price_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      marketing_consent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    `CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      request_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const statement of statements) await run(statement);
  await run("ALTER TABLE users ADD COLUMN name TEXT").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN last_login_at DATETIME").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN updated_at DATETIME").catch(() => {});
  await run(
    "UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
  ).catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN download_url TEXT").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN product_id TEXT").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN stripe_session_id TEXT").catch(() => {});
  await run("ALTER TABLE orders ADD COLUMN stripe_price_id TEXT").catch(() => {});
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
    "CREATE INDEX IF NOT EXISTS support_tickets_email_created_idx ON support_tickets (requester_email, created_at DESC)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS leads_status_created_idx ON leads (status, created_at DESC)",
  ).catch(() => {});
  await run(
    "CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log (created_at DESC)",
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
