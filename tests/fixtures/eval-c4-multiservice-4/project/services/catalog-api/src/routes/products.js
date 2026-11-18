'use strict';

// POST /products, GET /products, GET /products/:sku

const { NotFoundError } = require('../errors');
const { validateProductPayload } = require('../validators/product-payload');
const { toProductView } = require('../serializers/product-serializer');

function createProductRoutes({ productsStore }) {
  return [
    {
      method: 'POST',
      pattern: /^\/products$/,
      handler({ res, body }) {
        const product = productsStore.put(validateProductPayload(body));
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ product: toProductView(product) }));
      },
    },
    {
      method: 'GET',
      pattern: /^\/products$/,
      handler({ res }) {
        const products = productsStore.list().map(toProductView);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ products }));
      },
    },
    {
      method: 'GET',
      pattern: /^\/products\/([^/]+)$/,
      handler({ res, params }) {
        const product = productsStore.get(params[0]);
        if (!product) throw new NotFoundError(`no product ${params[0]}`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ product: toProductView(product) }));
      },
    },
  ];
}

module.exports = { createProductRoutes };
