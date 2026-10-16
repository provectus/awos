'use strict';

// The pricing service has no HTTP surface. It consumes pricing commands
// addressed to it, prices carts from the rates store it owns, and reports
// quotes as price.quoted events.

const {
  createCommandQueue,
} = require('../../../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../../../packages/messaging/src/queues/event-queue');
const { createRatesStore } = require('./store/rates-store');
const { createConversionStore } = require('./store/conversion-store');
const { createRoundingRulesStore } = require('./store/rounding-rules-store');
const { createTiersStore } = require('./store/tiers-store');
const { createLinePricer } = require('./pricing/line-pricer');
const { createQuoteBuilder } = require('./pricing/quote-builder');
const { createRoundingPolicy } = require('./pricing/rounding-policy');
const { createPricingEvents } = require('./events/pricing-events');
const { createHandlers } = require('./handlers');
const { createConsumeLoop } = require('./consume-loop');
const { createLogger } = require('./logging');
const { UnknownCommandError } = require('./errors');
const { withRetry } = require('./retry');

const TARGET = 'pricing-service';

function createPricingService(options) {
  const {
    ratesDir,
    commandsDir,
    eventsDir,
    logger = createLogger(TARGET),
  } = options;

  const commandQueue = createCommandQueue({ dir: commandsDir });
  const eventQueue = createEventQueue({ dir: eventsDir });
  const ratesStore = createRatesStore({ dir: ratesDir });
  const conversionStore = createConversionStore({ dir: ratesDir });
  const roundingRulesStore = createRoundingRulesStore({ dir: ratesDir });
  const tiersStore = createTiersStore({ dir: ratesDir });
  const linePricer = createLinePricer({ ratesStore, tiersStore });
  const quoteBuilder = createQuoteBuilder({ ratesStore, linePricer });
  const roundingPolicy = createRoundingPolicy({ roundingRulesStore });
  const events = createPricingEvents({ eventQueue });
  const handlers = createHandlers({
    quoteBuilder,
    ratesStore,
    tiersStore,
    conversionStore,
    roundingRulesStore,
    events,
  });

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

  return {
    ...loop,
    step,
    ratesStore,
    conversionStore,
    roundingRulesStore,
    tiersStore,
    roundingPolicy,
  };
}

module.exports = { createPricingService, TARGET };
