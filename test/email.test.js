const test = require("node:test");
const assert = require("node:assert/strict");
const {
  escapeHtml,
  getEmailConfig,
  sendEmail,
  sendOrderConfirmationEmail,
  sendRecommendationEmail,
} = require("../lib/email");

test("escapes untrusted email template values", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("uses the Resend testing sender and normalizes the site URL", () => {
  const config = getEmailConfig({ SITE_URL: "https://example.com/" });
  assert.equal(config.from, "Neural X <onboarding@resend.dev>");
  assert.equal(config.siteUrl, "https://example.com");
});

test("skips delivery when the Resend key is not configured", async () => {
  const result = await sendEmail({
    to: "customer@example.com",
    subject: "Teste",
    html: "<p>Teste</p>",
    text: "Teste",
    key: "test",
  }, {});
  assert.deepEqual(result, { sent: false, skipped: "RESEND_API_KEY" });
});

test("order confirmation remains safe without a configured provider", async () => {
  const result = await sendOrderConfirmationEmail({
    checkoutId: "cs_test_123",
    email: "customer@example.com",
    products: [{
      name: "Neural X <script>",
      quantity: 1,
      accessUrl: "https://downloads.example.com/neural-x",
    }],
    amountTotal: 2990,
    currency: "brl",
    accessReady: false,
    accessRequestRequired: true,
  }, { SITE_URL: "https://example.com" });
  assert.equal(result.sent, false);
  assert.equal(result.skipped, "RESEND_API_KEY");
});

test("recommendation email remains safe without a configured provider", async () => {
  const result = await sendRecommendationEmail({
    email: "customer@example.com",
    name: "Cliente <teste>",
    recommendation: {
      id: "neural-x",
      name: "Coleção Neural DSP",
      url: "/produto-neural-x.html",
      reason: "Uma recomendação baseada no objetivo informado.",
    },
  }, { SITE_URL: "https://example.com" });
  assert.equal(result.sent, false);
  assert.equal(result.skipped, "RESEND_API_KEY");
});

test("requested recommendation has non-personal campaign tags and one-click unsubscribe", async (t) => {
  let payload;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: "isolated-email-fixture" }) };
  });
  await sendRecommendationEmail({
    email: "qa@example.invalid", name: "Cliente QA",
    recommendation: { id: "neural-x", name: "Coleção Neural DSP", url: "/produto-neural-x.html", reason: "Escolha informada." },
    marketingConsent: true,
    unsubscribeUrl: "https://neuralx.example/unsubscribe.html?token=opaque-token",
    oneClickUnsubscribeUrl: "https://neuralx.example/api/marketing/unsubscribe?token=opaque-token",
  }, { SITE_URL: "https://neuralx.example", RESEND_API_KEY: "test-fixture-not-a-real-key" });
  const cta = payload.text.match(/Veja: (https:\/\/\S+?)\. Você/)[1];
  const url = new URL(cta);
  assert.equal(url.searchParams.get("utm_medium"), "email");
  assert.equal(url.searchParams.get("utm_campaign"), "recomendacao_solicitada");
  assert.equal(url.searchParams.get("utm_content"), "neural-x");
  assert.doesNotMatch(cta, /qa|example.invalid|%40/);
  assert.match(payload.html, /unsubscribe\.html\?token=opaque-token/);
  assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(payload.headers["List-Unsubscribe"], /\/api\/marketing\/unsubscribe\?token=opaque-token/);
});

test("recommendation-only email does not claim marketing permission", async (t) => {
  let payload;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: "isolated-email-fixture" }) };
  });
  await sendRecommendationEmail({
    email: "qa@example.invalid",
    name: "Cliente QA",
    recommendation: { id: "compare", name: "Comparação", url: "/#produtos", reason: "Compare." },
    marketingConsent: false,
  }, { SITE_URL: "https://neuralx.example", RESEND_API_KEY: "test-fixture-not-a-real-key" });
  assert.match(payload.text, /não adiciona marketing nem altera inscrições anteriores/);
  assert.equal(payload.headers, undefined);
});

test("separate recommendation requests can be resent without colliding idempotency keys", async (t) => {
  const keys = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    keys.push(options.headers["Idempotency-Key"]);
    return { ok: true, json: async () => ({ id: "isolated-email-fixture" }) };
  });
  const input = { email: "qa@example.invalid", name: "QA", recommendation: { id: "compare" } };
  const env = { SITE_URL: "https://neuralx.example", RESEND_API_KEY: "test-fixture-not-a-real-key" };
  await sendRecommendationEmail({ ...input, requestId: "request-1" }, env);
  await sendRecommendationEmail({ ...input, requestId: "request-1" }, env);
  await sendRecommendationEmail({ ...input, requestId: "request-2" }, env);
  assert.equal(keys[0], keys[1], "a retry of the same payload stays idempotent");
  assert.notEqual(keys[0], keys[2], "a new requested delivery is not suppressed");
});
