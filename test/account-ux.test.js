const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("client and server accept strong eight-character passwords with identical rules", () => {
  for (const file of ["main.js", "server.js"]) {
    const source = fs.readFileSync(file, "utf8");
    const fn = source.match(/function isStrongPassword\(value\) \{[\s\S]*?\n\}/)[0];
    const check = vm.runInNewContext(`(${fn})`);
    assert.equal(check("Aa1!abcd"), true, file);
    assert.equal(check("Aa1!abc"), false, file);
    assert.equal(check("abcdefgh"), false, file);
    assert.equal(check("AA1!ABCD"), false, file);
    assert.equal(check("aa1!abcd"), false, file);
    assert.equal(check("Aa1!" + "x".repeat(125)), false, file);
  }
  for (const file of ["client-register.html", "client-dashboard.html"]) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /minlength="8"/);
    assert.doesNotMatch(html, /minlength="12"|12 caracteres/);
  }
});

test("hamburger strokes are centered independently of button grid layout", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(css, /\.menu-toggle \{[\s\S]*?position: relative;[\s\S]*?height: 2\.85rem;/);
  assert.match(css, /\.menu-toggle::after \{[\s\S]*?position: absolute;[\s\S]*?top: 50%;[\s\S]*?left: 50%;/);
  assert.doesNotMatch(css, /grid-template-rows: repeat\(3, min-content\)/);
});

test("success page has an initially hidden access list and never claims unverified email delivery", () => {
  const html = fs.readFileSync("success.html", "utf8");
  const main = fs.readFileSync("main.js", "utf8");
  assert.match(html, /id="confirmedAccess" hidden/);
  assert.match(html, /id="retryConfirmation"[^>]*hidden/);
  assert.match(main, /renderConfirmedAccess\(data\.products\)/);
  assert.match(main, /link\.rel = "noopener noreferrer"/);
  assert.doesNotMatch(main, /confirmação foi enviada ao e-mail/);
});
