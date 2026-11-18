'use strict';

function registerHealthRoutes(router) {
  router.get('/health', async () => ({
    statusCode: 200,
    body: { status: 'ok', service: 'ingest-api' },
  }));
}

module.exports = { registerHealthRoutes };
