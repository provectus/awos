'use strict';

const {
  createFileQueue,
} = require('../../../packages/core/src/queue/file-queue');
const { createReadingsStore } = require('./store/readings-store');
const { createInvoicesStore } = require('./store/invoices-store');
const { createHandlers } = require('./handlers');
const { withRetry } = require('./retry');

// The billing engine is a pure queue consumer: it exposes no HTTP surface and
// never publishes to the queue. Other services see its output only through
// the readings and invoices stores on the shared filesystem.

function createEngine(options) {
  const { queueDir, readingsDir, invoicesDir, logger = console } = options;

  const queue = createFileQueue({ dir: queueDir });
  const readingsStore = createReadingsStore({ dir: readingsDir });
  const invoicesStore = createInvoicesStore({ dir: invoicesDir });
  const handlers = createHandlers({ readingsStore, invoicesStore });

  async function handleJob(job) {
    const handler = handlers[job.type];
    if (!handler) {
      logger.warn(`billing-engine: no handler for job type '${job.type}'`);
      return null;
    }
    return withRetry(() => handler(job), {
      attempts: 3,
      onRetry: (err, attempt) =>
        logger.warn(
          `billing-engine: retrying ${job.type} after attempt ${attempt}: ${err.message}`
        ),
    });
  }

  // Drains every queued job once. Tests drive the engine with this; the
  // long-running loop in start() just calls it on an interval.
  async function drain() {
    let processed = 0;
    for (let job = queue.take(); job; job = queue.take()) {
      await handleJob(job);
      processed += 1;
    }
    return processed;
  }

  let timer = null;

  function start({ pollMs = 250 } = {}) {
    if (timer) return;
    timer = setInterval(() => {
      drain().catch((err) =>
        logger.error(`billing-engine: drain failed: ${err.message}`)
      );
    }, pollMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { drain, start, stop, readingsStore, invoicesStore };
}

module.exports = { createEngine };
