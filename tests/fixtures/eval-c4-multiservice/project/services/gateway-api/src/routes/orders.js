'use strict';

const { createOrder } = require('../../../../packages/shared/src/models/order');
const {
  ValidationError,
} = require('../../../../packages/shared/src/validation');
const { BadRequestError, NotFoundError } = require('../errors');
const { serializeOrder } = require('../serializers/order-serializer');

function registerOrderRoutes(router, { ordersStore }) {
  router.post('/orders', async (ctx) => {
    let order;
    try {
      order = createOrder(ctx.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new BadRequestError(err.message);
      }
      throw err;
    }
    ordersStore.save(order);
    return { statusCode: 201, body: serializeOrder(order) };
  });

  router.get('/orders/:orderId', async (ctx) => {
    const order = ordersStore.get(ctx.params.orderId);
    if (!order) {
      throw new NotFoundError(`order ${ctx.params.orderId} not found`);
    }
    return { statusCode: 200, body: serializeOrder(order) };
  });
}

module.exports = { registerOrderRoutes };
