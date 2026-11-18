'use strict';

// The gateway's only interface to the shared job queue. Every shipment event
// the platform knows about enters the queue through one of these helpers.

const {
  createQueue,
} = require('../../../../packages/shared/src/queue/in-memory-queue');

function createQueueClient({ queueDir }) {
  const queue = createQueue({ dir: queueDir });

  function publishShipmentCreated(shipment) {
    return queue.publish('shipment.created', { shipment });
  }

  function publishStatusUpdated({ shipmentId, status, occurredAt, location }) {
    return queue.publish('shipment.status_updated', {
      shipmentId,
      status,
      occurredAt,
      location: location ?? null,
    });
  }

  function publishDeliveryException({ shipmentId, reason, occurredAt }) {
    return queue.publish('shipment.delivery_exception', {
      shipmentId,
      reason,
      occurredAt,
    });
  }

  return {
    publishShipmentCreated,
    publishStatusUpdated,
    publishDeliveryException,
  };
}

module.exports = { createQueueClient };
