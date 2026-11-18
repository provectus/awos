'use strict';

// Publish-only wrapper over the shared file queue. The ingest API never
// consumes jobs; the billing engine does.

const {
  createFileQueue,
} = require('../../../../packages/core/src/queue/file-queue');

function createQueueClient({ queueDir }) {
  const queue = createFileQueue({ dir: queueDir });

  function publishReadingAccepted(reading) {
    return queue.publish('reading.accepted', { reading });
  }

  function publishMeterRegistered(meter) {
    return queue.publish('meter.registered', { meter });
  }

  function publishMeterDecommissioned(meter) {
    return queue.publish('meter.decommissioned', { meterId: meter.id });
  }

  return {
    publishReadingAccepted,
    publishMeterRegistered,
    publishMeterDecommissioned,
  };
}

module.exports = { createQueueClient };
