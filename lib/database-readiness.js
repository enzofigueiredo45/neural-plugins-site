const TRANSIENT_CODES = new Set([
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "EAI_AGAIN",
  "57P01", "57P02", "57P03", "53300",
]);

function isTransientConnectionError(error) {
  return TRANSIENT_CODES.has(error?.code) ||
    /connection (?:timeout|terminated|closed)|timeout exceeded when trying to connect|connect ETIMEDOUT/i.test(error?.message || "");
}

// Retry only idempotent schema initialization, before any customer write.
// Concurrent requests share the same attempt, including the cold-start retry.
function createDatabaseReadiness({ initialize, onError, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let ready = false;
  let pending = null;
  let retryAfter = 0;
  return async function ensureReady() {
    if (ready) return true;
    if (pending) return pending;
    if (Date.now() < retryAfter) return false;
    pending = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await initialize();
          ready = true;
          return true;
        } catch (error) {
          if (attempt === 0 && isTransientConnectionError(error)) {
            await wait(300);
            continue;
          }
          onError?.(error);
          retryAfter = Date.now() + 5_000;
          return false;
        }
      }
      return false;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

module.exports = { createDatabaseReadiness, isTransientConnectionError };
