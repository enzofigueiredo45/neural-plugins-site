const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3");
const { saveLead, migrateSqliteLeadConsent } = require("../lib/lead-storage");

function database(t) {
  const sqlite = new sqlite3.Database(":memory:");
  t.after(() => new Promise((resolve, reject) => sqlite.close((err) => err ? reject(err) : resolve())));
  const db = {
    usePostgres: false,
    run: (sql, params = []) => new Promise((resolve, reject) => sqlite.run(sql, params, (err) => err ? reject(err) : resolve())),
    query: (sql, params = []) => new Promise((resolve, reject) => sqlite.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))),
  };
  db.getOne = async (sql, params) => (await db.query(sql, params))[0];
  return db;
}

const schema = `CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  interest TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Novo', marketing_opt_in INTEGER DEFAULT 0,
  marketing_consent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  marketing_consent_version TEXT, marketing_unsubscribed_at DATETIME,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  landing_page TEXT, referrer TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, custom_field TEXT
)`;

test("legacy SQLite consent migration preserves records, custom columns, indexes and triggers", async (t) => {
  const db = database(t);
  await db.run(schema);
  await db.run("CREATE INDEX custom_lead_index ON leads(custom_field)");
  await db.run("CREATE TABLE lead_audit (action TEXT)");
  await db.run("CREATE TRIGGER lead_insert_log AFTER INSERT ON leads BEGIN INSERT INTO lead_audit(action) VALUES ('insert'); END");
  await db.run("INSERT INTO leads (email,name,interest,marketing_opt_in,marketing_consent_version,custom_field) VALUES ('existing@example.invalid','Existing','guitar',1,'lead-form-v2','keep')");
  const before = await db.getOne("SELECT * FROM leads");
  await migrateSqliteLeadConsent(db);
  assert.deepEqual(await db.getOne("SELECT * FROM leads"), before);
  const consent = (await db.query("PRAGMA table_info(leads)")).find((c) => c.name === "marketing_consent_at");
  assert.equal(consent.notnull, 0);
  assert.equal(consent.dflt_value, null);
  assert.ok(await db.getOne("SELECT name FROM sqlite_master WHERE name = 'custom_lead_index'"));
  await migrateSqliteLeadConsent(db);
  await saveLead(db, { email: "new@example.invalid", name: "New", interest: "guitar", marketingConsent: false, attribution: {} });
  assert.equal((await db.getOne("SELECT marketing_consent_at FROM leads WHERE email = 'new@example.invalid'")).marketing_consent_at, null);
  assert.equal((await db.getOne("SELECT count(*) AS count FROM lead_audit")).count, 2);
});

test("requests preserve consent and unsubscribe; only explicit reconsent enrolls again", async (t) => {
  const db = database(t);
  await db.run(schema);
  await migrateSqliteLeadConsent(db);
  const input = { email: "qa@example.invalid", name: "QA", interest: "guitar", attribution: {}, marketingConsent: false };
  await saveLead(db, input);
  let row = await db.getOne("SELECT * FROM leads");
  assert.equal(row.marketing_opt_in, 0);
  assert.equal(row.marketing_consent_at, null);
  await saveLead(db, { ...input, marketingConsent: true });
  row = await db.getOne("SELECT * FROM leads");
  assert.equal(row.marketing_opt_in, 1);
  assert.equal(row.marketing_consent_version, "lead-form-v2");
  await saveLead(db, input);
  assert.equal((await db.getOne("SELECT * FROM leads")).marketing_consent_at, row.marketing_consent_at);
  assert.equal((await db.getOne("SELECT * FROM leads")).marketing_opt_in, 1);
  await db.run("UPDATE leads SET marketing_opt_in = 0, marketing_unsubscribed_at = '2026-09-05T12:00:00Z'");
  await saveLead(db, input);
  row = await db.getOne("SELECT * FROM leads");
  assert.equal(row.marketing_opt_in, 0);
  assert.equal(row.marketing_unsubscribed_at, "2026-09-05T12:00:00Z");
  await saveLead(db, { ...input, marketingConsent: true });
  row = await db.getOne("SELECT * FROM leads");
  assert.equal(row.marketing_opt_in, 1);
  assert.equal(row.marketing_unsubscribed_at, null);
});

test("Postgres upsert is parameterized and keeps false requests separate from revocation", async () => {
  let statement;
  let values;
  await saveLead({ usePostgres: true, run: async (sql, params) => { statement = sql; values = params; } }, {
    email: "qa@example.invalid", name: "QA", interest: "guitar", marketingConsent: false,
    attribution: { utm_source: "instagram" },
  });
  assert.equal(values[3], false);
  assert.equal(values[4], "instagram");
  assert.match(statement, /CASE WHEN \$4 THEN CURRENT_TIMESTAMP ELSE NULL END/);
  assert.match(statement, /ELSE leads.marketing_opt_in END/);
  assert.match(statement, /ELSE leads.marketing_unsubscribed_at END/);
  assert.doesNotMatch(statement, /qa@example|\?\d/);
});
