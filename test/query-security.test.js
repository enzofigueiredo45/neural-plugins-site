const test = require("node:test");
const assert = require("node:assert/strict");
const qs = require("qs");

test("query serialization safely handles a non-callable constructor.isBuffer", () => {
  const parsed = qs.parse("item[constructor][isBuffer]=not-a-function", { plainObjects: true });
  assert.doesNotThrow(() => qs.stringify(parsed));
});

test("bracket-key comma input cannot bypass a configured array limit", () => {
  assert.throws(() => qs.parse("items[]=1,2,3,4", {
    comma: true, arrayLimit: 3, throwOnLimitExceeded: true,
  }), RangeError);
});

test("ordinary campaign and checkout query parsing stays compatible", () => {
  assert.deepEqual(qs.parse("utm_source=instagram&utm_medium=social&session_id=cs_test_fixture"), {
    utm_source: "instagram", utm_medium: "social", session_id: "cs_test_fixture",
  });
});
