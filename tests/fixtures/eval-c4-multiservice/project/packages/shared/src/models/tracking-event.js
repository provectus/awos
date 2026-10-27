'use strict';

const { assertNonEmptyString, assertIsoTimestamp } = require('../validation');

function createTrackingEvent(input = {}) {
  return {
    shipmentId: assertNonEmptyString(
      input.shipmentId,
      'trackingEvent.shipmentId'
    ),
    status: assertNonEmptyString(input.status, 'trackingEvent.status'),
    occurredAt: assertIsoTimestamp(
      input.occurredAt,
      'trackingEvent.occurredAt'
    ),
    location: typeof input.location === 'string' ? input.location : null,
    note: typeof input.note === 'string' ? input.note : null,
  };
}

module.exports = { createTrackingEvent };
