const DEFAULT_DATASET_ID = "2096581227895518";
const DEFAULT_GRAPH_API_VERSION = "v25.0";
const ALLOWED_EVENTS = new Set(["PageView", "Lead"]);

function getMetaConversionsConfig(env = process.env) {
  const datasetId = String(env.META_DATASET_ID || DEFAULT_DATASET_ID).trim();
  const accessToken = String(env.META_CONVERSIONS_ACCESS_TOKEN || "").trim();
  const graphApiVersion = String(
    env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
  ).trim();
  const testEventCode = String(env.META_TEST_EVENT_CODE || "").trim();
  const enabled =
    /^\d{8,32}$/.test(datasetId) &&
    /^v\d{1,2}\.\d$/.test(graphApiVersion) &&
    accessToken.length >= 20;
  return {
    accessToken,
    datasetId,
    enabled,
    graphApiVersion,
    testEventCode,
  };
}

function isMetaEventId(value) {
  return /^[A-Za-z0-9:_-]{16,100}$/.test(String(value || ""));
}

function sanitizeMetaPagePath(value) {
  const path = String(value || "").trim();
  return /^\/[A-Za-z0-9/_\-.]{1,200}$/.test(path) ? path : "/gratis.html";
}

async function sendMetaConversionEvent(
  {
    eventName,
    eventId,
    eventSourceUrl,
    clientIp,
    clientUserAgent,
    customData,
  },
  env = process.env,
  fetchImpl = fetch,
) {
  const config = getMetaConversionsConfig(env);
  if (!config.enabled) return { sent: false, reason: "not_configured" };
  if (!ALLOWED_EVENTS.has(eventName) || !isMetaEventId(eventId))
    return { sent: false, reason: "invalid_event" };

  const userData = {};
  if (clientIp) userData.client_ip_address = String(clientIp).slice(0, 64);
  if (clientUserAgent)
    userData.client_user_agent = String(clientUserAgent).slice(0, 500);
  if (!Object.keys(userData).length)
    return { sent: false, reason: "missing_user_data" };

  const event = {
    action_source: "website",
    event_id: eventId,
    event_name: eventName,
    event_source_url: String(eventSourceUrl || "").slice(0, 500),
    event_time: Math.floor(Date.now() / 1000),
    user_data: userData,
  };
  if (customData && Object.keys(customData).length)
    event.custom_data = customData;
  const payload = { data: [event] };
  if (config.testEventCode) payload.test_event_code = config.testEventCode;

  const response = await fetchImpl(
    `https://graph.facebook.com/${config.graphApiVersion}/${config.datasetId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4_000),
    },
  );
  const responseData = await response.json().catch(() => ({}));
  if (!response.ok || Number(responseData.events_received || 0) < 1) {
    const error = new Error("meta_conversion_rejected");
    error.code = responseData?.error?.code || response.status;
    error.type = responseData?.error?.type || "MetaConversionsApiError";
    error.requestId = response.headers?.get?.("x-fb-trace-id") || undefined;
    throw error;
  }
  return {
    sent: true,
    eventsReceived: Number(responseData.events_received),
    traceId: response.headers?.get?.("x-fb-trace-id") || "",
  };
}

module.exports = {
  getMetaConversionsConfig,
  isMetaEventId,
  sanitizeMetaPagePath,
  sendMetaConversionEvent,
};
