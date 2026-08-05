const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const root = process.cwd();
const sqliteFile = path.join(root, 'data.sqlite');

const databaseUrl = process.env.DATABASE_URL || '';
let usePostgres = !!databaseUrl;

let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
  pgPool = new Pool({ connectionString: databaseUrl });
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
    const res = await pgPool.query(text + ' RETURNING *', params);
    return res.rows[0];
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(text, params || [], function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID });
    });
  });
}

// Initialize tables for sqlite fallback
async function initSqlite() {
  if (usePostgres) return;
  const createUsers = `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    mfa_enabled INTEGER DEFAULT 0,
    mfa_secret TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
  const createOrders = `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_email TEXT NOT NULL,
    product TEXT NOT NULL,
    status TEXT NOT NULL,
    price REAL,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
  sqliteDb.serialize(() => {
    sqliteDb.run(createUsers);
    sqliteDb.run(createOrders);
  });
}

module.exports = { query, getOne, run, initSqlite, usePostgres };
