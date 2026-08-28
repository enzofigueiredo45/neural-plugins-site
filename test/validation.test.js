const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isMercadoPagoAccessToken,
  isMercadoPagoWebhookSecret,
  isStripePriceId,
  isStripeSessionId,
  validateRuntimeConfig,
} = require("../lib/validation");

const productionMercadoPagoToken = `${["APP", "USR"].join("_")}-${"1".repeat(24)}`;

test("accepts Stripe identifiers and rejects malformed values", () => {
  assert.equal(isStripePriceId("price_123AbC"), true);
  assert.equal(isStripePriceId("prod_123"), false);
  assert.equal(isStripeSessionId("cs_test_123AbC"), true);
  assert.equal(isStripeSessionId("cs_live_123AbC"), true);
  assert.equal(isStripeSessionId("checkout_123"), false);
});

test("validates Mercado Pago production and preview credentials", () => {
  assert.equal(
    isMercadoPagoAccessToken(productionMercadoPagoToken),
    true,
  );
  assert.equal(isMercadoPagoAccessToken("TEST-1234567890abcdefghijkl"), false);
  assert.equal(
    isMercadoPagoAccessToken("TEST-1234567890abcdefghijkl", true),
    true,
  );
  assert.equal(isMercadoPagoWebhookSecret("short"), false);
  assert.equal(
    isMercadoPagoWebhookSecret("webhook-secret-1234567890"),
    true,
  );
});

test("reports missing production configuration by variable name only", () => {
  const result = validateRuntimeConfig({}, true);
  assert.deepEqual(result.errors, [
    "SESSION_SECRET",
    "REDIS_URL",
    "DATABASE_URL",
    "SITE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_NEURAL_X",
    "STRIPE_PRICE_FL_STUDIO",
    "STRIPE_PRICE_REAPER",
  ]);
  assert.deepEqual(result.warnings, [
    "PRODUCT_ACCESS_URL_NEURAL_X",
    "PRODUCT_ACCESS_URL_FL_STUDIO",
    "PRODUCT_ACCESS_URL_REAPER",
    "STRIPE_WEBHOOK_SECRET",
    "MERCADO_PAGO_ACCESS_TOKEN",
    "MERCADO_PAGO_WEBHOOK_SECRET",
    "RECAPTCHA_SECRET",
    "RECAPTCHA_SITE_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_SUPPORT_TO",
  ]);
});

test("accepts a complete production configuration", () => {
  const result = validateRuntimeConfig(
    {
      SESSION_SECRET: "x".repeat(48),
      REDIS_URL: "rediss://default:secret@example.com:6379",
      DATABASE_URL: "postgresql://user:secret@example.com/db",
      SITE_URL: "https://example.com",
      STRIPE_SECRET_KEY: "rk_live_123456",
      STRIPE_PRICE_NEURAL_X: "price_neural123",
      STRIPE_PRICE_FL_STUDIO: "price_fl123",
      STRIPE_PRICE_REAPER: "price_reaper123",
      PRODUCT_ACCESS_URL_NEURAL_X: "https://downloads.example.com/neural",
      PRODUCT_ACCESS_URL_FL_STUDIO: "https://downloads.example.com/fl-studio",
      PRODUCT_ACCESS_URL_REAPER: "https://downloads.example.com/reaper",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
      MERCADO_PAGO_ACCESS_TOKEN: productionMercadoPagoToken,
      MERCADO_PAGO_WEBHOOK_SECRET: "webhook-secret-1234567890",
      RECAPTCHA_SECRET: "captcha-secret",
      RECAPTCHA_SITE_KEY: "captcha-site-key",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Neural X <hello@example.com>",
      EMAIL_SUPPORT_TO: "support@example.com",
    },
    true,
  );
  assert.deepEqual(result, { errors: [], warnings: [] });
});

test("rejects test mode and malformed webhook secrets in production", () => {
  const base = {
    SESSION_SECRET: "x".repeat(48),
    REDIS_URL: "rediss://default:secret@example.com:6379",
    DATABASE_URL: "postgresql://user:secret@example.com/db",
    SITE_URL: "https://example.com",
    STRIPE_SECRET_KEY: "sk_test_123456",
    STRIPE_PRICE_NEURAL_X: "price_neural123",
    STRIPE_PRICE_FL_STUDIO: "price_fl123",
    STRIPE_PRICE_REAPER: "price_reaper123",
    STRIPE_WEBHOOK_SECRET: "invalid",
  };
  const result = validateRuntimeConfig(base, true);
  assert.deepEqual(result.errors, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
});

test("allows an isolated Stripe test key on Vercel previews", () => {
  const result = validateRuntimeConfig(
    {
      VERCEL_ENV: "preview",
      SESSION_SECRET: "x".repeat(48),
      REDIS_URL: "rediss://default:secret@example.com:6379",
      DATABASE_URL: "postgresql://user:secret@example.com/db",
      SITE_URL: "https://example.com",
      STRIPE_SECRET_KEY: "rk_test_123456",
      STRIPE_PRICE_NEURAL_X: "price_neural123",
      STRIPE_PRICE_FL_STUDIO: "price_fl123",
      STRIPE_PRICE_REAPER: "price_reaper123",
      PRODUCT_ACCESS_URL_NEURAL_X: "https://downloads.example.com/neural",
      PRODUCT_ACCESS_URL_FL_STUDIO: "https://downloads.example.com/fl-studio",
      PRODUCT_ACCESS_URL_REAPER: "https://downloads.example.com/reaper",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-1234567890abcdefghijkl",
      MERCADO_PAGO_WEBHOOK_SECRET: "webhook-secret-1234567890",
      RECAPTCHA_SECRET: "captcha-secret",
      RECAPTCHA_SITE_KEY: "captcha-site-key",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Neural X <hello@example.com>",
      EMAIL_SUPPORT_TO: "support@example.com",
    },
    true,
  );
  assert.deepEqual(result, { errors: [], warnings: [] });
});

test("rejects unsafe product access URLs", () => {
  const result = validateRuntimeConfig(
    {
      SESSION_SECRET: "x".repeat(48),
      REDIS_URL: "rediss://default:secret@example.com:6379",
      DATABASE_URL: "postgresql://user:secret@example.com/db",
      SITE_URL: "https://example.com",
      STRIPE_SECRET_KEY: "rk_live_123456",
      STRIPE_PRICE_NEURAL_X: "price_neural123",
      STRIPE_PRICE_FL_STUDIO: "price_fl123",
      STRIPE_PRICE_REAPER: "price_reaper123",
      PRODUCT_ACCESS_URL_NEURAL_X: "http://downloads.example.com/neural",
      PRODUCT_ACCESS_URL_FL_STUDIO: "https://user:pass@example.com/file",
      PRODUCT_ACCESS_URL_REAPER: "javascript:alert(1)",
    },
    true,
  );
  assert.ok(result.errors.includes("PRODUCT_ACCESS_URL_NEURAL_X"));
  assert.ok(result.errors.includes("PRODUCT_ACCESS_URL_FL_STUDIO"));
  assert.ok(result.errors.includes("PRODUCT_ACCESS_URL_REAPER"));
});

test("validates requested access mode", () => {
  const base = {
    SESSION_SECRET: "x".repeat(48),
    REDIS_URL: "rediss://default:secret@example.com:6379",
    DATABASE_URL: "postgresql://user:secret@example.com/db",
    SITE_URL: "https://example.com",
    STRIPE_SECRET_KEY: "rk_live_123456",
    STRIPE_PRICE_NEURAL_X: "price_neural123",
    STRIPE_PRICE_FL_STUDIO: "price_fl123",
    STRIPE_PRICE_REAPER: "price_reaper123",
    PRODUCT_ACCESS_URL_NEURAL_X: "https://drive.google.com/folder/neural",
    PRODUCT_ACCESS_URL_FL_STUDIO: "https://drive.google.com/folder/fl",
    PRODUCT_ACCESS_URL_REAPER: "https://drive.google.com/folder/reaper",
    STRIPE_WEBHOOK_SECRET: "whsec_123",
    MERCADO_PAGO_ACCESS_TOKEN: productionMercadoPagoToken,
    MERCADO_PAGO_WEBHOOK_SECRET: "webhook-secret-1234567890",
    RECAPTCHA_SECRET: "captcha-secret",
    RECAPTCHA_SITE_KEY: "captcha-site-key",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "Neural X <hello@example.com>",
    EMAIL_SUPPORT_TO: "support@example.com",
  };
  assert.deepEqual(
    validateRuntimeConfig(
      { ...base, PRODUCT_ACCESS_MODE_NEURAL_X: "request" },
      true,
    ),
    { errors: [], warnings: [] },
  );
  assert.ok(
    validateRuntimeConfig(
      { ...base, PRODUCT_ACCESS_MODE_NEURAL_X: "manual-ish" },
      true,
    ).errors.includes("PRODUCT_ACCESS_MODE_NEURAL_X"),
  );
});
