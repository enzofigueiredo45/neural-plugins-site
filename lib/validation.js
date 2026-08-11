const MAX_AVATAR_DATA_URL_LENGTH = 400_000;

function isStripePriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ""));
}

function isStripeSessionId(value) {
  return /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(String(value || ""));
}

function normalizeAvatarUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";

  if (candidate.length <= 2048) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:") return parsed.href;
    } catch {}
  }

  if (
    candidate.length <= MAX_AVATAR_DATA_URL_LENGTH &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(candidate)
  ) {
    return candidate;
  }

  return null;
}

function validateRuntimeConfig(env, isProduction) {
  const errors = [];
  const warnings = [];

  if (!isProduction) return { errors, warnings };

  if (String(env.SESSION_SECRET || "").length < 32)
    errors.push("SESSION_SECRET");
  if (!/^rediss?:\/\//.test(String(env.REDIS_URL || "")))
    errors.push("REDIS_URL");
  if (!/^postgres(?:ql)?:\/\//.test(String(env.DATABASE_URL || "")))
    errors.push("DATABASE_URL");

  try {
    const siteUrl = new URL(String(env.SITE_URL || ""));
    if (siteUrl.protocol !== "https:") errors.push("SITE_URL");
  } catch {
    errors.push("SITE_URL");
  }

  if (!/^sk_(?:test|live)_[A-Za-z0-9]+$/.test(String(env.STRIPE_SECRET_KEY || "")))
    errors.push("STRIPE_SECRET_KEY");

  for (const key of [
    "STRIPE_PRICE_NEURAL_X",
    "STRIPE_PRICE_FL_STUDIO",
    "STRIPE_PRICE_REAPER",
  ]) {
    if (!isStripePriceId(env[key])) errors.push(key);
  }

  if (!env.STRIPE_WEBHOOK_SECRET) warnings.push("STRIPE_WEBHOOK_SECRET");
  const hasCaptchaSecret = Boolean(env.RECAPTCHA_SECRET);
  const hasCaptchaSiteKey = Boolean(env.RECAPTCHA_SITE_KEY);
  if (hasCaptchaSecret !== hasCaptchaSiteKey) {
    errors.push(hasCaptchaSecret ? "RECAPTCHA_SITE_KEY" : "RECAPTCHA_SECRET");
  } else if (!hasCaptchaSecret) {
    warnings.push("RECAPTCHA_SECRET", "RECAPTCHA_SITE_KEY");
  }

  return { errors: [...new Set(errors)], warnings };
}

module.exports = {
  MAX_AVATAR_DATA_URL_LENGTH,
  isStripePriceId,
  isStripeSessionId,
  normalizeAvatarUrl,
  validateRuntimeConfig,
};
