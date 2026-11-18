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

class ConflictError extends HttpError {
  constructor(message) {
    super(409, 'conflict', message);
    this.name = 'ConflictError';
  }
}

function serializeError(err) {
  if (err instanceof HttpError) {
    return {
      statusCode: err.statusCode,
      body: { error: { code: err.code, message: err.message } },
    };
  }
  return {
    statusCode: 500,
    body: { error: { code: 'internal', message: 'internal server error' } },
  };
}

module.exports = {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  serializeError,
};
