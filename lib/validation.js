function isStripePriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ""));
}

function isStripeSessionId(value) {
  return /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(String(value || ""));
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

  const stripeKeyPattern =
    env.VERCEL_ENV === "preview"
      ? /^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+$/
      : /^(?:sk|rk)_live_[A-Za-z0-9]+$/;
  if (!stripeKeyPattern.test(String(env.STRIPE_SECRET_KEY || "")))
    errors.push("STRIPE_SECRET_KEY");

  for (const key of [
    "STRIPE_PRICE_NEURAL_X",
    "STRIPE_PRICE_FL_STUDIO",
    "STRIPE_PRICE_REAPER",
  ]) {
    if (!isStripePriceId(env[key])) errors.push(key);
  }

  for (const [urlKey, modeKey] of [
    ["PRODUCT_ACCESS_URL_NEURAL_X", "PRODUCT_ACCESS_MODE_NEURAL_X"],
    ["PRODUCT_ACCESS_URL_FL_STUDIO", "PRODUCT_ACCESS_MODE_FL_STUDIO"],
    ["PRODUCT_ACCESS_URL_REAPER", "PRODUCT_ACCESS_MODE_REAPER"],
  ]) {
    const mode = String(env[modeKey] || "").trim().toLowerCase();
    if (mode && !["automatic", "request"].includes(mode)) errors.push(modeKey);
    if (!env[urlKey]) {
      warnings.push(urlKey);
      if (mode) errors.push(modeKey);
      continue;
    }
    try {
      const url = new URL(String(env[urlKey]));
      if (url.protocol !== "https:" || url.username || url.password)
        errors.push(urlKey);
    } catch {
      errors.push(urlKey);
    }
  }

  if (!env.STRIPE_WEBHOOK_SECRET) warnings.push("STRIPE_WEBHOOK_SECRET");
  else if (!/^whsec_[A-Za-z0-9]+$/.test(String(env.STRIPE_WEBHOOK_SECRET)))
    errors.push("STRIPE_WEBHOOK_SECRET");
  const hasCaptchaSecret = Boolean(env.RECAPTCHA_SECRET);
  const hasCaptchaSiteKey = Boolean(env.RECAPTCHA_SITE_KEY);
  if (hasCaptchaSecret !== hasCaptchaSiteKey) {
    errors.push(hasCaptchaSecret ? "RECAPTCHA_SITE_KEY" : "RECAPTCHA_SECRET");
  } else if (!hasCaptchaSecret) {
    warnings.push("RECAPTCHA_SECRET", "RECAPTCHA_SITE_KEY");
  }

  if (!env.RESEND_API_KEY) warnings.push("RESEND_API_KEY");
  if (!env.EMAIL_FROM) warnings.push("EMAIL_FROM");
  if (!env.EMAIL_SUPPORT_TO) warnings.push("EMAIL_SUPPORT_TO");

  return { errors: [...new Set(errors)], warnings };
}

module.exports = {
  isStripePriceId,
  isStripeSessionId,
  validateRuntimeConfig,
};
