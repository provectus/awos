'use strict';

// In-process retry with exponential backoff. Errors that declare
// `retryable: false` fail immediately; everything else is retried up to
// `attempts` times.

async function withRetry(fn, { attempts = 3, baseDelayMs = 25, onRetry } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (err && err.retryable === false) throw err;
      if (attempt === attempts) break;
      if (onRetry) onRetry(err, attempt);
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withRetry };
