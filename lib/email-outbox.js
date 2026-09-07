const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} = require("crypto");

const OUTBOX_AAD = Buffer.from("neural-x-email-outbox:v1", "utf8");
const MAX_ATTEMPTS = 5;
const RETRY_MINUTES = 30;

function getEncryptionKey(secret) {
  const value = String(secret || "");
  if (value.length < 32) throw new Error("Email outbox encryption secret is not configured");
  return createHash("sha256").update(`neural-x:email-outbox:${value}`).digest();
}

function encryptOutboxPayload(payload, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
  cipher.setAAD(OUTBOX_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptOutboxPayload(value, secret) {
  const payload = typeof value === "string" ? JSON.parse(value) : value;
  if (
    payload?.v !== 1 ||
    typeof payload.iv !== "string" ||
    typeof payload.tag !== "string" ||
    typeof payload.ciphertext !== "string"
  ) throw new Error("Invalid encrypted email outbox payload");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(secret),
    Buffer.from(payload.iv, "base64url"),
  );
  decipher.setAAD(OUTBOX_AAD);
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const cleartext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(cleartext.toString("utf8"));
}

function validateEnvelope({ dedupeKey, emailType, payload }) {
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(String(dedupeKey || "")))
    throw new Error("Invalid email outbox dedupe key");
  if (!/^[a-z][a-z0-9_]{2,80}$/.test(String(emailType || "")))
    throw new Error("Invalid email outbox type");
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid email outbox payload");
}

async function enqueueEmail(db, { dedupeKey, emailType, payload, secret }) {
  validateEnvelope({ dedupeKey, emailType, payload });
  const encryptedPayload = JSON.stringify(encryptOutboxPayload(payload, secret));
  if (db.usePostgres) {
    const row = await db.run(
      `INSERT INTO email_outbox (dedupe_key, email_type, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id, status`,
      [dedupeKey, emailType, encryptedPayload],
    );
    return row || db.getOne(
      "SELECT id, status FROM email_outbox WHERE dedupe_key = $1 LIMIT 1",
      [dedupeKey],
    );
  }
  const inserted = await db.run(
    "INSERT OR IGNORE INTO email_outbox (dedupe_key, email_type, payload) VALUES (?, ?, ?)",
    [dedupeKey, emailType, encryptedPayload],
  );
  if (inserted?.changes)
    return { id: inserted.lastID, status: "pending" };
  return db.getOne(
    "SELECT id, status FROM email_outbox WHERE dedupe_key = ? LIMIT 1",
    [dedupeKey],
  );
}

async function claimPostgresRows(db, limit, ids) {
  const idFilter = ids.length ? "AND id = ANY($2::bigint[])" : "";
  const params = ids.length ? [limit, ids] : [limit];
  return db.query(
    `WITH next_rows AS (
       SELECT id
       FROM email_outbox
       WHERE attempts < ${MAX_ATTEMPTS}
         AND available_at <= CURRENT_TIMESTAMP
         AND (
           status IN ('pending', 'retry')
           OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes')
         )
         ${idFilter}
       ORDER BY available_at, created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE email_outbox AS outbox
     SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
     FROM next_rows
     WHERE outbox.id = next_rows.id
     RETURNING outbox.*`,
    params,
  );
}

async function claimSqliteRows(db, limit, ids) {
  const placeholders = ids.map(() => "?").join(",");
  const idFilter = ids.length ? `AND id IN (${placeholders})` : "";
  const rows = await db.query(
    `SELECT * FROM email_outbox
     WHERE attempts < ${MAX_ATTEMPTS}
       AND available_at <= CURRENT_TIMESTAMP
       AND (
         status IN ('pending', 'retry')
         OR (status = 'processing' AND updated_at < datetime('now', '-15 minutes'))
       )
       ${idFilter}
     ORDER BY available_at, created_at
     LIMIT ?`,
    [...ids, limit],
  );
  const claimed = [];
  for (const row of rows) {
    const result = await db.run(
      `UPDATE email_outbox
       SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ?`,
      [row.id, row.status],
    );
    if (result?.changes) claimed.push({ ...row, attempts: Number(row.attempts) + 1 });
  }
  return claimed;
}

function safeError(error) {
  return [error?.name, error?.code, error?.message || String(error)]
    .filter(Boolean)
    .join(": ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/\b(token|secret|key|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

async function updateDeliveryState(db, row, result, error) {
  const sent = Boolean(result?.sent) && !error;
  const terminal = !sent && Number(row.attempts) >= MAX_ATTEMPTS;
  const status = sent ? "sent" : terminal ? "dead_letter" : "retry";
  const lastError = sent
    ? null
    : safeError(error || new Error(`Email provider skipped: ${result?.skipped || "unknown"}`));
  if (db.usePostgres) {
    await db.run(
      `UPDATE email_outbox
       SET status = $1,
           sent_at = CASE WHEN $1 = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
           available_at = CASE WHEN $1 = 'retry' THEN CURRENT_TIMESTAMP + INTERVAL '${RETRY_MINUTES} minutes' ELSE available_at END,
           last_error = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [status, lastError, row.id],
    );
  } else {
    await db.run(
      `UPDATE email_outbox
       SET status = ?,
           sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
           available_at = CASE WHEN ? = 'retry' THEN datetime('now', '+${RETRY_MINUTES} minutes') ELSE available_at END,
           last_error = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, status, status, lastError, row.id],
    );
  }
  return status;
}

async function processEmailOutbox({ db, secret, senders, limit = 10, ids = [] }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 25);
  const safeIds = ids.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0);
  const rows = db.usePostgres
    ? await claimPostgresRows(db, safeLimit, safeIds)
    : await claimSqliteRows(db, safeLimit, safeIds);
  const summary = { claimed: rows.length, sent: 0, retry: 0, deadLetter: 0 };
  for (const row of rows) {
    let result;
    let error;
    try {
      const sender = senders[row.email_type];
      if (typeof sender !== "function") throw new Error("Unsupported email outbox type");
      const payload = decryptOutboxPayload(row.payload, secret);
      result = await sender(payload);
    } catch (caught) {
      error = caught;
    }
    const status = await updateDeliveryState(db, row, result, error);
    if (status === "sent") summary.sent += 1;
    else if (status === "retry") summary.retry += 1;
    else summary.deadLetter += 1;
  }
  return summary;
}

module.exports = {
  MAX_ATTEMPTS,
  RETRY_MINUTES,
  decryptOutboxPayload,
  encryptOutboxPayload,
  enqueueEmail,
  processEmailOutbox,
};
