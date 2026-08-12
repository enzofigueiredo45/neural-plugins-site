const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const CONFIG_KEYS = [
  "SESSION_SECRET",
  "REDIS_URL",
  "DATABASE_URL",
  "SITE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_NEURAL_X",
  "STRIPE_PRICE_FL_STUDIO",
  "STRIPE_PRICE_REAPER",
  "PRODUCT_ACCESS_URL_NEURAL_X",
  "PRODUCT_ACCESS_URL_FL_STUDIO",
  "PRODUCT_ACCESS_URL_REAPER",
  "STRIPE_WEBHOOK_SECRET",
  "RECAPTCHA_SECRET",
  "RECAPTCHA_SITE_KEY",
];

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Server did not start in time");
}

test("production server stays diagnosable when configuration is missing", async (t) => {
  const port = 32_000 + (process.pid % 2_000);
  const env = { ...process.env, NODE_ENV: "production", PORT: String(port) };
  for (const key of CONFIG_KEYS) delete env[key];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));

  const indexResponse = await waitForServer(`http://127.0.0.1:${port}/`);
  assert.equal(indexResponse.status, 200);

  const catalogResponse = await fetch(`http://127.0.0.1:${port}/api/catalog`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.products.length, 3);
  assert.equal(JSON.stringify(catalog).includes("price_"), false);
  assert.equal(JSON.stringify(catalog).includes("accessUrl"), false);

  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(healthResponse.status, 503);
  const health = await healthResponse.json();
  assert.equal(health.ok, false);
  assert.equal(health.configuration.valid, false);
  assert.ok(health.configuration.missingOrInvalid.includes("SESSION_SECRET"));

  const csrfResponse = await fetch(`http://127.0.0.1:${port}/api/csrf-token`);
  assert.equal(csrfResponse.status, 503);
  assert.equal((await csrfResponse.json()).error, "session_not_configured");
});

test("checkout declares the payment method that is active in production", () => {
  const server = fs.readFileSync("server.js", "utf8");
  assert.match(server, /payment_method_types:\s*\["card"\]/);
});
