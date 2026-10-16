'use strict';

// ValidationError marks bad input: never retryable, always the caller's
// fault. Services translate it to a 4xx (HTTP) or a rejected command.

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.retryable = false;
  }
}

module.exports = { ValidationError };
