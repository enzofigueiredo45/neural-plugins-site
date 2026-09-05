// Requesting a recommendation is not a request to change an existing mailing
// subscription. Only an explicit opt-in can add consent; unsubscribe has its
// own endpoint. Keep this operation atomic in both supported databases.
async function saveLead(db, { email, name, interest, marketingConsent, attribution }) {
  const values = [
    email, name, interest,
    db.usePostgres ? marketingConsent : Number(marketingConsent),
    ...["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_page", "referrer"]
      .map((key) => attribution[key] || null),
  ];
  const p = (index) => `${db.usePostgres ? "$" : "?"}${index}`;
  return db.run(`INSERT INTO leads
    (email, name, interest, marketing_opt_in, marketing_consent_at, marketing_consent_version,
     utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer)
    VALUES (${p(1)},${p(2)},${p(3)},${p(4)},
      CASE WHEN ${p(4)} THEN CURRENT_TIMESTAMP ELSE NULL END,
      CASE WHEN ${p(4)} THEN 'lead-form-v2' ELSE NULL END,
      ${[5, 6, 7, 8, 9, 10, 11].map(p).join(",")})
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name, interest = excluded.interest, status = 'Novo',
      marketing_opt_in = CASE WHEN excluded.marketing_opt_in THEN excluded.marketing_opt_in ELSE leads.marketing_opt_in END,
      marketing_consent_at = CASE WHEN excluded.marketing_opt_in THEN excluded.marketing_consent_at ELSE leads.marketing_consent_at END,
      marketing_consent_version = CASE WHEN excluded.marketing_opt_in THEN excluded.marketing_consent_version ELSE leads.marketing_consent_version END,
      marketing_unsubscribed_at = CASE WHEN excluded.marketing_opt_in THEN NULL ELSE leads.marketing_unsubscribed_at END,
      utm_source = excluded.utm_source, utm_medium = excluded.utm_medium,
      utm_campaign = excluded.utm_campaign, utm_content = excluded.utm_content,
      utm_term = excluded.utm_term, landing_page = excluded.landing_page,
      referrer = excluded.referrer, updated_at = CURRENT_TIMESTAMP`, values);
}

async function migrateSqliteLeadConsent(db) {
  const columns = await db.query("PRAGMA table_info(leads)");
  const consent = columns.find((column) => column.name === "marketing_consent_at");
  if (!consent || (!consent.notnull && consent.dflt_value === null)) return;
  // SQLite needs a table rebuild to remove NOT NULL/default. Preserve every
  // existing column, row, index and trigger, and roll back the entire change
  // if an unfamiliar schema cannot be migrated safely.
  await db.run("BEGIN IMMEDIATE");
  try {
    const original = await db.getOne("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leads'");
    const dependents = await db.query("SELECT sql FROM sqlite_master WHERE tbl_name = 'leads' AND type IN ('index','trigger') AND sql IS NOT NULL");
    const create = original.sql
      .replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"leads"|leads)\s*\(/i, 'CREATE TABLE "leads_consent_migration" (')
      .replace(/marketing_consent_at\s+DATETIME(?:\s+NOT NULL)?(?:\s+DEFAULT CURRENT_TIMESTAMP)?/i, "marketing_consent_at DATETIME");
    if (!create.includes('"leads_consent_migration"') || create === original.sql)
      throw new Error("unsupported_lead_consent_schema");
    const names = columns.map(({ name }) => `"${name.replaceAll('"', '""')}"`).join(",");
    await db.run(create);
    await db.run(`INSERT INTO leads_consent_migration (${names}) SELECT ${names} FROM leads`);
    await db.run("DROP TABLE leads");
    await db.run("ALTER TABLE leads_consent_migration RENAME TO leads");
    for (const { sql } of dependents) await db.run(sql);
    const migrated = (await db.query("PRAGMA table_info(leads)")).find((column) => column.name === "marketing_consent_at");
    if (migrated.notnull || migrated.dflt_value !== null)
      throw new Error("lead_consent_migration_incomplete");
    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK");
    throw error;
  }
}

module.exports = { saveLead, migrateSqliteLeadConsent };
