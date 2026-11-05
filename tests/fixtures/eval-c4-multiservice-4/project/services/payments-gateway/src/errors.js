'use strict';

class UnknownCommandError extends Error {
  constructor(command) {
    super(`payments-gateway does not handle command: ${command}`);
    this.name = 'UnknownCommandError';
    this.retryable = false;
  }
}

class MissingAuthorizationError extends Error {
  constructor(orderId, attemptId) {
    super(`no authorization on file for ${orderId}/${attemptId}`);
    this.name = 'MissingAuthorizationError';
    this.retryable = false;
  }
}

module.exports = { UnknownCommandError, MissingAuthorizationError };
