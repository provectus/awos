'use strict';

// Maps thrown errors to HTTP responses: explicit statusCode wins, domain
// ValidationError is a 400, anything else is a 500 with no internals leaked.

function serializeError(err) {
  if (err && Number.isInteger(err.statusCode)) {
    return {
      statusCode: err.statusCode,
      body: { error: err.name, message: err.message },
    };
  }
  if (err && err.name === 'ValidationError') {
    return {
      statusCode: 400,
      body: { error: 'ValidationError', message: err.message },
    };
  }
  return {
    statusCode: 500,
    body: { error: 'InternalError', message: 'internal error' },
  };
}

module.exports = { serializeError };
