'use strict';

const { UnauthorizedError } = require('../errors');

const PUBLIC_PATHS = new Set(['/health']);

// Two authentication schemes: API clients present a bearer token, carrier
// webhooks present a shared secret header. The health endpoint is public so
// load balancers can probe it.

function createAuth({ apiToken, webhookSecret }) {
  function authenticate(req, pathname) {
    if (PUBLIC_PATHS.has(pathname)) return;

    if (pathname.startsWith('/webhooks/')) {
      const secret = req.headers['x-shiplog-webhook-secret'];
      if (secret !== webhookSecret) {
        throw new UnauthorizedError('invalid or missing webhook secret');
      }
      return;
    }

    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || token !== apiToken) {
      throw new UnauthorizedError('missing or invalid bearer token');
    }
  }

  return { authenticate };
}

module.exports = { createAuth };
