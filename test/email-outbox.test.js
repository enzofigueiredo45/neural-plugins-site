const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  MAX_ATTEMPTS,
  RETRY_MINUTES,
  decryptOutboxPayload,
  encryptOutboxPayload,
  processEmailOutbox,
} = require("../lib/email-outbox");

const secret = "test-only-email-outbox-secret-that-is-long-enough";

test("email outbox encrypts recipient data at rest", () => {
  const original = { email: "controlled@example.invalid", requestId: "request-1" };
  const encrypted = encryptOutboxPayload(original, secret);
  assert.equal(JSON.stringify(encrypted).includes(original.email), false);
  assert.deepEqual(decryptOutboxPayload(encrypted, secret), original);
});

test("email outbox rejects a tampered encrypted payload", () => {
  const encrypted = encryptOutboxPayload({ email: "controlled@example.invalid" }, secret);
  encrypted.tag = "A".repeat(encrypted.tag.length);
  assert.throws(() => decryptOutboxPayload(encrypted, secret));
});

test("worker marks claimed rows as sent without exposing their payload", async () => {
  const updates = [];
  const db = {
    usePostgres: true,
    query: async () => [{
      id: 7,
      email_type: "recommendation",
      payload: encryptOutboxPayload({ email: "controlled@example.invalid" }, secret),
      attempts: 1,
    }],
    run: async (sql, params) => {
      updates.push({ sql, params });
      return null;
    },
  };
  const result = await processEmailOutbox({
    db,
    secret,
    senders: { recommendation: async () => ({ sent: true }) },
  });
  assert.deepEqual(result, { claimed: 1, sent: 1, retry: 0, deadLetter: 0 });
  assert.equal(updates.at(-1).params[0], "sent");
  assert.equal(JSON.stringify(updates).includes("controlled@example.invalid"), false);
});

test("worker schedules a retry and moves the fifth failure to dead letter", async () => {
  for (const [attempts, expected] of [[1, "retry"], [MAX_ATTEMPTS, "dead_letter"]]) {
    const updates = [];
    const db = {
      usePostgres: true,
      query: async () => [{
        id: attempts,
        email_type: "recommendation",
        payload: encryptOutboxPayload({ email: "controlled@example.invalid" }, secret),
        attempts,
      }],
      run: async (sql, params) => updates.push({ sql, params }),
    };
    const result = await processEmailOutbox({
      db,
      secret,
      senders: { recommendation: async () => { throw new Error("provider unavailable"); } },
    });
    assert.equal(updates.at(-1).params[0], expected);
    assert.equal(result[expected === "retry" ? "retry" : "deadLetter"], 1);
  }
  assert.equal(RETRY_MINUTES, 30);
});

test("worker redacts contact data and URLs from stored provider errors", async () => {
  const updates = [];
  const db = {
    usePostgres: true,
    query: async () => [{
      id: 9,
      email_type: "recommendation",
      payload: encryptOutboxPayload({ email: "controlled@example.invalid" }, secret),
      attempts: 1,
    }],
    run: async (sql, params) => updates.push({ sql, params }),
  };
  await processEmailOutbox({
    db,
    secret,
    senders: {
      recommendation: async () => {
        throw new Error("Delivery to person@example.com failed at https://provider.example/error?token=sensitive");
      },
    },
  });
  const storedError = updates.at(-1).params[1];
  assert.equal(storedError.includes("person@example.com"), false);
  assert.equal(storedError.includes("provider.example"), false);
  assert.match(storedError, /\[redacted-email\]/);
  assert.match(storedError, /\[redacted-url\]/);
});

test("PostgreSQL worker claim is concurrency-safe", () => {
  const source = fs.readFileSync("lib/email-outbox.js", "utf8");
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.match(source, /attempts < \$\{MAX_ATTEMPTS\}/);
});
