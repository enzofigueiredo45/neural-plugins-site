const test = require("node:test");
const assert = require("node:assert/strict");
const {
  escapeHtml,
  getEmailConfig,
  sendEmail,
  sendOrderConfirmationEmail,
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
    products: [{ name: "Neural X <script>", quantity: 1 }],
    amountTotal: 2990,
    currency: "brl",
    accessReady: false,
    accessRequestRequired: true,
  }, { SITE_URL: "https://example.com" });
  assert.equal(result.sent, false);
  assert.equal(result.skipped, "RESEND_API_KEY");
});
