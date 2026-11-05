'use strict';

// GET /health — unauthenticated, for load-balancer probes.

function createHealthRoute() {
  return {
    method: 'GET',
    pattern: /^\/health$/,
    handler({ res }) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    },
  };
}

module.exports = { createHealthRoute };
