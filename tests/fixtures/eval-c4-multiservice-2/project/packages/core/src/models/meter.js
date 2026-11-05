'use strict';

const {
  assertNonEmptyString,
  assertOneOf,
  assertIsoTimestamp,
} = require('../validation');
const { meterId } = require('../ids');
const { nowIso } = require('../clock');

const METER_STATUSES = ['active', 'decommissioned'];
const METER_TARIFFS = ['standard', 'economy7', 'ev-overnight'];

function createMeter(input = {}) {
  return {
    id: input.id || meterId(),
    customerId: assertNonEmptyString(input.customerId, 'meter.customerId'),
    serial: assertNonEmptyString(input.serial, 'meter.serial'),
    tariff: assertOneOf(
      input.tariff || 'standard',
      METER_TARIFFS,
      'meter.tariff'
    ),
    status: 'active',
    installedAt: input.installedAt
      ? assertIsoTimestamp(input.installedAt, 'meter.installedAt')
      : nowIso(),
  };
}

module.exports = { METER_STATUSES, METER_TARIFFS, createMeter };
