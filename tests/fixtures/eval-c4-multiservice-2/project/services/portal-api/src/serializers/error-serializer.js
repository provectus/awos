'use strict';

const { HttpError } = require('../errors');

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

module.exports = { serializeError };
