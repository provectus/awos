'use strict';

const http = require('node:http');
const { createRouter } = require('./router');
const { registerHealthRoutes } = require('./routes/health');
const { registerOrderRoutes } = require('./routes/orders');
const { registerShipmentRoutes } = require('./routes/shipments');
const { registerWebhookRoutes } = require('./routes/webhooks');
const { createAuth } = require('./middleware/auth');
const { readJsonBody } = require('./middleware/json-body');
const { createRequestLog } = require('./middleware/request-log');
const { createOrdersStore } = require('./store/orders-store');
const { createQueueClient } = require('./clients/queue-client');
const { serializeError } = require('./serializers/error-serializer');
const { NotFoundError } = require('./errors');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function createGatewayServer(options) {
  const {
    ordersDir,
    queueDir,
    apiToken,
    webhookSecret,
    logger = console,
    logRequests = true,
  } = options;

  const ordersStore = createOrdersStore({ dir: ordersDir });
  const queueClient = createQueueClient({ queueDir });
  const auth = createAuth({ apiToken, webhookSecret });
  const requestLog = createRequestLog({ logger, enabled: logRequests });

  const router = createRouter();
  registerHealthRoutes(router);
  registerOrderRoutes(router, { ordersStore });
  registerShipmentRoutes(router, { ordersStore, queueClient });
  registerWebhookRoutes(router, { queueClient });

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      auth.authenticate(req, pathname);
      const matched = router.match(req.method, pathname);
      if (!matched) {
        throw new NotFoundError(`no route for ${req.method} ${pathname}`);
      }
      const body = BODY_METHODS.has(req.method) ? await readJsonBody(req) : {};
      const result = await matched.handler({
        req,
        params: matched.params,
        body,
      });
      sendJson(res, result.statusCode, result.body);
    } catch (err) {
      const { statusCode, body } = serializeError(err);
      sendJson(res, statusCode, body);
    } finally {
      requestLog.log(req, res, startedAt);
    }
  });

  return server;
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

module.exports = { createGatewayServer };
