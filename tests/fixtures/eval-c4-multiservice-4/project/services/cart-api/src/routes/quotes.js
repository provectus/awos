'use strict';

// POST /carts/:id/quote  — ask the platform to price the cart (202)
// GET  /carts/:id/quote  — read the priced quote back from the ledger view

const { NotFoundError } = require('../errors');
const { toQuoteView } = require('../serializers/quote-serializer');

function createQuoteRoutes({ cartsStore, ledgerView, commandClient }) {
  return [
    {
      method: 'POST',
      pattern: /^\/carts\/([^/]+)\/quote$/,
      handler({ res, params }) {
        const cart = cartsStore.get(params[0]);
        if (!cart) throw new NotFoundError(`no cart ${params[0]}`);
        commandClient.requestQuote({ cart });
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ accepted: true, cartId: cart.cartId }));
      },
    },
    {
      method: 'GET',
      pattern: /^\/carts\/([^/]+)\/quote$/,
      handler({ res, params }) {
        const record = ledgerView.getQuote(params[0]);
        if (!record) {
          throw new NotFoundError(`no quote on file for cart ${params[0]}`);
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ quote: toQuoteView(record) }));
      },
    },
  ];
}

module.exports = { createQuoteRoutes };
