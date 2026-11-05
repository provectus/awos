'use strict';

const { assertNonEmptyString } = require('../validation');
const { shipmentId } = require('../ids');
const { nowIso } = require('../clock');

const SHIPMENT_STATUSES = [
  'created',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
];

function createShipment(input = {}) {
  return {
    id: input.id || shipmentId(),
    orderId: assertNonEmptyString(input.orderId, 'shipment.orderId'),
    carrier: assertNonEmptyString(input.carrier, 'shipment.carrier')
      .trim()
      .toLowerCase(),
    trackingNumber: assertNonEmptyString(
      input.trackingNumber,
      'shipment.trackingNumber'
    ),
    status: 'created',
    createdAt: nowIso(),
  };
}

module.exports = { SHIPMENT_STATUSES, createShipment };
