'use strict';

const { createReadingAcceptedHandler } = require('./reading-accepted');
const { createCycleCloseHandler } = require('./cycle-close');

// Job-type -> handler map. Meter lifecycle events (meter.registered,
// meter.decommissioned) are currently informational: the engine logs and
// acknowledges them without a dedicated handler.

function createHandlers({ readingsStore, invoicesStore }) {
  return {
    'reading.accepted': createReadingAcceptedHandler({ readingsStore }),
    'cycle.close': createCycleCloseHandler({ readingsStore, invoicesStore }),
  };
}

module.exports = { createHandlers };
