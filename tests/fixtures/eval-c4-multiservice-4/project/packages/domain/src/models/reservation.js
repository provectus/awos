'use strict';

const {
  requireString,
  requireArray,
  requireOneOf,
  requirePositiveInteger,
} = require('../validation/validators');

const RESERVATION_STATUSES = ['held', 'partially_released', 'released'];

function createReservation({ reservationId, orderId, lines, status }) {
  return {
    reservationId: requireString(reservationId, 'reservationId'),
    orderId: requireString(orderId, 'orderId'),
    lines: requireArray(lines, 'lines').map((line) => ({
      sku: requireString(line.sku, 'line.sku'),
      quantity: requirePositiveInteger(line.quantity, 'line.quantity'),
    })),
    status: requireOneOf(status || 'held', RESERVATION_STATUSES, 'status'),
  };
}

module.exports = { createReservation, RESERVATION_STATUSES };
