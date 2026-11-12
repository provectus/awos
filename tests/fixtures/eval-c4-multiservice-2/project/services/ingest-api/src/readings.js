'use strict';

// Reading intake domain logic: validates a raw device payload against the
// meter registry and normalizes it into the shared Reading model. Distinct
// from packages/core/src/models/reading.js (the shape) and from the billing
// engine's readings-store.js (the persistence).

const { createReading } = require('../../../packages/core/src/models/reading');
const { nowIso } = require('../../../packages/core/src/clock');
const { BadRequestError, NotFoundError, ConflictError } = require('./errors');

function normalizeReading({ body, meter }) {
  if (!meter) {
    throw new NotFoundError(`meter ${body.meterId} is not registered`);
  }
  if (meter.status !== 'active') {
    throw new ConflictError(
      `meter ${meter.id} is ${meter.status}; readings are only accepted for active meters`
    );
  }
  if (typeof body.value !== 'number' || Number.isNaN(body.value)) {
    throw new BadRequestError('reading value must be a number (kWh register)');
  }
  if (body.value < 0) {
    throw new BadRequestError('reading value must not be negative');
  }
  return createReading({
    meterId: meter.id,
    customerId: meter.customerId,
    value: body.value,
    readAt: body.readAt || nowIso(),
  });
}

module.exports = { normalizeReading };
