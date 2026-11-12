'use strict';

// The promotions service has no HTTP surface. It consumes administrative
// commands addressed to it and price.quoted events from the shared event
// log (under its own cursor), and reports applied promotions as
// promotion.applied events.

const {
  createCommandQueue,
} = require('../../../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../../../packages/messaging/src/queues/event-queue');
const { createPromosStore } = require('./store/promos-store');
const { createUsageStore } = require('./store/usage-store');
const { createPromotionEvents } = require('./events/promotion-events');
const { createHandlers } = require('./handlers');
const { createConsumeLoop } = require('./consume-loop');
const { createLogger } = require('./logging');
const { UnknownCommandError } = require('./errors');
const { withRetry } = require('./retry');

const TARGET = 'promotions-service';

function createPromotionsService(options) {
  const {
    promosDir,
    commandsDir,
    eventsDir,
    logger = createLogger(TARGET),
  } = options;

  const commandQueue = createCommandQueue({ dir: commandsDir });
  const eventQueue = createEventQueue({ dir: eventsDir });
  const promosStore = createPromosStore({ dir: promosDir });
  const usageStore = createUsageStore({ dir: promosDir });
  const events = createPromotionEvents({ eventQueue });
  const handlers = createHandlers({ promosStore, usageStore, events, logger });

  async function step() {
    const command = commandQueue.take(TARGET);
    if (command) {
      const handler = handlers.commands[command.command];
      if (!handler) throw new UnknownCommandError(command.command);
      await withRetry(() => handler.handle(command), {
        onRetry: (err, attempt) =>
          logger.warn(
            `retrying ${command.command} after attempt ${attempt}: ${err.message}`
          ),
      });
      return true;
    }
    const event = eventQueue.takeFor(TARGET);
    if (event) {
      const handler = handlers.events[event.event];
      if (handler) await handler.handle(event);
      return true;
    }
    return false;
  }

  const loop = createConsumeLoop({ step, logger });

  return { ...loop, step, promosStore, usageStore };
}

module.exports = { createPromotionsService, TARGET };
