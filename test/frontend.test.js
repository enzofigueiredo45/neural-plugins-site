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
