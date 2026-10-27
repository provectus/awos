'use strict';

// Shipment status state machine. This is the single source of truth for
// which status transitions a tracking record may take; handlers never set
// `status` directly.

const TRANSITIONS = {
  created: ['in_transit', 'exception'],
  in_transit: ['out_for_delivery', 'delivered', 'exception'],
  out_for_delivery: ['delivered', 'exception'],
  delivered: [],
  exception: ['in_transit', 'out_for_delivery'],
};

class InvalidTransitionError extends Error {
  constructor(from, to) {
    super(`cannot transition shipment from '${from}' to '${to}'`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
    this.retryable = false;
  }
}

function knownStatuses() {
  return Object.keys(TRANSITIONS);
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function applyTransition(record, to, occurredAt) {
  if (!canTransition(record.status, to)) {
    throw new InvalidTransitionError(record.status, to);
  }
  record.status = to;
  record.statusUpdatedAt = occurredAt;
  return record;
}

function isTerminal(status) {
  return status === 'delivered';
}

module.exports = {
  TRANSITIONS,
  InvalidTransitionError,
  knownStatuses,
  canTransition,
  applyTransition,
  isTerminal,
};
