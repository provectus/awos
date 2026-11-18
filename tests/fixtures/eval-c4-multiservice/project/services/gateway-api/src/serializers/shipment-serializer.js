'use strict';

function serializeShipment(shipment) {
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    createdAt: shipment.createdAt,
  };
}

module.exports = { serializeShipment };
