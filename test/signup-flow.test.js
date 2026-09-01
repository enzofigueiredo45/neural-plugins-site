const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const server = fs.readFileSync("server.js", "utf8");
const main = fs.readFileSync("main.js", "utf8");
const fn = (source, name) => source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`))[0];
const account = { name: "Cliente QA", email: "qa@example.invalid", password: "Aa1!abcd", acceptTerms: true };

function registrationFixture(options = {}) {
  const events = [];
  const req = { body: { ...account }, requestId: "test-only", session: {
    csrfToken: "anonymous-token",
    mfaTemp: { secret: "anonymous-state" },
    regenerate(callback) {
      events.push("regenerate");
      if (options.regenerateError) return callback(new Error("session unavailable"));
      req.session = { save(done) {
        events.push("save");
        done(options.saveError ? new Error("session unavailable") : null);
      } };
      callback();
    },
  } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { events.push("response"); this.body = body; return this; } };
  let handler;
  const context = vm.createContext({
    app: { post: (_path, ...handlers) => { handler = handlers.at(-1); } },
    asyncHandler: (f) => f, requireDatabase() {}, registrationLimiter() {},
    randomUUID: () => "rotated-csrf-token",
    isValidEmail: (email) => email.includes("@"),
    verifyCaptcha: async () => options.captcha !== false,
    bcrypt: { hash: async (_password, cost) => { assert.equal(cost, 12); events.push("hash"); return "hashed-password"; } },
    getUserSummaryByEmail: async () => { events.push("lookup"); return options.duplicate ? { id: 7, ...account, role: "client", mfa_enabled: true } : null; },
    createUser: async (email, passwordHash, role, name, acceptedTerms) => {
      events.push("insert");
      assert.equal(passwordHash, "hashed-password");
      assert.equal(acceptedTerms, true);
      if (options.insertError) throw Object.assign(new Error("insert failed"), { code: options.insertError });
      return { id: 42, email, role, name };
    },
    sendEmailSafely: async (_type, operation) => operation(),
    sendWelcomeEmail: async () => { events.push("email"); return { sent: true }; },
  });
  const route = server.slice(server.indexOf('app.post(\n  "/api/register"'), server.indexOf('app.post(\n  "/api/login/:role"'));
  vm.runInContext([fn(server, "isStrongPassword"), fn(server, "saveSession"), fn(server, "establishUserSession"), route].join("\n"), context);
  return { events, req, res, run: () => handler(req, res) };
}

test("signup authenticates only the created user, rotates CSRF and saves before success", async () => {
  const fixture = registrationFixture();
  fixture.req.body.email = " QA@EXAMPLE.INVALID ";
  await fixture.run();
  assert.equal(fixture.res.statusCode, 201);
  assert.equal(fixture.res.body.authenticated, true);
  assert.equal(fixture.res.body.csrfToken, fixture.req.session.csrfToken);
  assert.equal(fixture.req.session.user.id, 42);
  assert.equal(fixture.req.session.user.email, account.email);
  assert.equal(fixture.req.session.user.role, "client");
  assert.equal(fixture.req.session.mfaTemp, undefined);
  assert.deepEqual(fixture.events, ["hash", "lookup", "insert", "regenerate", "save", "email", "response"]);
  assert.doesNotMatch(JSON.stringify(fixture.res.body), /email|password|name/);
});

test("duplicate signup does not reveal email_taken, authenticate, change a password or send email", async () => {
  const fixture = registrationFixture({ duplicate: true });
  await fixture.run();
  assert.equal(fixture.res.statusCode, 400);
  assert.equal(fixture.res.body.error, "registration_unavailable");
  assert.equal(fixture.req.session.user, undefined);
  assert.deepEqual(fixture.events, ["hash", "lookup", "response"]);
  assert.doesNotMatch(JSON.stringify(fixture.res.body), /email|existing|taken|password/);
});

for (const code of ["23505", "SQLITE_CONSTRAINT"]) {
  test(`concurrent duplicate insert (${code}) uses the same generic response`, async () => {
    const fixture = registrationFixture({ insertError: code });
    await fixture.run();
    assert.equal(fixture.res.statusCode, 400);
    assert.equal(fixture.res.body.error, "registration_unavailable");
    assert.equal(fixture.req.session.user, undefined);
    assert.equal(fixture.events.includes("email"), false);
    assert.equal(fixture.events.includes("regenerate"), false);
  });
}

for (const failure of ["saveError", "regenerateError"]) {
  test(`signup never announces authenticated success after ${failure}`, async () => {
    const fixture = registrationFixture({ [failure]: true });
    await assert.rejects(fixture.run, /session unavailable/);
    assert.equal(fixture.res.body, undefined);
    assert.equal(fixture.events.includes("email"), false);
  });
}

test("invalid signup and captcha remain rejected before writes", async () => {
  for (const body of [{ password: "Aa1!abc" }, { acceptTerms: false }, { email: "invalid" }, { name: "X" }]) {
    const fixture = registrationFixture();
    Object.assign(fixture.req.body, body);
    await fixture.run();
    assert.equal(fixture.res.statusCode, 400);
    assert.deepEqual(fixture.events, ["response"]);
  }
  const fixture = registrationFixture({ captcha: false });
  await fixture.run();
  assert.equal(fixture.res.body.error, "captcha_failed");
  assert.deepEqual(fixture.events, ["response"]);
});

test("createUser returns the inserted identity with either database adapter", async () => {
  for (const usePostgres of [false, true]) {
    const create = vm.runInNewContext(`(${fn(server, "createUser")})`, { db: {
      usePostgres,
      run: async () => usePostgres ? { id: 42, email: account.email, role: "client", name: account.name } : { lastID: 42, changes: 1 },
    } });
    const user = await create(account.email, "hash", "client", account.name, true);
    assert.equal(user.id, 42);
    assert.equal(user.email, account.email);
    assert.equal(user.role, "client");
  }
});

function registrationUi(result) {
  const message = { textContent: "", dataset: {} };
  const button = { disabled: false, textContent: "Criar minha conta" };
  const attributes = {};
  const navigations = [];
  let submitHandler;
  let posts = 0;
  const fields = Object.fromEntries(Object.entries(account).map(([key, value]) => [key, { value, checked: value }]));
  fields.confirmPassword = { value: account.password };
  const form = {
    ...fields, reportValidity: () => true,
    elements: { namedItem: (name) => fields[name] },
    querySelector: () => button,
    addEventListener: (_name, handler) => { submitHandler = handler; },
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: (key) => { delete attributes[key]; },
  };
  const context = vm.createContext({
    document: { querySelector: (selector) => selector === "#registerForm" ? form : message },
    window: { location: { replace: (url) => navigations.push(url) } },
    getRecaptchaToken: async () => "", fetchCsrf: async () => "csrf",
    postJson: async () => { posts += 1; return result; },
  });
  const messages = main.slice(main.indexOf("const authMessages ="), main.indexOf("function initLogin()"));
  vm.runInContext([messages, fn(main, "isStrongPassword"), fn(main, "initRegistration"), "initRegistration();"].join("\n"), context);
  return { form, message, button, attributes, navigations, posts: () => posts, submit: () => submitHandler({ preventDefault() {} }) };
}

test("signup UI goes directly to the account, prevents double submits and removes artificial waiting", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const fixture = registrationUi(pending);
  const first = fixture.submit();
  assert.equal(fixture.attributes["aria-busy"], "true");
  await fixture.submit();
  resolve({ response: { ok: true }, data: { ok: true, authenticated: true } });
  await first;
  assert.equal(fixture.posts(), 1);
  assert.deepEqual(fixture.navigations, ["./client-dashboard.html"]);
  assert.equal(fixture.message.dataset.state, "success");
  assert.equal(fixture.button.disabled, true);
  assert.equal(fixture.attributes["aria-busy"], undefined);
  assert.doesNotMatch(fn(main, "initRegistration"), /setTimeout|localStorage|writeCart|client-login\.html\?email/);
});

test("signup UI keeps data, stays on-page for errors, and requires server-confirmed authentication", async () => {
  for (const result of [
    { response: { ok: false }, data: { error: "registration_unavailable" } },
    { response: { ok: false }, data: { error: "server_error" } },
    { response: { ok: true }, data: { ok: true } },
  ]) {
    const fixture = registrationUi(result);
    await fixture.submit();
    assert.deepEqual(fixture.navigations, []);
    assert.equal(fixture.message.dataset.state, "error");
    assert.equal(fixture.button.disabled, false);
    assert.equal(fixture.form.email.value, account.email);
    assert.doesNotMatch(fixture.message.textContent, /existe uma conta|cadastrado/);
  }
});

test("temporary account failures stay on the dashboard; only auth failures go to login", async () => {
  const source = main.slice(main.indexOf("  const loadAccount = async () =>"), main.indexOf("  const loadOrders = async () =>"));
  for (const status of [401, 429, 500, 503]) {
    const errorPanel = { hidden: true };
    const navigation = [];
    const load = vm.runInNewContext(`${source}; loadAccount`, {
      fetch: async () => ({ status, ok: false }),
      document: { querySelector: () => errorPanel },
      window: { location: { replace: (url) => navigation.push(url) } },
    });
    assert.equal(await load(), null);
    assert.equal(navigation.length, status === 401 ? 1 : 0);
    assert.equal(errorPanel.hidden, status === 401);
  }
});

test("media-only caching never broadens caching of authenticated APIs or unversioned application code", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const cached = config.headers.filter((rule) => rule.headers.some((header) => header.key === "Cache-Control"));
  assert.deepEqual(cached.map((rule) => rule.source), ["/assets/:path*"]);
  assert.equal(cached[0].headers[0].value, "public, max-age=3600, s-maxage=86400");
  assert.match(server, /res\.setHeader\("Cache-Control", "no-store"\)/);
  assert.match(main, /if \(!document\.querySelector\("#registerForm, #loginForm"\)\) void syncPublicCatalog\(\)/);
});
