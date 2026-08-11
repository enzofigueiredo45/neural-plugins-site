const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isStripePriceId,
  isStripeSessionId,
  validateRuntimeConfig,
} = require("../lib/validation");

test("accepts Stripe identifiers and rejects malformed values", () => {
  assert.equal(isStripePriceId("price_123AbC"), true);
  assert.equal(isStripePriceId("prod_123"), false);
  assert.equal(isStripeSessionId("cs_test_123AbC"), true);
  assert.equal(isStripeSessionId("cs_live_123AbC"), true);
  assert.equal(isStripeSessionId("checkout_123"), false);
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
    "STRIPE_WEBHOOK_SECRET",
    "RECAPTCHA_SECRET",
    "RECAPTCHA_SITE_KEY",
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
      STRIPE_WEBHOOK_SECRET: "whsec_123",
      RECAPTCHA_SECRET: "captcha-secret",
      RECAPTCHA_SITE_KEY: "captcha-site-key",
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
