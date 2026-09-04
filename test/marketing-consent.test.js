const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createUnsubscribeToken,
  readUnsubscribeToken,
} = require("../lib/marketing-consent");

test("unsubscribe tokens are opaque, authenticated and bound to the configured secret", () => {
  const secret = "a-test-secret-that-is-long-enough";
  const email = "cliente@example.com";
  const token = createUnsubscribeToken(email, secret);
  assert.doesNotMatch(token, /cliente|example|%40/);
  assert.equal(readUnsubscribeToken(token, secret), email);
  assert.equal(readUnsubscribeToken(token, `${secret}-wrong`), "");
  assert.equal(readUnsubscribeToken(`${token}x`, secret), "");
  assert.equal(readUnsubscribeToken("invalid", secret), "");
});
