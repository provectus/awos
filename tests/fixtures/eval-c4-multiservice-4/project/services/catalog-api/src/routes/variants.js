'use strict';

// POST /variants, GET /products/:sku/variants

const { validateVariantPayload } = require('../validators/variant-payload');
const { toVariantView } = require('../serializers/variant-serializer');

function createVariantRoutes({ variantsStore }) {
  return [
    {
      method: 'POST',
      pattern: /^\/variants$/,
      handler({ res, body }) {
        const variant = variantsStore.put(validateVariantPayload(body));
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ variant: toVariantView(variant) }));
      },
    },
    {
      method: 'GET',
      pattern: /^\/products\/([^/]+)\/variants$/,
      handler({ res, params }) {
        const variants = variantsStore.listForSku(params[0]).map(toVariantView);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ variants }));
      },
    },
  ];
}

module.exports = { createVariantRoutes };
