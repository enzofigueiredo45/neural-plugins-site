const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getProductCatalog,
  normalizeAccessUrl,
  normalizeAccessMode,
  parseCheckoutCartMetadata,
  resolveLineItemProduct,
  toPublicCatalog,
} = require("../lib/catalog");

const env = {
  STRIPE_PRICE_NEURAL_X: "price_neuralCurrent",
  STRIPE_PRICE_FL_STUDIO: "price_flCurrent",
  STRIPE_PRICE_REAPER: "price_reaperCurrent",
  PRODUCT_ACCESS_URL_NEURAL_X: "https://downloads.example.com/neural",
  PRODUCT_ACCESS_MODE_NEURAL_X: "request",
};

test("builds a public catalog without exposing Stripe IDs or access URLs", () => {
  const catalog = getProductCatalog(env);
  const publicCatalog = toPublicCatalog(catalog);
  assert.equal(catalog["neural-x"].accessUrl, "https://downloads.example.com/neural");
  assert.equal(publicCatalog[0].unitAmount, 2990);
  assert.equal(publicCatalog[0].accessMode, "request");
  assert.equal(publicCatalog[1].accessMode, "pending");
  assert.equal(publicCatalog[1].name, "FL Studio 2026");
  assert.equal(publicCatalog[1].edition, "2026");
  assert.equal(publicCatalog[2].name, "REAPER 2026");
  assert.equal(publicCatalog[2].edition, "2026");
  for (const product of publicCatalog) {
    assert.equal(Object.hasOwn(product, "price"), false);
    assert.equal(Object.hasOwn(product, "priceId"), false);
    assert.equal(Object.hasOwn(product, "accessUrl"), false);
  }
});

test("accepts only credential-free HTTPS access URLs", () => {
  assert.equal(normalizeAccessUrl("http://example.com/file"), null);
  assert.equal(normalizeAccessUrl("https://user:pass@example.com/file"), null);
  assert.equal(normalizeAccessUrl("javascript:alert(1)"), null);
  assert.equal(normalizeAccessUrl("https://example.com/file"), "https://example.com/file");
});

test("distinguishes automatic, requested and pending access", () => {
  assert.equal(normalizeAccessMode("request", "https://example.com"), "request");
  assert.equal(normalizeAccessMode("automatic", "https://example.com"), "automatic");
  assert.equal(normalizeAccessMode("", "https://example.com"), "automatic");
  assert.equal(normalizeAccessMode("request", null), "pending");
});

test("uses the verified Neural X price in live mode without affecting previews", () => {
  const liveCatalog = getProductCatalog({
    ...env,
    STRIPE_SECRET_KEY: "rk_live_restricted",
  });
  const previewCatalog = getProductCatalog({
    ...env,
    STRIPE_SECRET_KEY: "sk_test_preview",
  });
  assert.equal(liveCatalog["neural-x"].price, "price_1U3ON0DXni1KAKnrcJSzNBXN");
  assert.equal(previewCatalog["neural-x"].price, env.STRIPE_PRICE_NEURAL_X);
});

test("validates checkout cart metadata", () => {
  const catalog = getProductCatalog(env);
  assert.deepEqual(
    parseCheckoutCartMetadata('[{"id":"reaper","quantity":2}]', catalog),
    [{ id: "reaper", quantity: 2 }],
  );
  assert.deepEqual(
    parseCheckoutCartMetadata('[{"id":"unknown","quantity":1}]', catalog),
    [],
  );
  assert.deepEqual(
    parseCheckoutCartMetadata('[{"id":"reaper","quantity":1},{"id":"reaper","quantity":1}]', catalog),
    [],
  );
});

test("resolves current and rotated Stripe prices without dropping paid items", () => {
  const catalog = getProductCatalog(env);
  assert.equal(
    resolveLineItemProduct({ price: { id: "price_flCurrent", metadata: {} } }, catalog)?.id,
    "fl-studio",
  );
  assert.equal(
    resolveLineItemProduct(
      { price: { id: "price_old", metadata: { store_product_id: "reaper" } } },
      catalog,
    )?.id,
    "reaper",
  );
  assert.equal(
    resolveLineItemProduct(
      {
        price: {
          id: "price_old",
          metadata: {},
          product: { metadata: { store_product_id: "neural-x" } },
        },
      },
      catalog,
    )?.id,
    "neural-x",
  );
  assert.equal(
    resolveLineItemProduct({ price: { id: "price_old", metadata: {} } }, catalog, {
      id: "fl-studio",
    })?.id,
    "fl-studio",
  );
});
