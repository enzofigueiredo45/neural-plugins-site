const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getMetaConversionsConfig,
  isMetaEventId,
  sanitizeMetaPagePath,
  sendMetaConversionEvent,
} = require("../lib/meta-conversions");

test("Meta server events stay disabled without a secret token", async () => {
  assert.equal(getMetaConversionsConfig({}).enabled, false);
  const result = await sendMetaConversionEvent({
    eventName: "Lead",
    eventId: "nx_Lead_1234567890123456",
    clientIp: "127.0.0.1",
    clientUserAgent: "test",
  }, {});
  assert.deepEqual(result, { sent: false, reason: "not_configured" });
});

test("Meta server event sends no email and supports Test Events", async () => {
  let captured;
  const response = await sendMetaConversionEvent({
    eventName: "Lead",
    eventId: "nx_Lead_1234567890123456",
    eventSourceUrl: "https://neuralxplugins.com.br/gratis.html",
    clientIp: "203.0.113.10",
    clientUserAgent: "Neural X test browser",
    customData: { content_name: "checklist_software_musical" },
  }, {
    META_CONVERSIONS_ACCESS_TOKEN: "secret-token-with-safe-length",
    META_DATASET_ID: "2096581227895518",
    META_GRAPH_API_VERSION: "v25.0",
    META_TEST_EVENT_CODE: "TEST84663",
  }, async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      headers: { get: () => "trace-1" },
      json: async () => ({ events_received: 1 }),
    };
  });

  assert.equal(response.sent, true);
  assert.equal(captured.url, "https://graph.facebook.com/v25.0/2096581227895518/events");
  assert.equal(captured.options.headers.Authorization, "Bearer secret-token-with-safe-length");
  const payload = JSON.parse(captured.options.body);
  assert.equal(payload.test_event_code, "TEST84663");
  assert.equal(payload.data[0].event_id, "nx_Lead_1234567890123456");
  assert.equal(payload.data[0].user_data.client_ip_address, "203.0.113.10");
  assert.doesNotMatch(JSON.stringify(payload), /email|@/i);
});

test("Meta event identifiers and page paths are constrained", () => {
  assert.equal(isMetaEventId("nx_PageView_1234567890123456"), true);
  assert.equal(isMetaEventId("short"), false);
  assert.equal(sanitizeMetaPagePath("/gratis.html"), "/gratis.html");
  assert.equal(sanitizeMetaPagePath("https://evil.example/path"), "/gratis.html");
});
