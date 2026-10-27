'use strict';

// The payments gateway has no HTTP surface. It consumes payment commands
// addressed to it, simulates the processor deterministically, journals every
// action, and reports outcomes as payment events.

const {
  createCommandQueue,
} = require('../../../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../../../packages/messaging/src/queues/event-queue');
const { createJournalStore } = require('./store/journal-store');
const { createAttemptsStore } = require('./store/attempts-store');
const { createPaymentEvents } = require('./events/payment-events');
const { createHandlers } = require('./handlers');
const { createConsumeLoop } = require('./consume-loop');
const { createLogger } = require('./logging');
const { UnknownCommandError } = require('./errors');
const { withRetry } = require('./retry');

const TARGET = 'payments-gateway';

function createPaymentsGateway(options) {
  const {
    paymentsDir,
    commandsDir,
    eventsDir,
    logger = createLogger(TARGET),
  } = options;

  const commandQueue = createCommandQueue({ dir: commandsDir });
  const eventQueue = createEventQueue({ dir: eventsDir });
  const journal = createJournalStore({ dir: paymentsDir });
  const attemptsStore = createAttemptsStore({ dir: paymentsDir });
  const events = createPaymentEvents({ eventQueue });
  const handlers = createHandlers({ attemptsStore, journal, events });

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

  return { ...loop, step, journal, attemptsStore };
}

module.exports = { createPaymentsGateway, TARGET };
