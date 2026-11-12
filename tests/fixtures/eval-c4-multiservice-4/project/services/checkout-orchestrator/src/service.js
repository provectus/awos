'use strict';

// The checkout orchestrator has no HTTP surface. It consumes checkout
// commands addressed to it and the downstream payment/stock/promotion events
// from the shared event log (under its own cursor). It owns the orders store
// and the pricing ledger, and it is the only writer of both.

const {
  createCommandQueue,
} = require('../../../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../../../packages/messaging/src/queues/event-queue');
const { createOrdersStore } = require('./store/orders-store');
const { createLedgerStore } = require('./store/ledger-store');
const { createSagasStore } = require('./store/sagas-store');
const { createOrderEvents } = require('./events/order-events');
const { createHandlers } = require('./handlers');
const { createConsumeLoop } = require('./consume-loop');
const { createLogger } = require('./logging');
const { UnknownCommandError } = require('./errors');
const { withRetry } = require('./retry');

const TARGET = 'checkout-orchestrator';

function createCheckoutOrchestrator(options) {
  const {
    ordersDir,
    ledgerDir,
    commandsDir,
    eventsDir,
    logger = createLogger(TARGET),
  } = options;

  const commandQueue = createCommandQueue({ dir: commandsDir });
  const eventQueue = createEventQueue({ dir: eventsDir });
  const ordersStore = createOrdersStore({ dir: ordersDir });
  const ledgerStore = createLedgerStore({ dir: ledgerDir });
  const sagasStore = createSagasStore({ dir: ordersDir });
  const events = createOrderEvents({ eventQueue });
  const handlers = createHandlers({
    ordersStore,
    ledgerStore,
    sagasStore,
    commandQueue,
    events,
    logger,
  });

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

  return { ...loop, step, ordersStore, ledgerStore, sagasStore };
}

module.exports = { createCheckoutOrchestrator, TARGET };
