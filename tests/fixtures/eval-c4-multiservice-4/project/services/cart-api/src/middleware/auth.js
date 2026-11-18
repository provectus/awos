'use strict';

// API-key authentication. The health endpoint stays open for probes.

const { UnauthorizedError } = require('../errors');

const OPEN_PATHS = ['/health'];

function authenticate({ req, apiKey }) {
  const url = new URL(req.url, 'http://localhost');
  if (OPEN_PATHS.includes(url.pathname)) return;
  if (req.headers['x-api-key'] !== apiKey) {
    throw new UnauthorizedError();
  }
}

module.exports = { authenticate };
