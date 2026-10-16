'use strict';

const http = require('node:http');
const { createRouter } = require('./router');
const { registerHealthRoutes } = require('./routes/health');
const { registerUsageRoutes } = require('./routes/usage');
const { registerInvoiceRoutes } = require('./routes/invoices');
const { createCustomerAuth } = require('./middleware/customer-auth');
const { readJsonBody } = require('./middleware/json-body');
const { openReadingsView } = require('./views/readings-view');
const { openInvoicesView } = require('./views/invoices-view');
const { serializeError } = require('./serializers/error-serializer');
const { NotFoundError } = require('./errors');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function createPortalServer(options) {
  const { readingsDir, invoicesDir, portalApiKey } = options;

  // The portal owns no store: both views point at directories owned and
  // written by the billing engine.
  const readingsView = openReadingsView({ dir: readingsDir });
  const invoicesView = openInvoicesView({ dir: invoicesDir });
  const auth = createCustomerAuth({ portalApiKey });

  const router = createRouter();
  registerHealthRoutes(router);
  registerUsageRoutes(router, { readingsView });
  registerInvoiceRoutes(router, { invoicesView });

  const server = http.createServer(async (req, res) => {
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

module.exports = { createPortalServer };
