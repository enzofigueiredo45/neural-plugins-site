const { createHash } = require("node:crypto");

function stableSerialize(value) {
  if (Array.isArray(value))
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createCheckoutIdempotencyKey({ sessionId, payload, now = Date.now() }) {
  const bucket = Math.floor(Number(now) / (5 * 60 * 1000));
  const digest = createHash("sha256")
    .update(`${String(sessionId || "anonymous")}:${bucket}:${stableSerialize(payload)}`)
    .digest("hex");
  return `checkout-${digest}`;
}

module.exports = { createCheckoutIdempotencyKey, stableSerialize };
