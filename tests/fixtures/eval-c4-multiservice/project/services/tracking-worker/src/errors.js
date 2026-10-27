'use strict';

class HandlerError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = 'HandlerError';
    this.retryable = retryable;
  }
}

class UnknownJobTypeError extends Error {
  constructor(type) {
    super(`no handler registered for job type '${type}'`);
    this.name = 'UnknownJobTypeError';
    this.retryable = false;
  }
}

module.exports = { HandlerError, UnknownJobTypeError };
