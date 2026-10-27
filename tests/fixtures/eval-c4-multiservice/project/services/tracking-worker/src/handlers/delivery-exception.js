'use strict';

const {
  createTrackingEvent,
} = require('../../../../packages/shared/src/models/tracking-event');
const { applyTransition, isTerminal } = require('../shipments');
const { HandlerError } = require('../errors');

// Marks a shipment as being in a delivery exception (failed delivery
// attempt, damaged parcel, customs hold, ...). A delivered shipment ignores
// late exception reports.

function createDeliveryExceptionHandler({ trackingStore }) {
  return async function handleDeliveryException(job) {
    const { shipmentId, reason, occurredAt } = job.payload || {};
    if (!shipmentId) {
      throw new HandlerError(
        'shipment.delivery_exception job requires shipmentId',
        { retryable: false }
      );
    }

    const record = trackingStore.get(shipmentId);
    if (!record) {
      throw new HandlerError(
        `no tracking record yet for shipment ${shipmentId}`,
        { retryable: true }
      );
    }

    if (isTerminal(record.status) || record.status === 'exception') {
      return record;
    }

    applyTransition(record, 'exception', occurredAt);
    record.events.push(
      createTrackingEvent({
        shipmentId,
        status: 'exception',
        occurredAt,
        note: reason || 'unspecified carrier exception',
      })
    );
    return trackingStore.save(record);
  };
}

module.exports = { createDeliveryExceptionHandler };
