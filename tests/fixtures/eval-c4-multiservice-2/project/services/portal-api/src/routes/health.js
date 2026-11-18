'use strict';

function registerHealthRoutes(router) {
  router.get('/health', async () => ({
    statusCode: 200,
    body: { status: 'ok', service: 'portal-api' },
  }));
}

module.exports = { registerHealthRoutes };
