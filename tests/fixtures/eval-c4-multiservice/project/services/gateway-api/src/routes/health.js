'use strict';

function registerHealthRoutes(router) {
  router.get('/health', async () => ({
    statusCode: 200,
    body: {
      status: 'ok',
      service: 'gateway-api',
      uptimeSeconds: Math.round(process.uptime()),
    },
  }));
}

module.exports = { registerHealthRoutes };
