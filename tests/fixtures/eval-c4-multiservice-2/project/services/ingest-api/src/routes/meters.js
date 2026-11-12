'use strict';

const { createMeter } = require('../../../../packages/core/src/models/meter');
const { ValidationError } = require('../../../../packages/core/src/validation');
const { BadRequestError, NotFoundError, ConflictError } = require('../errors');

function registerMeterRoutes(router, { metersStore, queueClient }) {
  router.post('/meters', async (ctx) => {
    let meter;
    try {
      meter = createMeter(ctx.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new BadRequestError(err.message);
      }
      throw err;
    }
    metersStore.save(meter);
    queueClient.publishMeterRegistered(meter);
    return { statusCode: 201, body: meter };
  });

  router.get('/meters/:meterId', async (ctx) => {
    const meter = metersStore.get(ctx.params.meterId);
    if (!meter) {
      throw new NotFoundError(`meter ${ctx.params.meterId} not found`);
    }
    return { statusCode: 200, body: meter };
  });

  router.post('/meters/:meterId/decommission', async (ctx) => {
    const meter = metersStore.get(ctx.params.meterId);
    if (!meter) {
      throw new NotFoundError(`meter ${ctx.params.meterId} not found`);
    }
    if (meter.status === 'decommissioned') {
      throw new ConflictError(`meter ${meter.id} is already decommissioned`);
    }
    const updated = { ...meter, status: 'decommissioned' };
    metersStore.save(updated);
    queueClient.publishMeterDecommissioned(updated);
    return { statusCode: 200, body: updated };
  });
}

module.exports = { registerMeterRoutes };
