'use strict';

const {
  createTrackingEvent,
} = require('../../../../packages/shared/src/models/tracking-event');
const { nowIso } = require('../../../../packages/shared/src/clock');
const { HandlerError } = require('../errors');

// Opens a tracking record for a newly registered shipment. Redelivery of the
// same job is a no-op: the existing record wins.

function createShipmentCreatedHandler({ trackingStore }) {
  return async function handleShipmentCreated(job) {
    const shipment = job.payload?.shipment;
    if (!shipment || !shipment.id) {
      throw new HandlerError(
        'shipment.created job is missing payload.shipment.id',
        { retryable: false }
      );
    }

    const existing = trackingStore.get(shipment.id);
    if (existing) return existing;

    const openedAt = shipment.createdAt || nowIso();
    const record = {
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      status: 'created',
      statusUpdatedAt: openedAt,
      events: [
        createTrackingEvent({
          shipmentId: shipment.id,
          status: 'created',
          occurredAt: openedAt,
          note: 'shipment registered by gateway',
        }),
      ],
    };
    return trackingStore.save(record);
  };
}

module.exports = { createShipmentCreatedHandler };
