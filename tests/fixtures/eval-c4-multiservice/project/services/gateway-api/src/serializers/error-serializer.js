'use strict';

// Maps any thrown error to a safe HTTP response. Unexpected errors become an
// opaque 500 so internals never leak to API clients.

function serializeError(err) {
  const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  const code = typeof err?.code === 'string' ? err.code : 'internal_error';
  const message = statusCode >= 500 ? 'internal server error' : err.message;
  return { statusCode, body: { error: { code, message } } };
}

module.exports = { serializeError };
