'use strict';

const http = require('node:http');
const { createEmitter } = require('../../../packages/core/src/events');
const { createRouter } = require('./router');
const { registerHealthRoutes } = require('./routes/health');
const { registerMeterRoutes } = require('./routes/meters');
const { registerReadingRoutes } = require('./routes/readings');
const { createDeviceAuth } = require('./middleware/device-auth');
const { readJsonBody } = require('./middleware/json-body');
const { createRequestLog } = require('./middleware/request-log');
const { createMetersStore } = require('./store/meters-store');
const { createQueueClient } = require('./clients/queue-client');
const { serializeError, NotFoundError } = require('./errors');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function createIngestServer(options) {
  const {
    metersDir,
    queueDir,
    deviceApiKey,
    logger = console,
    logRequests = true,
  } = options;

  const metersStore = createMetersStore({ dir: metersDir });
  const queueClient = createQueueClient({ queueDir });
  const auth = createDeviceAuth({ deviceApiKey });
  const requestLog = createRequestLog({ logger, enabled: logRequests });

  // In-process bus for observers inside this service only (log/metric hooks).
  // Cross-service events go through queueClient, never through this bus.
  const bus = createEmitter();
  bus.on('reading:accepted', (reading) => {
    if (logRequests) {
      logger.log(`accepted reading ${reading.id} for meter ${reading.meterId}`);
    }
  });

  const router = createRouter();
  registerHealthRoutes(router);
  registerMeterRoutes(router, { metersStore, queueClient });
  registerReadingRoutes(router, { metersStore, queueClient, bus });

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

  server.metersStore = metersStore;
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

module.exports = { createIngestServer };
