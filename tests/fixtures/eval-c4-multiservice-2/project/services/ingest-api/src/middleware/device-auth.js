'use strict';

const { UnauthorizedError } = require('../errors');

// Field devices authenticate with a shared fleet key in the x-device-key
// header. Health checks are unauthenticated so load balancers can probe.

const PUBLIC_PATHS = new Set(['/health']);

function createDeviceAuth({ deviceApiKey }) {
  if (!deviceApiKey) {
    throw new Error('createDeviceAuth requires a deviceApiKey');
  }

  function authenticate(req, pathname) {
    if (PUBLIC_PATHS.has(pathname)) return;
    const presented = req.headers['x-device-key'];
    if (presented !== deviceApiKey) {
      throw new UnauthorizedError('missing or invalid x-device-key header');
    }
  }

  return { authenticate };
}

module.exports = { createDeviceAuth };
