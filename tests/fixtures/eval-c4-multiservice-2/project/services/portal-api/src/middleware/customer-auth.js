'use strict';

const { UnauthorizedError } = require('../errors');

// The portal frontend authenticates with a shared key in the x-portal-key
// header. Health checks are unauthenticated so load balancers can probe.

const PUBLIC_PATHS = new Set(['/health']);

function createCustomerAuth({ portalApiKey }) {
  if (!portalApiKey) {
    throw new Error('createCustomerAuth requires a portalApiKey');
  }

  function authenticate(req, pathname) {
    if (PUBLIC_PATHS.has(pathname)) return;
    const presented = req.headers['x-portal-key'];
    if (presented !== portalApiKey) {
      throw new UnauthorizedError('missing or invalid x-portal-key header');
    }
  }

  return { authenticate };
}

module.exports = { createCustomerAuth };
