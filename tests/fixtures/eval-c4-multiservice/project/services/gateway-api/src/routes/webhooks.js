'use strict';

// Carrier status callbacks. The gateway validates the payload, translates it
// into a queue job, and acknowledges with 202 — it never touches tracking
// state directly.

const {
  ValidationError,
  assertNonEmptyString,
  assertIsoTimestamp,
} = require('../../../../packages/shared/src/validation');
const { BadRequestError } = require('../errors');

function registerWebhookRoutes(router, { queueClient }) {
  router.post('/webhooks/carrier', async (ctx) => {
    let shipmentId;
    let status;
    let occurredAt;
    try {
      shipmentId = assertNonEmptyString(ctx.body.shipmentId, 'shipmentId');
      status = assertNonEmptyString(ctx.body.status, 'status');
      occurredAt = assertIsoTimestamp(ctx.body.occurredAt, 'occurredAt');
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new BadRequestError(err.message);
      }
      throw err;
    }

    if (status === 'exception') {
      queueClient.publishDeliveryException({
        shipmentId,
        reason: ctx.body.reason || 'unspecified carrier exception',
        occurredAt,
      });
    } else {
      queueClient.publishStatusUpdated({
        shipmentId,
        status,
        occurredAt,
        location: ctx.body.location,
      });
    }

    return { statusCode: 202, body: { accepted: true, shipmentId } };
  });
}

module.exports = { registerWebhookRoutes };
