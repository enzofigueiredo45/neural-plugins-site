const test = require("node:test");
const assert = require("node:assert/strict");
const { createDatabaseReadiness } = require("../lib/database-readiness");

test("cold-start timeout retries once and concurrent requests share initialization", async () => {
  let attempts = 0;
  const errors = [];
  const ready = createDatabaseReadiness({
    initialize: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Connection terminated due to connection timeout");
    },
    wait: async () => {},
    onError: (error) => errors.push(error),
  });
  assert.deepEqual(await Promise.all([ready(), ready(), ready()]), [true, true, true]);
  assert.equal(await ready(), true);
  assert.equal(attempts, 2);
  assert.equal(errors.length, 0);
});

test("permanent schema errors fail closed without a retry storm", async () => {
  let attempts = 0;
  const ready = createDatabaseReadiness({
    initialize: async () => {
      attempts += 1;
      throw Object.assign(new Error("permission denied"), { code: "42501" });
    },
    wait: async () => {},
  });
  assert.equal(await ready(), false);
  assert.equal(await ready(), false);
  assert.equal(attempts, 1);
});

test("persistent connection failure is bounded to two attempts", async () => {
  let attempts = 0;
  const ready = createDatabaseReadiness({
    initialize: async () => {
      attempts += 1;
      throw Object.assign(new Error("unreachable"), { code: "ETIMEDOUT" });
    },
    wait: async () => {},
  });
  assert.equal(await ready(), false);
  assert.equal(attempts, 2);
});
