'use strict';

// GET /stock-levels/:sku — the projected read model, not authoritative stock.

const { toStockLevelView } = require('../serializers/stock-serializer');

function createStockLevelRoutes({ stockReadModel }) {
  return [
    {
      method: 'GET',
      pattern: /^\/stock-levels\/([^/]+)$/,
      handler({ res, params }) {
        const level = stockReadModel.get(params[0]);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ stockLevel: toStockLevelView(level) }));
      },
    },
  ];
}

module.exports = { createStockLevelRoutes };
