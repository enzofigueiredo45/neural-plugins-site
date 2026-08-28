const { createHmac, timingSafeEqual } = require("node:crypto");

const MERCADO_PAGO_API = "https://api.mercadopago.com";

class MercadoPagoRequestError extends Error {
  constructor(message, { statusCode, code, cause } = {}) {
    super(message, { cause });
    this.name = "MercadoPagoRequestError";
    this.statusCode = statusCode || 502;
    this.code = code || "mercado_pago_request_error";
  }
}

function isMercadoPagoPaymentId(value) {
  return /^\d{1,30}$/.test(String(value || ""));
}

function parseSignatureHeader(value) {
  const parts = Object.fromEntries(
    String(value || "")
      .split(",")
      .map((part) => part.trim().split("=", 2))
      .filter(([key, fieldValue]) => key && fieldValue),
  );
  return { timestamp: parts.ts || "", signature: parts.v1 || "" };
}

function buildWebhookManifest({ dataId, requestId, timestamp }) {
  const normalizedId = String(dataId || "").trim().toLowerCase();
  const normalizedRequestId = String(requestId || "").trim();
  const normalizedTimestamp = String(timestamp || "").trim();
  if (!normalizedId || !/^\d+$/.test(normalizedTimestamp)) return "";
  return [
    `id:${normalizedId};`,
    normalizedRequestId ? `request-id:${normalizedRequestId};` : "",
    `ts:${normalizedTimestamp};`,
  ].join("");
}

function verifyWebhookSignature({ dataId, requestId, signatureHeader, secret }) {
  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  if (!/^[a-fA-F0-9]{64}$/.test(signature) || !String(secret || ""))
    return false;
  const manifest = buildWebhookManifest({ dataId, requestId, timestamp });
  if (!manifest) return false;
  const expected = createHmac("sha256", String(secret))
    .update(manifest)
    .digest("hex");
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}

function normalizeCheckoutUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.toLowerCase();
    const officialHost =
      hostname === "mercadopago.com" ||
      hostname.endsWith(".mercadopago.com") ||
      hostname === "mercadopago.com.br" ||
      hostname.endsWith(".mercadopago.com.br");
    if (url.protocol !== "https:" || !officialHost || url.username || url.password)
      return null;
    return url.href;
  } catch {
    return null;
  }
}

async function requestJson(path, { accessToken, method = "GET", body, idempotencyKey, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${MERCADO_PAGO_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    throw new MercadoPagoRequestError("Mercado Pago request failed", { cause });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new MercadoPagoRequestError("Mercado Pago returned an error", {
      statusCode: response.status,
      code: String(data?.error || data?.code || "mercado_pago_api_error").slice(0, 120),
    });
  }
  if (!data || typeof data !== "object")
    throw new MercadoPagoRequestError("Mercado Pago returned an invalid response");
  return data;
}

async function createPreference({ accessToken, preference, idempotencyKey, fetchImpl }) {
  const data = await requestJson("/checkout/preferences", {
    accessToken,
    method: "POST",
    body: preference,
    idempotencyKey,
    fetchImpl,
  });
  const url = normalizeCheckoutUrl(data.init_point);
  if (!String(data.id || "").trim() || !url)
    throw new MercadoPagoRequestError("Mercado Pago returned an invalid preference");
  return { id: String(data.id), url };
}

async function getPayment({ accessToken, paymentId, fetchImpl }) {
  if (!isMercadoPagoPaymentId(paymentId))
    throw new MercadoPagoRequestError("Invalid Mercado Pago payment ID", {
      statusCode: 400,
      code: "invalid_payment_id",
    });
  return requestJson(`/v1/payments/${paymentId}`, { accessToken, fetchImpl });
}

module.exports = {
  MERCADO_PAGO_API,
  MercadoPagoRequestError,
  buildWebhookManifest,
  createPreference,
  getPayment,
  isMercadoPagoPaymentId,
  normalizeCheckoutUrl,
  parseSignatureHeader,
  verifyWebhookSignature,
};
