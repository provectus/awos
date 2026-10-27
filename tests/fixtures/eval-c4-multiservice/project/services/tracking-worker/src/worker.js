'use strict';

// The tracking worker's consume loop. It drains shipment-event jobs from the
// shared queue and applies them to the tracking store via the handler
// registry. All writes to tracking data in the platform happen here.

const {
  createQueue,
} = require('../../../packages/shared/src/queue/in-memory-queue');
const { createTrackingStore } = require('./store/tracking-store');
const { createHandlers } = require('./handlers');
const { withRetry } = require('./retry');
const { UnknownJobTypeError } = require('./errors');

function createWorker({
  queueDir,
  trackingDir,
  pollMs = 250,
  logger = console,
}) {
  const queue = createQueue({ dir: queueDir });
  const trackingStore = createTrackingStore({ dir: trackingDir });
  const handlers = createHandlers({ trackingStore });

  let timer = null;
  let stopped = true;

  async function processNextJob() {
    const job = queue.take();
    if (!job) return null;

    const handler = handlers[job.type];
    if (!handler) throw new UnknownJobTypeError(job.type);

    await withRetry(() => handler(job), {
      attempts: 3,
      baseDelayMs: 25,
      onRetry: (err, attempt) => {
        logger.warn(
          `[worker] ${job.type} ${job.id} failed (attempt ${attempt}): ${err.message}`
        );
      },
    });
    return job;
  }

  async function drain() {
    let processed = 0;
    while (await processNextJob()) processed += 1;
    return processed;
  }

  function start() {
    stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        await drain();
      } catch (err) {
        logger.error(`[worker] job failed permanently: ${err.message}`);
      }
      timer = setTimeout(tick, pollMs);
    };
    tick();
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  }

  return { processNextJob, drain, start, stop, trackingStore };
}

module.exports = { createWorker };
