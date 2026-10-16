'use strict';

class UnknownCommandError extends Error {
  constructor(command) {
    super(`stock-service does not handle command: ${command}`);
    this.name = 'UnknownCommandError';
    this.retryable = false;
  }
}

class UnknownReservationError extends Error {
  constructor(orderId) {
    super(`no reservation recorded for order ${orderId}`);
    this.name = 'UnknownReservationError';
    this.retryable = false;
  }
}

module.exports = { UnknownCommandError, UnknownReservationError };
