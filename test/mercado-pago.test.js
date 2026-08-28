const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const {
  buildWebhookManifest,
  createPreference,
  getPayment,
  isMercadoPagoPaymentId,
  normalizeCheckoutUrl,
  verifyWebhookSignature,
} = require("../lib/mercado-pago");

const privateAccessToken = `${["APP", "USR"].join("_")}-private-token-value`;

test("verifies Mercado Pago HMAC signatures with the documented manifest", () => {
  const secret = "a-production-webhook-secret";
  const dataId = "ABC123";
  const requestId = "request-789";
  const timestamp = "1787920000";
  const manifest = "id:abc123;request-id:request-789;ts:1787920000;";
  assert.equal(
    buildWebhookManifest({ dataId, requestId, timestamp }),
    manifest,
  );
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");
  assert.equal(
    verifyWebhookSignature({
      dataId,
      requestId,
      signatureHeader: `ts=${timestamp},v1=${signature}`,
      secret,
    }),
    true,
  );
  assert.equal(
    verifyWebhookSignature({
      dataId: "ABC124",
      requestId,
      signatureHeader: `ts=${timestamp},v1=${signature}`,
      secret,
    }),
    false,
  );
  const manifestWithoutRequestId = "id:abc123;ts:1787920000;";
  const signatureWithoutRequestId = createHmac("sha256", secret)
    .update(manifestWithoutRequestId)
    .digest("hex");
  assert.equal(
    verifyWebhookSignature({
      dataId,
      requestId: "",
      signatureHeader: `ts=${timestamp},v1=${signatureWithoutRequestId}`,
      secret,
    }),
    true,
  );
});

test("accepts only numeric payment IDs and official HTTPS checkout hosts", () => {
  assert.equal(isMercadoPagoPaymentId("123456789"), true);
  assert.equal(isMercadoPagoPaymentId("pay_123"), false);
  assert.equal(
    normalizeCheckoutUrl(
      "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123",
    ),
    "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123",
  );
  assert.equal(
    normalizeCheckoutUrl("https://mercadopago.com.evil.example/checkout"),
    null,
  );
  assert.equal(normalizeCheckoutUrl("http://mercadopago.com.br/checkout"), null);
});

test("creates a preference server-side with bearer auth and idempotency", async () => {
  const calls = [];
  const result = await createPreference({
    accessToken: privateAccessToken,
    idempotencyKey: "nx_test-reference",
    preference: { items: [{ id: "neural-x", quantity: 1, unit_price: 29.9 }] },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({
          id: "preference-123",
          init_point:
            "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=preference-123",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  assert.equal(result.id, "preference-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.mercadopago.com/checkout/preferences");
  assert.equal(
    calls[0].options.headers.Authorization,
    `Bearer ${privateAccessToken}`,
  );
  assert.equal(calls[0].options.headers["X-Idempotency-Key"], "nx_test-reference");
  assert.equal(
    JSON.parse(calls[0].options.body).items[0].unit_price,
    29.9,
  );
});

test("retrieves payment state from the provider and never puts the token in the URL", async () => {
  const calls = [];
  const payment = await getPayment({
    accessToken: privateAccessToken,
    paymentId: "99887766",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({ id: 99887766, status: "approved" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  assert.equal(payment.status, "approved");
  assert.equal(calls[0].url, "https://api.mercadopago.com/v1/payments/99887766");
  assert.equal(calls[0].url.includes("APP_USR"), false);
  assert.equal(
    calls[0].options.headers.Authorization,
    `Bearer ${privateAccessToken}`,
  );
});

test("provider errors do not expose access tokens", async () => {
  const token = `${["APP", "USR"].join("_")}-do-not-leak-this-token`;
  await assert.rejects(
    createPreference({
      accessToken: token,
      preference: { items: [] },
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    }),
    (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(String(error.message).includes(token), false);
      return true;
    },
  );
});
