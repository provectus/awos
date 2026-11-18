'use strict';

function createRequestLog({ logger = console, enabled = true } = {}) {
  function log(req, res, startedAt) {
    if (!enabled) return;
    const elapsedMs = Date.now() - startedAt;
    logger.log(
      `${req.method} ${req.url} -> ${res.statusCode} (${elapsedMs}ms)`
    );
  }

  return { log };
}

module.exports = { createRequestLog };
