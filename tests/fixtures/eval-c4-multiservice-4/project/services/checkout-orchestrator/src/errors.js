'use strict';

class UnknownCommandError extends Error {
  constructor(command) {
    super(`checkout-orchestrator does not handle command: ${command}`);
    this.name = 'UnknownCommandError';
    this.retryable = false;
  }
}

class UnknownSagaError extends Error {
  constructor(orderId) {
    super(`no checkout saga on file for order ${orderId}`);
    this.name = 'UnknownSagaError';
    this.retryable = false;
  }
}

class IllegalTransitionError extends Error {
  constructor(from, to) {
    super(`illegal saga transition: ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
    this.retryable = false;
  }
}

module.exports = {
  UnknownCommandError,
  UnknownSagaError,
  IllegalTransitionError,
};
