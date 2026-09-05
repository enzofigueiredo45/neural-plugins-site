const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createUnsubscribeToken,
  readUnsubscribeToken,
} = require("../lib/marketing-consent");

test("unsubscribe tokens are opaque, authenticated and bound to the configured secret", () => {
  const secret = "a-test-secret-that-is-long-enough";
  const email = "cliente@example.com";
  const token = createUnsubscribeToken(email, secret);
  assert.doesNotMatch(token, /cliente|example|%40/);
  assert.equal(readUnsubscribeToken(token, secret), email);
  assert.equal(readUnsubscribeToken(token, `${secret}-wrong`), "");
  assert.equal(readUnsubscribeToken(`${token}x`, secret), "");
  assert.equal(readUnsubscribeToken("invalid", secret), "");
});

test("legacy SQLite leads migrate without inventing marketing consent", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "neural-consent-"));
  const sqliteFile = path.join(directory, "legacy.sqlite");
  const script = `
    const sqlite3 = require("sqlite3").verbose();
    const legacy = new sqlite3.Database(process.env.SQLITE_FILE);
    legacy.exec(\`CREATE TABLE leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      interest TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Novo',
      marketing_opt_in INTEGER NOT NULL DEFAULT 0,
      marketing_consent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      marketing_consent_version TEXT,
      marketing_unsubscribed_at DATETIME,
      utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT,
      utm_term TEXT, landing_page TEXT, referrer TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO leads (email, name, interest, marketing_opt_in)
      VALUES ('sem-consentimento@example.invalid', 'Sem Consentimento', 'neural-x', 0);
    INSERT INTO leads (email, name, interest, marketing_opt_in, marketing_consent_version)
      VALUES ('com-consentimento@example.invalid', 'Com Consentimento', 'neural-x', 1, 'legacy-v1');\`, async (error) => {
      if (error) throw error;
      legacy.close(async (closeError) => {
        if (closeError) throw closeError;
        const db = require("./lib/db");
        await db.initSqlite();
        const columns = await db.query("PRAGMA table_info(leads)");
        const consentColumn = columns.find((column) => column.name === "marketing_consent_at");
        if (Number(consentColumn.notnull) !== 0 || consentColumn.dflt_value != null)
          throw new Error("unsafe_consent_schema");
        const rows = await db.query("SELECT email, marketing_consent_at FROM leads ORDER BY email");
        if (!rows[0].marketing_consent_at) throw new Error("opt_in_evidence_lost");
        if (rows[1].marketing_consent_at !== null) throw new Error("false_consent_evidence");
        await db.close();
      });
    });
  `;

  try {
    execFileSync(process.execPath, ["-e", script], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: "", SQLITE_FILE: sqliteFile },
      stdio: "pipe",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
