const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const bootstrap = source.lastIndexOf("\ninitAnalytics();");
assert.ok(bootstrap > 0, "The test must not run the application bootstrap");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function harness({ consent = "", url = "https://neuralxplugins.com.br/", stored = {} } = {}) {
  const calls = [];
  const vercelCalls = [];
  const controls = new Map();
  const localStorage = memoryStorage({
    neuralx_measurement_consent: consent,
    neuralx_measurement_consent_version: "2",
    ...stored,
  });
  const sessionStorage = memoryStorage();
  const document = {
    body: { dataset: { page: "store" }, append() {} },
    documentElement: { dataset: {} },
    referrer: "",
    title: "Neural X",
    head: { append() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    dispatchEvent() {},
    createElement: () => ({
      dataset: {}, setAttribute() {}, remove() {},
      querySelector: (selector) => ({
        addEventListener: (event, handler) => controls.set(`${selector}:${event}`, handler),
      }),
    }),
  };
  const window = {
    location: new URL(url),
    gtag: (...args) => calls.push(args),
    va: (...args) => vercelCalls.push(args),
    addEventListener() {},
    crypto: { randomUUID: () => "test-funnel-id-00000001" },
  };
  const context = vm.createContext({
    window, document, localStorage, sessionStorage,
    URL, URLSearchParams, console, Date, CustomEvent: class {},
    setTimeout, clearTimeout,
    fetch: () => { throw new Error("Tests must not make external requests"); },
  });
  vm.runInContext(source.slice(0, bootstrap), context);
  const run = (code) => vm.runInContext(code, context);
  const events = (name) => calls.filter((entry) => entry[0] === "event" && entry[1] === name);
  return { context, calls, controls, document, events, localStorage, run, sessionStorage, vercelCalls, window };
}

test("purchase is not marked delivered to GA4 before measurement consent", () => {
  const h = harness();
  h.run('trackPurchaseOnce("test-order-1", { value: 29.9, currency: "BRL" })');
  assert.equal(h.events("purchase").length, 0);
  h.run('setMeasurementConsent("granted"); trackPurchaseOnce("test-order-1", { value: 29.9, currency: "BRL" })');
  assert.equal(h.events("purchase").length, 1);
  h.run('trackPurchaseOnce("test-order-1", { value: 29.9, currency: "BRL" })');
  assert.equal(h.events("purchase").length, 1);
});

test("accepting the consent banner flushes a confirmed purchase once", () => {
  const h = harness();
  h.run('showMeasurementConsent(); trackPurchaseOnce("test-order-2", { value: 19.9, currency: "BRL" })');
  h.controls.get("[data-measurement-accept]:click")();
  assert.equal(h.events("purchase").length, 1);
  assert.equal(h.events("conversion").length, 1);
  assert.equal(h.events("purchase")[0][2].value, 19.9);
});

test("essential-only does not send custom analytics or persist attribution", () => {
  const h = harness({ consent: "denied", url: "https://neuralxplugins.com.br/?utm_source=instagram&utm_medium=social" });
  h.run('captureAttribution(); trackEvent("generate_lead", { interest: "guitar" })');
  assert.equal(h.events("generate_lead").length, 0);
  assert.equal(h.vercelCalls.filter((entry) => entry[0] === "event").length, 0);
  assert.equal(h.localStorage.getItem("neuralx_attribution"), null);
  assert.equal(h.sessionStorage.getItem("neuralx_funnel_id"), null);
});

test("a new source cannot inherit campaign fields from a different visit", () => {
  const h = harness({
    consent: "granted",
    url: "https://neuralxplugins.com.br/produto-neural-x.html?utm_source=ig&utm_medium=organic_social",
    stored: { neuralx_attribution: JSON.stringify({
      utm_source: "youtube", utm_medium: "social", utm_campaign: "older_campaign",
      utm_content: "older_video", first_seen_at: new Date().toISOString(), landing_page: "/guias.html",
    }) },
  });
  h.run("captureAttribution()");
  const value = JSON.parse(h.run("JSON.stringify(readAttribution())"));
  assert.equal(value.utm_source, "instagram");
  assert.equal(value.utm_medium, "social");
  assert.equal(value.utm_campaign, undefined);
  assert.equal(value.utm_content, undefined);
  assert.equal(value.landing_page, "/produto-neural-x.html");
});

test("attribution expires instead of labelling every future visit forever", () => {
  const h = harness({ consent: "granted", stored: {
    neuralx_attribution: JSON.stringify({ utm_source: "instagram", first_seen_at: "2020-01-01T00:00:00.000Z" }),
  } });
  h.run("captureAttribution()");
  assert.equal(h.run("readAttribution().utm_source"), undefined);
});

test("GA4 receives no email or checkout token in page or referrer URLs", () => {
  const h = harness({
    consent: "granted",
    url: "https://neuralxplugins.com.br/success.html?session_id=cs_test_sensitive&email=private%40example.com&utm_source=ig",
  });
  h.document.referrer = "https://checkout.stripe.com/c/pay/cs_test_sensitive?email=private%40example.com";
  h.run("captureAttribution(); loadGoogleMeasurementTag()");
  const ga4Config = h.calls.find((entry) => entry[0] === "config" && entry[1] === "G-JY83B1EM8L")[2];
  assert.ok(ga4Config.page_location, "An explicitly sanitized URL is required");
  assert.doesNotMatch(ga4Config.page_location, /private|session_id|cs_test_sensitive/);
  assert.doesNotMatch(ga4Config.page_referrer || "", /private|cs_test_sensitive/);
});

test("untrusted campaign values cannot send contact information to analytics", () => {
  const h = harness({ consent: "granted", url: "https://neuralxplugins.com.br/?utm_campaign=private%40example.com&utm_source=instagram" });
  h.run('captureAttribution(); trackEvent("view_item", { product_id: "neural-x" })');
  assert.doesNotMatch(JSON.stringify(h.events("view_item")), /private@|private%40/);
});

test("first-page storefront view remains measurable after consent", () => {
  const h = harness();
  h.run('trackStorefrontViewOnce("store")');
  h.run('setMeasurementConsent("granted"); trackStorefrontViewOnce("store")');
  assert.equal(h.events("storefront_view").length, 1);
});

test("essential-only discards the pending purchase without a later replay", () => {
  const h = harness();
  h.run('showMeasurementConsent(); trackPurchaseOnce("test-order-denied", { value: 19.9, currency: "BRL" })');
  h.controls.get("[data-measurement-essential]:click")();
  h.controls.get("[data-measurement-accept]:click")();
  assert.equal(h.events("purchase").length, 0);
  assert.equal(h.events("conversion").length, 0);
});

test("a storage write failure cannot send the same GA4 purchase twice", () => {
  const h = harness({ consent: "granted" });
  h.localStorage.setItem = () => { throw new Error("storage unavailable"); };
  h.run('trackPurchaseOnce("test-order-storage", { value: 29.9, currency: "BRL" })');
  h.run('trackPurchaseOnce("test-order-storage", { value: 29.9, currency: "BRL" })');
  assert.equal(h.events("purchase").length, 1);
});

test("a failed analytics queue does not mark a purchase as measured", () => {
  const h = harness({ consent: "granted" });
  const original = h.window.gtag;
  h.window.gtag = () => { throw new Error("tag unavailable"); };
  h.run('trackPurchaseOnce("test-order-retry", { value: 29.9, currency: "BRL" })');
  assert.equal(h.localStorage.getItem("neuralx_ga4_purchases_v2"), null);
  h.window.gtag = original;
  h.run('trackPurchaseOnce("test-order-retry", { value: 29.9, currency: "BRL" })');
  assert.equal(h.events("purchase").length, 1);
});
