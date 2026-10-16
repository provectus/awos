'use strict';

const { serializeUsage } = require('../serializers/usage-serializer');
const { NotFoundError } = require('../errors');

// GET /usage/:customerId — the customer's reading history, grouped per meter,
// resolved through the read-only readings view.

function registerUsageRoutes(router, { readingsView }) {
  router.get('/usage/:customerId', async (ctx) => {
    const readings = readingsView.readingsForCustomer(ctx.params.customerId);
    if (readings.length === 0) {
      throw new NotFoundError(
        `no readings recorded for customer ${ctx.params.customerId}`
      );
    }
    return {
      statusCode: 200,
      body: serializeUsage({ customerId: ctx.params.customerId, readings }),
    };
  });
}

module.exports = { registerUsageRoutes };
