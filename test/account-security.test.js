const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
let sqlite3;
try {
  sqlite3 = require("sqlite3").verbose();
} catch {
  sqlite3 = null;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Server did not start in time");
}

function createClient(baseUrl) {
  let cookie = "";
  const request = async (pathname, options = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers: { ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    return response;
  };
  const post = async (pathname, body) => {
    const csrfResponse = await request("/api/csrf-token");
    const { csrfToken } = await csrfResponse.json();
    return request(pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify(body),
    });
  };
  return { request, post };
}

function sqliteRun(filename, sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename);
    database.run(sql, params, function onRun(error) {
      if (error) {
        database.close();
        reject(error);
        return;
      }
      const result = { lastID: this.lastID, changes: this.changes };
      database.close((closeError) => closeError ? reject(closeError) : resolve(result));
    });
  });
}

function sqliteGet(filename, sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename);
    database.get(sql, params, (error, row) => {
      if (error) {
        database.close();
        reject(error);
        return;
      }
      database.close((closeError) => closeError ? reject(closeError) : resolve(row));
    });
  });
}

test("unverified accounts cannot inherit purchases by email and password changes revoke other sessions", {
  skip: sqlite3 ? false : "SQLite native binding is unavailable in this runtime",
}, async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "neural-x-security-"));
  const sqliteFile = path.join(tempDirectory, "security.sqlite");
  const port = 34_000 + (process.pid % 1_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    SITE_URL: baseUrl,
    SQLITE_FILE: sqliteFile,
    SESSION_SECRET: "test-session-secret-that-is-longer-than-thirty-two-characters",
    PRODUCT_ACCESS_URL_NEURAL_X: "https://downloads.example.com/neural-x",
    PRODUCT_ACCESS_MODE_NEURAL_X: "automatic",
  };
  delete env.DATABASE_URL;
  delete env.REDIS_URL;
  delete env.RESEND_API_KEY;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGTERM");
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
  await waitForServer(`${baseUrl}/api/catalog`);

  const primary = createClient(baseUrl);
  const registration = await primary.post("/api/register", {
    name: "Cliente Teste",
    email: "buyer@example.com",
    password: "Strong-password-123!",
    acceptTerms: true,
  });
  assert.equal(registration.status, 201);
  assert.equal((await registration.json()).emailSent, false);

  const login = await primary.post("/api/login/client", {
    email: "buyer@example.com",
    password: "Strong-password-123!",
  });
  assert.equal(login.status, 200);

  const unverifiedOrders = await primary.request("/api/orders");
  assert.equal(unverifiedOrders.status, 403);
  assert.equal((await unverifiedOrders.json()).error, "email_unverified");

  const unverifiedTickets = await primary.request("/api/support-tickets");
  assert.equal(unverifiedTickets.status, 403);

  const user = await sqliteGet(sqliteFile, "SELECT id FROM users WHERE email = ?", ["buyer@example.com"]);
  await sqliteRun(
    sqliteFile,
    "INSERT INTO orders (buyer_email, product_id, product, status, price, user_id) VALUES (?, ?, ?, ?, ?, NULL)",
    ["buyer@example.com", "neural-x", "Coleção Neural DSP", "Acesso liberado", 29.9],
  );
  await sqliteRun(sqliteFile, "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

  const stillUnclaimed = await primary.request("/api/orders");
  assert.equal(stillUnclaimed.status, 200);
  assert.deepEqual(await stillUnclaimed.json(), []);

  const ownedOrder = await sqliteRun(
    sqliteFile,
    "INSERT INTO orders (buyer_email, product_id, product, status, price, user_id) VALUES (?, ?, ?, ?, ?, ?)",
    ["buyer@example.com", "neural-x", "Coleção Neural DSP", "Acesso liberado", 29.9, user.id],
  );
  const library = await primary.request("/api/orders");
  const orders = await library.json();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].access_url, `/api/orders/${ownedOrder.lastID}/access`);
  assert.equal(Object.hasOwn(orders[0], "download_url"), false);

  const access = await primary.request(`/api/orders/${ownedOrder.lastID}/access`, { redirect: "manual" });
  assert.equal(access.status, 302);
  assert.equal(access.headers.get("location"), "https://downloads.example.com/neural-x");

  const secondary = createClient(baseUrl);
  const secondLogin = await secondary.post("/api/login/client", {
    email: "buyer@example.com",
    password: "Strong-password-123!",
  });
  assert.equal(secondLogin.status, 200);

  const passwordChange = await primary.post("/api/account/password", {
    currentPassword: "Strong-password-123!",
    newPassword: "Another-strong-password-456!",
  });
  assert.equal(passwordChange.status, 200);
  assert.equal((await primary.request("/api/me")).status, 200);
  const revoked = await secondary.request("/api/me");
  assert.equal(revoked.status, 401);
  assert.equal((await revoked.json()).error, "session_revoked");
});
