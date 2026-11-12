'use strict';

// The stock service has no HTTP surface. It consumes commands addressed to
// it from the command queue, mutates the stock store it owns, and announces
// outcomes as events on the event queue.

const {
  createCommandQueue,
} = require('../../../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../../../packages/messaging/src/queues/event-queue');
const { createStockStore } = require('./store/stock-store');
const { createIdempotencyLedger } = require('./store/idempotency-ledger');
const { createStockEvents } = require('./events/stock-events');
const { createHandlers } = require('./handlers');
const { createConsumeLoop } = require('./consume-loop');
const { createLogger } = require('./logging');
const { UnknownCommandError } = require('./errors');
const { withRetry } = require('./retry');

const TARGET = 'stock-service';

function createStockService(options) {
  const {
    stockDir,
    commandsDir,
    eventsDir,
    logger = createLogger(TARGET),
  } = options;

  const commandQueue = createCommandQueue({ dir: commandsDir });
  const eventQueue = createEventQueue({ dir: eventsDir });
  const stockStore = createStockStore({ dir: stockDir });
  const ledger = createIdempotencyLedger({ dir: stockDir });
  const events = createStockEvents({ eventQueue });
  const handlers = createHandlers({ stockStore, ledger, events });

  async function step() {
    const command = commandQueue.take(TARGET);
    if (!command) return false;
    const handler = handlers[command.command];
    if (!handler) throw new UnknownCommandError(command.command);
    await withRetry(() => handler.handle(command), {
      onRetry: (err, attempt) =>
        logger.warn(
          `retrying ${command.command} after attempt ${attempt}: ${err.message}`
        ),
    });
    return true;
  }

  const loop = createConsumeLoop({ step, logger });

  return { ...loop, step, stockStore, ledger };
}

module.exports = { createStockService, TARGET };
