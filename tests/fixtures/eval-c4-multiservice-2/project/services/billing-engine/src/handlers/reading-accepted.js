'use strict';

const { HandlerError } = require('../errors');

// Persists an accepted reading into the billing engine's readings store.
// Redelivery of the same job is a no-op: the existing record wins.

function createReadingAcceptedHandler({ readingsStore }) {
  return async function handleReadingAccepted(job) {
    const reading = job.payload?.reading;
    if (!reading || !reading.id || !reading.meterId) {
      throw new HandlerError(
        'reading.accepted job is missing payload.reading.id or meterId',
        { retryable: false }
      );
    }
    const existing = readingsStore.get(reading.id);
    if (existing) return existing;
    return readingsStore.save(reading);
  };
}

module.exports = { createReadingAcceptedHandler };
