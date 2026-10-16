'use strict';

const { ValidationError } = require('../../../../packages/core/src/validation');
const { normalizeReading } = require('../readings');
const { BadRequestError } = require('../errors');

// POST /readings — a field device submits a cumulative register value. The
// reading is validated against the meter registry, published to the queue for
// the billing engine, and acknowledged with 202: the ingest API does not
// persist readings itself.

function registerReadingRoutes(router, { metersStore, queueClient, bus }) {
  router.post('/readings', async (ctx) => {
    if (typeof ctx.body.meterId !== 'string' || ctx.body.meterId === '') {
      throw new BadRequestError('reading submission requires a meterId');
    }
    const meter = metersStore.get(ctx.body.meterId);
    let reading;
    try {
      reading = normalizeReading({ body: ctx.body, meter });
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new BadRequestError(err.message);
      }
      throw err;
    }
    queueClient.publishReadingAccepted(reading);
    bus.emit('reading:accepted', reading);
    return {
      statusCode: 202,
      body: { accepted: true, readingId: reading.id, meterId: reading.meterId },
    };
  });
}

module.exports = { registerReadingRoutes };
