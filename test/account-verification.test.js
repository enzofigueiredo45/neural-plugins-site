const test = require("node:test");
const assert = require("node:assert/strict");
const {
  VERIFICATION_PURPOSE,
  VERIFICATION_TTL_MS,
  createAccountVerification,
  hashAccountToken,
  isAccountToken,
} = require("../lib/account-verification");

test("email verification tokens are opaque, hashed and time limited", () => {
  const now = Date.parse("2026-09-06T00:00:00.000Z");
  const first = createAccountVerification(now);
  const second = createAccountVerification(now);
  assert.equal(first.purpose, VERIFICATION_PURPOSE);
  assert.equal(isAccountToken(first.token), true);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashAccountToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(Date.parse(first.expiresAt) - now, VERIFICATION_TTL_MS);
});

test("malformed account tokens are rejected before database access", () => {
  for (const value of ["", "short", "contains spaces", "../unsafe", "a".repeat(161)])
    assert.equal(isAccountToken(value), false);
});
