'use strict';

// The cart API: HTTP server over the carts store. Writes travel out as
// addressed commands on the shared command queue; checkout state comes back
// in through read-only views over the stores other services own.

const http = require('node:http');
const { createRouter } = require('./router');
const { buildRoutes } = require('./routes');
const { createCartsStore } = require('./store/carts-store');
const { createLedgerView } = require('./views/ledger-view');
const { createCommandClient } = require('./clients/command-client');
const { readJsonBody } = require('./middleware/json-body');
const { logRequest } = require('./middleware/request-log');
const { authenticate } = require('./middleware/auth');
const { serializeError } = require('./serializers/error-serializer');
const { createLogger } = require('./logging');

function createCartApi(options) {
  const {
    cartsDir,
    ledgerDir,
    ordersDir,
    commandsDir,
    apiKey,
    logger = createLogger('cart-api'),
    logRequests = true,
  } = options;

  const cartsStore = createCartsStore({ dir: cartsDir });
  const ledgerView = createLedgerView({ ledgerDir });
  const commandClient = createCommandClient({ commandsDir });
  const router = createRouter(
    buildRoutes({ cartsStore, ledgerView, commandClient, ordersDir })
  );

  const server = http.createServer(async (req, res) => {
    logRequest({ req, res, logger, enabled: logRequests });
    try {
      authenticate({ req, apiKey });
      const body =
        req.method === 'POST' || req.method === 'PUT'
          ? await readJsonBody(req)
          : null;
      const matched = await router.dispatch({ req, res, body });
      if (!matched) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'NotFound', message: 'no route' }));
      }
    } catch (err) {
      const { statusCode, body: errorBody } = serializeError(err);
      if (statusCode === 500) logger.error(err);
      res.writeHead(statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(errorBody));
    }
  });

  return { server, cartsStore, ledgerView, commandClient };
}

module.exports = { createCartApi };
