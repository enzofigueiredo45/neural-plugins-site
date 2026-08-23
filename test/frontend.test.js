const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html"));

test("all internal links and assets referenced by HTML exist", () => {
  const missing = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (
        !value ||
        value.startsWith("#") ||
        value.startsWith("data:") ||
        value.startsWith("https://") ||
        value.startsWith("http://") ||
        value.startsWith("/api/")
      )
        continue;
      const pathname = value.split(/[?#]/, 1)[0];
      const target = pathname === "/"
        ? path.join(root, "index.html")
        : path.resolve(root, pathname.replace(/^\//, ""));
      if (!fs.existsSync(target)) missing.push(`${file}: ${value}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("structured data and web manifest contain valid JSON", () => {
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )) {
      assert.doesNotThrow(() => JSON.parse(match[1]), file);
    }
  }
  assert.doesNotThrow(() =>
    JSON.parse(fs.readFileSync(path.join(root, "site.webmanifest"), "utf8")),
  );
});

test("private commerce and account pages are not indexable", () => {
  for (const file of [
    "cart.html",
    "client-dashboard.html",
    "client-login.html",
    "client-register.html",
    "success.html",
  ]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /<meta name="robots" content="noindex,(?:no)?follow">/);
  }
});

test("browser-delivered files contain no Stripe or webhook secrets", () => {
  for (const file of [...htmlFiles, "main.js", "styles.css"]) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(content, /(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{12,}/, file);
    assert.doesNotMatch(content, /whsec_[A-Za-z0-9]{12,}/, file);
  }
});

test("storefront exposes measurable offers without using HTML prices as checkout authority", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const cart = fs.readFileSync(path.join(root, "cart.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  for (const productId of ["neural-x", "fl-studio", "reaper"]) {
    assert.match(index, new RegExp(`data-product-price="${productId}"`));
    assert.match(index, new RegExp(`data-offer-select="${productId}"`));
  }
  assert.match(cart, /id="fulfillmentNote"/);
  assert.match(main, /fetch\("\/api\/catalog"\)/);
  for (const eventName of [
    "view_item",
    "select_offer",
    "add_to_cart",
    "begin_checkout",
    "checkout_created",
    "purchase",
    "generate_lead",
  ]) {
    assert.match(main, new RegExp(`"${eventName}"`));
  }
});

test("lead capture is explicit, consented and connected to the privacy policy", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const database = fs.readFileSync(path.join(root, "lib/db.js"), "utf8");
  assert.match(index, /id="leadForm"/);
  assert.match(index, /name="marketingConsent"[^>]*required/);
  assert.match(index, /href="\.\/privacy\.html"/);
  assert.match(server, /"\/api\/leads"/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS leads/);
  assert.match(privacy, /cancelar o consentimento/);
});

test("product pages identify the stable store product", () => {
  const pages = {
    "produto-neural-x.html": "neural-x",
    "produto-fl-studio.html": "fl-studio",
    "produto-reaper.html": "reaper",
  };
  for (const [file, productId] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, new RegExp(`<body data-product-id="${productId}">`));
    assert.match(html, new RegExp(`data-product-price="${productId}"`));
  }
});

test("Neural DSP page includes an accessible measured video demo", () => {
  const page = fs.readFileSync(path.join(root, "produto-neural-x.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(page, /<video[^>]+controls[^>]+playsinline/);
  assert.match(page, /data-product-video="neural-x"/);
  assert.match(page, /neural-dsp-comparacao-clean-neural-x\.mp4/);
  assert.match(page, /neural-dsp-comparacao-clean-neural-x-poster\.jpg/);
  assert.match(page, /O vídeo demonstra 3 dos 23 plugins/);
  for (const eventName of ["video_start", "video_half", "video_complete"])
    assert.match(main, new RegExp(`"${eventName}"`));
});

test("client dashboard includes a protected MFA disable flow", () => {
  const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(dashboard, /id="mfaDisable"[^>]*hidden/);
  assert.match(dashboard, /id="mfaDisablePassword"/);
  assert.match(dashboard, /id="mfaDisableToken"/);
  assert.match(main, /postJson\("\/api\/mfa\/disable"/);
});
