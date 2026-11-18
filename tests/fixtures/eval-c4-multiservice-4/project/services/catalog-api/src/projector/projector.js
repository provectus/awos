'use strict';

// The embedded projector loop: consumes the shared event log under the
// catalog's own cursor and keeps the stock read model current.

const {
  createEventQueue,
} = require('../../../../packages/messaging/src/queues/event-queue');
const { projectStockEvent } = require('./stock-projector');

const CONSUMER = 'catalog-projector';

function createStockProjector({ eventsDir, stockReadModel, logger }) {
  const eventQueue = createEventQueue({ dir: eventsDir });

  async function step() {
    const event = eventQueue.takeFor(CONSUMER);
    if (!event) return false;
    projectStockEvent({ event, stockReadModel });
    return true;
  }

  async function drain() {
    let processed = 0;
    while (await step()) processed += 1;
    return processed;
  }

  let timer = null;
  function start({ pollMs = 250 } = {}) {
    timer = setInterval(() => {
      drain().catch((err) => logger.error(err));
    }, pollMs);
    return timer;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { step, drain, start, stop };
}

module.exports = { createStockProjector, CONSUMER };
