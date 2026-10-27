'use strict';

// Convenience barrel for the shared models. Services may also require each
// model module directly; both paths resolve to the same factories.

const { createMeter, METER_STATUSES, METER_TARIFFS } = require('./meter');
const { createReading } = require('./reading');
const { createInvoice } = require('./invoice');
const { createCustomer } = require('./customer');

module.exports = {
  createMeter,
  METER_STATUSES,
  METER_TARIFFS,
  createReading,
  createInvoice,
  createCustomer,
};
