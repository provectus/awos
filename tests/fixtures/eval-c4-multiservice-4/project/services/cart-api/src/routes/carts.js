'use strict';

// POST /carts, GET /carts/:id

const { cartId } = require('../../../../packages/messaging/src/ids');
const { NotFoundError } = require('../errors');
const { validateCreateCart } = require('../validators/create-cart');
const { toCartView } = require('../serializers/cart-serializer');

function createCartRoutes({ cartsStore }) {
  return [
    {
      method: 'POST',
      pattern: /^\/carts$/,
      handler({ res, body }) {
        const { customerId, currency } = validateCreateCart(body);
        const cart = cartsStore.put({
          cartId: cartId(),
          customerId,
          currency,
          lines: [],
          status: 'open',
        });
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ cart: toCartView(cart) }));
      },
    },
    {
      method: 'GET',
      pattern: /^\/carts\/([^/]+)$/,
      handler({ res, params }) {
        const cart = cartsStore.get(params[0]);
        if (!cart) throw new NotFoundError(`no cart ${params[0]}`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ cart: toCartView(cart) }));
      },
    },
  ];
}

module.exports = { createCartRoutes };
