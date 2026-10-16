'use strict';

const { createShipmentCreatedHandler } = require('./shipment-created');
const { createStatusUpdatedHandler } = require('./status-updated');
const { createDeliveryExceptionHandler } = require('./delivery-exception');

// Job-type registry. The worker dispatches on job.type; adding a new event
// kind means adding a handler module and one entry here.

function createHandlers(deps) {
  return {
    'shipment.created': createShipmentCreatedHandler(deps),
    'shipment.status_updated': createStatusUpdatedHandler(deps),
    'shipment.delivery_exception': createDeliveryExceptionHandler(deps),
  };
}

module.exports = { createHandlers };
