'use strict';

function logRequest({ req, res, logger, enabled }) {
  if (!enabled) return;
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.log(
      `${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
    );
  });
}

module.exports = { logRequest };
