'use strict';

// POST /carts/:id/checkout — start the checkout saga for a quoted cart (202)

const { NotFoundError } = require('../errors');

function createCheckoutRoutes({ cartsStore, commandClient }) {
  return [
    {
      method: 'POST',
      pattern: /^\/carts\/([^/]+)\/checkout$/,
      handler({ res, params }) {
        const cart = cartsStore.get(params[0]);
        if (!cart) throw new NotFoundError(`no cart ${params[0]}`);
        cartsStore.put({ ...cart, status: 'checking_out' });
        commandClient.requestCheckout({ cart });
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ accepted: true, cartId: cart.cartId }));
      },
    },
  ];
}

module.exports = { createCheckoutRoutes };
