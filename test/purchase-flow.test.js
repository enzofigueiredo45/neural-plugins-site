const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

test("account → support → both checkouts → confirmed access, with isolated provider fixtures", async (t) => {
  // Real HTTP handlers, sessions, password hashing and SQLite. Only payment
  // providers are fixtures; no live credentials, payments or emails are used.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neuralx-flow-"));
  const originalEnv = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (/^(DATABASE_|REDIS_|RECAPTCHA_|RESEND_|STRIPE_|MERCADO_PAGO_|PRODUCT_ACCESS_|SESSION_|VERCEL_|EMAIL_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    NODE_ENV: "test", SQLITE_FILE: path.join(dir, "test.sqlite"),
    SESSION_SECRET: "isolated-flow-test-session-secret",
    SITE_URL: "https://neuralx.example",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_PRICE_NEURAL_X: "price_neuralfixture",
    STRIPE_PRICE_FL_STUDIO: "price_flfixture",
    STRIPE_PRICE_REAPER: "price_reaperfixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    MERCADO_PAGO_ACCESS_TOKEN: "TEST-fixtureaccess1234567890",
    MERCADO_PAGO_WEBHOOK_SECRET: "fixture-webhook-secret",
    PRODUCT_ACCESS_URL_NEURAL_X: "https://drive.google.com/drive/folders/fixture-neural",
    PRODUCT_ACCESS_URL_FL_STUDIO: "https://drive.google.com/drive/folders/fixture-fl",
    PRODUCT_ACCESS_URL_REAPER: "https://drive.google.com/drive/folders/fixture-reaper",
  });
  const amounts = { price_neuralfixture: 2990, price_flfixture: 1990, price_reaperfixture: 1990 };
  const sessions = new Map();
  const mpPayments = new Map();
  let lastPreference;
  const actualStripe = require("stripe")("sk_test_fixture");
  const actualMp = require("../lib/mercado-pago");
  const stripeFixture = {
    webhooks: actualStripe.webhooks,
    prices: { retrieve: async (id) => ({ id, active: true, type: "one_time", currency: "brl", unit_amount: amounts[id], livemode: false }) },
    checkout: { sessions: {
      create: async (input) => {
        const id = `cs_test_fixture${sessions.size + 1}`;
        const session = {
          ...input, id, payment_status: "unpaid", status: "open", currency: "brl",
          customer_details: { email: input.customer_email || "guest@example.invalid" },
          amount_total: input.line_items.reduce((sum, item) => sum + amounts[item.price] * item.quantity, 0),
          line_items: { data: input.line_items.map((item) => ({ price: { id: item.price }, quantity: item.quantity, amount_total: amounts[item.price] * item.quantity })) },
          url: `https://checkout.stripe.com/c/pay/${id}`,
        };
        sessions.set(id, session);
        return session;
      },
      retrieve: async (id) => {
        if (!sessions.has(id)) throw new Error("unknown test session");
        return sessions.get(id);
      },
    } },
  };
  const originalLoad = Module._load;
  Module._load = function (id, ...args) {
    if (id === "stripe") return () => stripeFixture;
    if (id === "./lib/mercado-pago") return {
      ...actualMp,
      createPreference: async ({ preference }) => {
        lastPreference = preference;
        return { id: "fixture-preference", url: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture-preference" };
      },
      getPayment: async ({ paymentId }) => mpPayments.get(paymentId),
    };
    return originalLoad.call(this, id, ...args);
  };
  let app;
  try { app = require("../server"); } finally { Module._load = originalLoad; }
  const db = require("../lib/db");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });
  let cookie = "";
  let csrf = "";
  async function request(url, body, extraHeaders = {}) {
    const response = await fetch(base + url, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie();
    if (setCookie.length) cookie = setCookie.map((value) => value.split(";")[0]).join("; ");
    return { status: response.status, data: await response.json() };
  }
  async function refreshCsrf() {
    const result = await request("/api/csrf-token");
    assert.equal(result.status, 200);
    csrf = result.data.csrfToken;
  }
  await refreshCsrf();
  const account = { name: "Cliente QA", email: "flow@example.invalid", password: "Aa1!abcd", acceptTerms: true };
  const short = await request("/api/register", { ...account, password: "Aa1!abc" });
  assert.equal(short.status, 400);
  assert.equal(short.data.error, "weak_password");
  const anonymousCookie = cookie;
  const anonymousCsrf = csrf;
  const registered = await request("/api/register", account);
  assert.equal(registered.status, 201);
  assert.equal(registered.data.authenticated, true);
  assert.notEqual(cookie, anonymousCookie, "signup must rotate the anonymous session");
  assert.notEqual(registered.data.csrfToken, anonymousCsrf);
  csrf = registered.data.csrfToken;
  const me = await request("/api/me");
  assert.equal(me.status, 200, "new customer must already be signed in");
  assert.equal(me.data.user.email, account.email);
  const duplicate = await request("/api/register", account);
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.data.error, "registration_unavailable");
  assert.equal((await request("/api/profile", { name: "Cliente QA" }, { "X-CSRF-Token": anonymousCsrf })).status, 403);
  assert.equal((await request("/api/logout", {})).status, 200);
  assert.equal((await request("/api/me")).status, 401);
  const oldCookieCheck = await fetch(base + "/api/me", { headers: { Cookie: anonymousCookie } });
  assert.equal(oldCookieCheck.status, 401, "pre-signup cookie must not access the account");
  await refreshCsrf();
  const duplicateAnonymous = await request("/api/register", { ...account, password: "Different1!" });
  assert.equal(duplicateAnonymous.data.error, "registration_unavailable");
  assert.equal((await request("/api/me")).status, 401, "duplicate signup must never sign in an existing user");
  assert.equal((await request("/api/login/client", { email: account.email, password: account.password })).status, 200);
  await refreshCsrf();
  const support = await request("/api/support", { name: account.name, email: account.email, category: "access", message: "Teste isolado de cadastro e atendimento ao cliente.", privacyConsent: true });
  assert.equal(support.status, 201);
  assert.ok(support.data.ticketId);
  const tickets = await request("/api/support-tickets");
  assert.equal(tickets.status, 200);
  assert.equal(tickets.data.length, 1);

  const lead = { name: account.name, email: account.email, interest: "guitar", marketingConsent: true, companyWebsite: "", attribution: { utm_source: "instagram", utm_medium: "social", utm_campaign: "qa_isolated" } };
  const capturedLead = await request("/api/leads", lead);
  assert.equal(capturedLead.status, 201);
  assert.equal(capturedLead.data.emailSent, false, "isolated QA cannot send real email");
  assert.equal(capturedLead.data.recommendation.id, "neural-x");
  const botLead = await request("/api/leads", { ...lead, email: "bot@example.invalid", companyWebsite: "https://spam.invalid" });
  assert.equal(botLead.status, 400);
  const noConsent = await request("/api/leads", { ...lead, email: "no-consent@example.invalid", marketingConsent: false });
  assert.equal(noConsent.status, 201, "requested recommendation must not require marketing consent");
  assert.equal(noConsent.data.marketingOptIn, false);
  let leadRows = await db.query("SELECT email, marketing_opt_in, marketing_consent_at, marketing_unsubscribed_at, utm_source FROM leads ORDER BY email");
  assert.equal(leadRows.length, 2, "honeypot must be rejected while no-consent recommendations remain deliverable");
  const optedInLead = leadRows.find((row) => row.email === account.email);
  const recommendationOnlyLead = leadRows.find((row) => row.email === "no-consent@example.invalid");
  assert.equal(optedInLead.utm_source, "instagram");
  assert.equal(Number(optedInLead.marketing_opt_in), 1);
  assert.equal(Number(recommendationOnlyLead.marketing_opt_in), 0);
  assert.equal(recommendationOnlyLead.marketing_consent_at, null);
  const repeated = await request("/api/leads", { ...lead, marketingConsent: false });
  assert.equal(repeated.status, 201);
  const preserved = await db.getOne("SELECT marketing_opt_in, marketing_consent_at FROM leads WHERE email = ?", [account.email]);
  assert.equal(Number(preserved.marketing_opt_in), 1);
  assert.equal(preserved.marketing_consent_at, optedInLead.marketing_consent_at);

  const { createUnsubscribeToken } = require("../lib/marketing-consent");
  const unsubscribe = await request("/api/marketing/unsubscribe", {
    token: createUnsubscribeToken(account.email, process.env.SESSION_SECRET),
  });
  assert.equal(unsubscribe.status, 200);
  assert.equal(unsubscribe.data.ok, true);
  leadRows = await db.query("SELECT marketing_opt_in, marketing_unsubscribed_at FROM leads WHERE email = ?", [account.email]);
  assert.equal(Number(leadRows[0].marketing_opt_in), 0);
  assert.ok(leadRows[0].marketing_unsubscribed_at);
  const afterUnsubscribe = await request("/api/leads", { ...lead, marketingConsent: false });
  assert.equal(afterUnsubscribe.status, 201);
  assert.equal(Number((await db.getOne("SELECT marketing_opt_in FROM leads WHERE email = ?", [account.email])).marketing_opt_in), 0);
  assert.equal((await request("/api/marketing/unsubscribe", { token: "invalid" })).status, 400);

  const cart = [{ id: "neural-x", quantity: 1 }, { id: "fl-studio", quantity: 1 }, { id: "reaper", quantity: 1 }];
  const checkout = await request("/api/create-checkout-session", { cart });
  assert.equal(checkout.status, 200);
  const paidSession = [...sessions.values()][0];
  assert.match(paidSession.success_url, /success\.html\?session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(paidSession.cancel_url, /checkout=cancelled/);
  const lookupPath = `/api/checkout-session?session_id=${paidSession.id}`;
  const unpaid = await request(lookupPath);
  assert.equal(unpaid.data.paymentStatus, "unpaid");
  assert.ok(unpaid.data.products.every((item) => item.accessUrl === null));
  paidSession.payment_status = "paid";
  paidSession.status = "complete";
  const event = { id: "evt_fixture", type: "checkout.session.completed", data: { object: { id: paidSession.id } } };
  const signature = actualStripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(event), secret: process.env.STRIPE_WEBHOOK_SECRET });
  assert.equal((await request("/api/stripe-webhook", event, { "stripe-signature": signature })).status, 200);
  const paid = await request(lookupPath);
  assert.equal(paid.data.paymentStatus, "paid");
  assert.equal(paid.data.fulfillment, "ready");
  assert.equal(paid.data.products.length, 3);
  assert.ok(paid.data.products.every((item) => item.accessUrl.startsWith("https://drive.google.com/") && item.accessMode === "automatic"));
  await request(lookupPath);
  const orders = await request("/api/orders");
  assert.equal(orders.status, 200);
  assert.equal(orders.data.length, 3, "webhook plus repeated return must not duplicate orders");
  assert.ok(orders.data.every((item) => item.download_url));

  assert.equal((await request("/api/create-mercado-pago-checkout", { cart: [cart[0]] })).status, 200);
  const reference = lastPreference.external_reference;
  assert.match(lastPreference.back_urls.success, /provider=mercado_pago/);
  const mp = { id: "10001", external_reference: reference, currency_id: "BRL", transaction_amount: 29.9, live_mode: false, payer: { email: account.email }, status: "pending" };
  mpPayments.set(mp.id, mp);
  const mpPath = `/api/mercado-pago-payment?payment_id=${mp.id}&external_reference=${reference}`;
  assert.ok((await request(mpPath)).data.products.every((item) => !item.accessUrl));
  mp.status = "approved";
  const approved = await request(mpPath);
  assert.equal(approved.data.paymentStatus, "paid");
  assert.match(approved.data.products[0].accessUrl, /^https:\/\/drive.google.com\//);
  const wrongReference = await request(`/api/mercado-pago-payment?payment_id=${mp.id}&external_reference=nx_00000000-0000-4000-8000-000000000000`);
  assert.notEqual(wrongReference.status, 200);
  mp.status = "refunded";
  assert.ok((await request(mpPath)).data.products.every((item) => !item.accessUrl));
  const refundedOrders = await request("/api/orders");
  const refunded = refundedOrders.data.find((item) => item.payment_provider === "mercado_pago");
  assert.equal(refunded.download_url, null);
});
