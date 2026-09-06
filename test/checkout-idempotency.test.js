const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCheckoutIdempotencyKey,
  stableSerialize,
} = require("../lib/checkout-idempotency");

test("checkout retries reuse a key only for the same effective payload", () => {
  const now = Date.parse("2026-09-06T00:02:00.000Z");
  const payload = {
    mode: "payment",
    line_items: [{ price: "price_fixture", quantity: 1 }],
    metadata: { source: "neural-x-site", utm_source: "instagram" },
  };
  const first = createCheckoutIdempotencyKey({ sessionId: "session-a", payload, now });
  const same = createCheckoutIdempotencyKey({
    sessionId: "session-a",
    payload: { metadata: { utm_source: "instagram", source: "neural-x-site" }, line_items: payload.line_items, mode: "payment" },
    now,
  });
  const changedAttribution = createCheckoutIdempotencyKey({
    sessionId: "session-a",
    payload: { ...payload, metadata: { ...payload.metadata, utm_source: "youtube" } },
    now,
  });
  const changedAccount = createCheckoutIdempotencyKey({ sessionId: "session-b", payload, now });
  assert.equal(first, same);
  assert.notEqual(first, changedAttribution);
  assert.notEqual(first, changedAccount);
  assert.match(first, /^checkout-[a-f0-9]{64}$/);
});

test("stable serialization keeps array order and sorts object keys", () => {
  assert.equal(stableSerialize({ b: 2, a: 1 }), stableSerialize({ a: 1, b: 2 }));
  assert.notEqual(stableSerialize([1, 2]), stableSerialize([2, 1]));
});
