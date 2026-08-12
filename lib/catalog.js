const PRODUCT_DEFINITIONS = Object.freeze({
  "neural-x": Object.freeze({
    id: "neural-x",
    name: "Coleção Neural DSP",
    image: "/assets/neural-dsp/archetype-john-mayer-x.png",
    unitAmount: 2990,
    priceEnv: "STRIPE_PRICE_NEURAL_X",
    accessEnv: "PRODUCT_ACCESS_URL_NEURAL_X",
    accessModeEnv: "PRODUCT_ACCESS_MODE_NEURAL_X",
  }),
  "fl-studio": Object.freeze({
    id: "fl-studio",
    name: "FL Studio",
    image: "/assets/product-fl-studio.jpg",
    unitAmount: 1990,
    priceEnv: "STRIPE_PRICE_FL_STUDIO",
    accessEnv: "PRODUCT_ACCESS_URL_FL_STUDIO",
    accessModeEnv: "PRODUCT_ACCESS_MODE_FL_STUDIO",
  }),
  reaper: Object.freeze({
    id: "reaper",
    name: "REAPER",
    image: "/assets/product-reaper.jpg",
    unitAmount: 1990,
    priceEnv: "STRIPE_PRICE_REAPER",
    accessEnv: "PRODUCT_ACCESS_URL_REAPER",
    accessModeEnv: "PRODUCT_ACCESS_MODE_REAPER",
  }),
});

function normalizeAccessUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeAccessMode(value, accessUrl) {
  if (!accessUrl) return "pending";
  return String(value || "").trim().toLowerCase() === "request"
    ? "request"
    : "automatic";
}

function getProductCatalog(env = process.env) {
  return Object.fromEntries(
    Object.values(PRODUCT_DEFINITIONS).map((definition) => {
      const accessUrl = normalizeAccessUrl(env[definition.accessEnv]);
      return [definition.id, {
        id: definition.id,
        name: definition.name,
        image: definition.image,
        unitAmount: definition.unitAmount,
        price: String(env[definition.priceEnv] || "").trim(),
        accessUrl,
        accessMode: normalizeAccessMode(
          env[definition.accessModeEnv],
          accessUrl,
        ),
      }];
    }),
  );
}

function toPublicCatalog(catalog) {
  return Object.values(catalog).map((product) => ({
    id: product.id,
    name: product.name,
    image: product.image,
    unitAmount: product.unitAmount,
    currency: "brl",
    accessMode: product.accessMode,
  }));
}

function parseCheckoutCartMetadata(value, catalog) {
  try {
    const parsed = JSON.parse(String(value || ""));
    if (!Array.isArray(parsed) || parsed.length < 1) return [];
    const seen = new Set();
    const normalized = parsed.map((item) => {
      const id = String(item?.id || "");
      const quantity = Number.parseInt(item?.quantity, 10);
      if (
        !catalog[id] ||
        seen.has(id) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      )
        throw new Error("invalid_cart_metadata");
      seen.add(id);
      return { id, quantity };
    });
    return normalized;
  } catch {
    return [];
  }
}

function getLineItemPrice(item) {
  return typeof item?.price === "string" ? null : item?.price || null;
}

function getStoreProductId(item) {
  const price = getLineItemPrice(item);
  const expandedProduct =
    price && typeof price.product === "object" ? price.product : null;
  return (
    price?.metadata?.store_product_id ||
    expandedProduct?.metadata?.store_product_id ||
    ""
  );
}

function resolveLineItemProduct(item, catalog, metadataItem) {
  const priceId =
    typeof item?.price === "string" ? item.price : item?.price?.id || "";
  const currentPriceMatch = Object.values(catalog).find(
    (product) => product.price && product.price === priceId,
  );
  if (currentPriceMatch) return currentPriceMatch;

  const metadataProductId = String(getStoreProductId(item));
  if (catalog[metadataProductId]) return catalog[metadataProductId];

  const checkoutProductId = String(metadataItem?.id || "");
  if (catalog[checkoutProductId]) return catalog[checkoutProductId];
  return null;
}

module.exports = {
  PRODUCT_DEFINITIONS,
  getProductCatalog,
  normalizeAccessMode,
  normalizeAccessUrl,
  parseCheckoutCartMetadata,
  resolveLineItemProduct,
  toPublicCatalog,
};
