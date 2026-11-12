'use strict';

// HTTP handlers for registering shipments against an order. Tracking state
// for a shipment is owned by the tracking worker; the gateway only records
// that a shipment exists on the order and announces it on the queue.

const {
  createShipment,
} = require('../../../../packages/shared/src/models/shipment');
const {
  ValidationError,
} = require('../../../../packages/shared/src/validation');
const { BadRequestError, NotFoundError } = require('../errors');
const { serializeShipment } = require('../serializers/shipment-serializer');

function registerShipmentRoutes(router, { ordersStore, queueClient }) {
  router.post('/orders/:orderId/shipments', async (ctx) => {
    const order = ordersStore.get(ctx.params.orderId);
    if (!order) {
      throw new NotFoundError(`order ${ctx.params.orderId} not found`);
    }

    let shipment;
    try {
      shipment = createShipment({
        orderId: order.id,
        carrier: ctx.body.carrier,
        trackingNumber: ctx.body.trackingNumber,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new BadRequestError(err.message);
      }
      throw err;
    }

    order.status = 'fulfilled';
    order.shipmentIds = [...(order.shipmentIds || []), shipment.id];
    ordersStore.save(order);
    queueClient.publishShipmentCreated(shipment);

    return { statusCode: 201, body: serializeShipment(shipment) };
  });
}

module.exports = { registerShipmentRoutes };
