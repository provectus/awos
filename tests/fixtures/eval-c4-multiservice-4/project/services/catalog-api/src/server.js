'use strict';

// The catalog API: HTTP server over the catalog store plus the embedded
// projector that keeps the stock-level read model current from stock events.

const http = require('node:http');
const { createRouter } = require('./router');
const { buildRoutes } = require('./routes');
const { createProductsStore } = require('./store/products-store');
const { createVariantsStore } = require('./store/variants-store');
const { createStockReadModel } = require('./store/stock-read-model');
const { createStockProjector } = require('./projector/projector');
const { readJsonBody } = require('./middleware/json-body');
const { logRequest } = require('./middleware/request-log');
const { authenticate } = require('./middleware/auth');
const { serializeError } = require('./serializers/error-serializer');
const { createLogger } = require('./logging');

function createCatalogApi(options) {
  const {
    catalogDir,
    eventsDir,
    apiKey,
    logger = createLogger('catalog-api'),
    logRequests = true,
  } = options;

  const productsStore = createProductsStore({ dir: catalogDir });
  const variantsStore = createVariantsStore({ dir: catalogDir });
  const stockReadModel = createStockReadModel({ dir: catalogDir });
  const projector = createStockProjector({ eventsDir, stockReadModel, logger });
  const router = createRouter(
    buildRoutes({ productsStore, variantsStore, stockReadModel })
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

  return { server, projector, productsStore, variantsStore, stockReadModel };
}

module.exports = { createCatalogApi };
