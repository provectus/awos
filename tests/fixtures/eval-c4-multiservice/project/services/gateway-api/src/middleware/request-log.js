'use strict';

// Structured-ish access log, one line per request. Disabled in tests via the
// `enabled` flag rather than by swapping the logger.

function createRequestLog({ logger = console, enabled = true } = {}) {
  function log(req, res, startedAtMs) {
    if (!enabled) return;
    const durationMs = Date.now() - startedAtMs;
    logger.log(
      `[gateway] ${req.method} ${req.url} -> ${res.statusCode} (${durationMs}ms)`
    );
  }

  return { log };
}

module.exports = { createRequestLog };
