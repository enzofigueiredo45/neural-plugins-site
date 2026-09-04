const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} = require("node:crypto");

const TOKEN_VERSION = "v1";
const TOKEN_AAD = Buffer.from("neural-x:marketing-unsubscribe:v1", "utf8");

function getTokenKey(secret) {
  const value = String(secret || "");
  if (value.length < 16) throw new Error("unsubscribe_secret_not_configured");
  return createHash("sha256")
    .update(`neural-x:marketing:${value}`, "utf8")
    .digest();
}

function createUnsubscribeToken(email, secret) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254)
    throw new Error("invalid_unsubscribe_email");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTokenKey(secret), iv);
  cipher.setAAD(TOKEN_AAD);
  const encrypted = Buffer.concat([
    cipher.update(normalizedEmail, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function readUnsubscribeToken(token, secret) {
  try {
    const value = String(token || "");
    if (value.length < 40 || value.length > 512) return "";
    const [version, ivValue, tagValue, encryptedValue, extra] = value.split(".");
    if (
      version !== TOKEN_VERSION ||
      !ivValue ||
      !tagValue ||
      !encryptedValue ||
      extra
    )
      return "";
    const iv = Buffer.from(ivValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    const encrypted = Buffer.from(encryptedValue, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || !encrypted.length) return "";
    const decipher = createDecipheriv("aes-256-gcm", getTokenKey(secret), iv);
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(tag);
    const email = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8").trim().toLowerCase();
    return email.length <= 254 && /^\S+@\S+\.\S+$/.test(email) ? email : "";
  } catch {
    return "";
  }
}

module.exports = { createUnsubscribeToken, readUnsubscribeToken };
