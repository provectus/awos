'use strict';

const {
  assertNonEmptyString,
  assertNonNegativeNumber,
  assertIsoTimestamp,
} = require('../validation');
const { readingId } = require('../ids');
const { nowIso } = require('../clock');

// A reading is a cumulative register value in kWh: usage over a period is
// derived by differencing readings, never stored on the reading itself.

function createReading(input = {}) {
  return {
    id: input.id || readingId(),
    kind: 'reading',
    meterId: assertNonEmptyString(input.meterId, 'reading.meterId'),
    customerId: assertNonEmptyString(input.customerId, 'reading.customerId'),
    value: assertNonNegativeNumber(input.value, 'reading.value'),
    unit: 'kWh',
    readAt: assertIsoTimestamp(input.readAt, 'reading.readAt'),
    recordedAt: nowIso(),
  };
}

module.exports = { createReading };
