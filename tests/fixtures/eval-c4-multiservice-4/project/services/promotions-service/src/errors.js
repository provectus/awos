'use strict';

class UnknownCommandError extends Error {
  constructor(command) {
    super(`promotions-service does not handle command: ${command}`);
    this.name = 'UnknownCommandError';
    this.retryable = false;
  }
}

module.exports = { UnknownCommandError };
