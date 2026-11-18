'use strict';

const {
  createTrackingEvent,
} = require('../../../../packages/shared/src/models/tracking-event');
const { applyTransition } = require('../shipments');
const { HandlerError } = require('../errors');

// Applies a carrier status update to the shipment's tracking record. A
// missing record is retryable: the shipment.created job may simply not have
// been processed yet. A duplicate status is a no-op (carriers re-send).

function createStatusUpdatedHandler({ trackingStore }) {
  return async function handleStatusUpdated(job) {
    const { shipmentId, status, occurredAt, location } = job.payload || {};
    if (!shipmentId || !status) {
      throw new HandlerError(
        'shipment.status_updated job requires shipmentId and status',
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

    if (record.status === status) return record;

    applyTransition(record, status, occurredAt);
    record.events.push(
      createTrackingEvent({ shipmentId, status, occurredAt, location })
    );
    return trackingStore.save(record);
  };
}

module.exports = { createStatusUpdatedHandler };
