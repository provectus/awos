'use strict';

// POST /carts/:id/lines, DELETE /carts/:id/lines/:sku

const { NotFoundError, ConflictError } = require('../errors');
const { validateAddLine } = require('../validators/add-line');
const { toCartView } = require('../serializers/cart-serializer');

function createLineRoutes({ cartsStore }) {
  function loadOpenCart(cartIdParam) {
    const cart = cartsStore.get(cartIdParam);
    if (!cart) throw new NotFoundError(`no cart ${cartIdParam}`);
    if (cart.status !== 'open') {
      throw new ConflictError(`cart ${cartIdParam} is ${cart.status}`);
    }
    return cart;
  }

  return [
    {
      method: 'POST',
      pattern: /^\/carts\/([^/]+)\/lines$/,
      handler({ res, body, params }) {
        const cart = loadOpenCart(params[0]);
        const line = validateAddLine(body);
        const existing = cart.lines.find((l) => l.sku === line.sku);
        const lines = existing
          ? cart.lines.map((l) =>
              l.sku === line.sku
                ? { ...l, quantity: l.quantity + line.quantity }
                : l
            )
          : [...cart.lines, line];
        const updated = cartsStore.put({ ...cart, lines });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ cart: toCartView(updated) }));
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/carts\/([^/]+)\/lines\/([^/]+)$/,
      handler({ res, params }) {
        const cart = loadOpenCart(params[0]);
        const lines = cart.lines.filter((line) => line.sku !== params[1]);
        const updated = cartsStore.put({ ...cart, lines });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ cart: toCartView(updated) }));
      },
    },
  ];
}

module.exports = { createLineRoutes };
