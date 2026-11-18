'use strict';

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super('missing or invalid api key');
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

module.exports = { NotFoundError, UnauthorizedError };
