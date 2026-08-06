const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const root = process.cwd();
const sqliteFile = process.env.SQLITE_FILE || path.join(root, 'data.sqlite');
const databaseUrl = process.env.DATABASE_URL || '';
const usePostgres = !!databaseUrl;

let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
  pgPool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  pgPool.on('error', (err) => console.error('Postgres error', err));
} else {
  if (!fs.existsSync(sqliteFile)) fs.writeFileSync(sqliteFile, '');
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
    avatar_url TEXT,
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    buyer_email TEXT NOT NULL,
    product TEXT NOT NULL,
    status TEXT NOT NULL,
    price NUMERIC(10,2),
    image TEXT,
    download_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT');
  await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT');
  await pgPool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS download_url TEXT');
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
      avatar_url TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      mfa_secret TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_email TEXT NOT NULL,
      product TEXT NOT NULL,
      status TEXT NOT NULL,
      price REAL,
      image TEXT,
      download_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];
  for (const statement of statements) await run(statement);
  await run('ALTER TABLE users ADD COLUMN name TEXT').catch(() => {});
  await run('ALTER TABLE users ADD COLUMN avatar_url TEXT').catch(() => {});
  await run('ALTER TABLE orders ADD COLUMN download_url TEXT').catch(() => {});
}

module.exports = { query, getOne, run, initSqlite, usePostgres };
