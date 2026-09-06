const { createHash, randomBytes } = require("node:crypto");

const VERIFICATION_PURPOSE = "verify_email";
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function hashAccountToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function isAccountToken(value) {
  return /^[A-Za-z0-9_-]{40,160}$/.test(String(value || ""));
}

function createAccountVerification(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashAccountToken(token),
    purpose: VERIFICATION_PURPOSE,
    expiresAt: new Date(Number(now) + VERIFICATION_TTL_MS).toISOString(),
  };
}

module.exports = {
  VERIFICATION_PURPOSE,
  VERIFICATION_TTL_MS,
  createAccountVerification,
  hashAccountToken,
  isAccountToken,
};
