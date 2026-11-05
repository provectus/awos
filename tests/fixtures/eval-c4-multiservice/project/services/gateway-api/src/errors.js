'use strict';

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class BadRequestError extends HttpError {
  constructor(message) {
    super(400, 'bad_request', message);
    this.name = 'BadRequestError';
  }
}

class UnauthorizedError extends HttpError {
  constructor(message) {
    super(401, 'unauthorized', message);
    this.name = 'UnauthorizedError';
  }
}

class NotFoundError extends HttpError {
  constructor(message) {
    super(404, 'not_found', message);
    this.name = 'NotFoundError';
  }
}

module.exports = {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
};
