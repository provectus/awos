'use strict';

// Tiny pattern router: routes are { method, pattern, handler } where pattern
// is a RegExp over the pathname and capture groups become positional params.

function createRouter(routes) {
  async function dispatch({ req, res, body, ctx }) {
    const url = new URL(req.url, 'http://localhost');
    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      await route.handler({
        req,
        res,
        body,
        params: match.slice(1).map(decodeURIComponent),
        query: url.searchParams,
        ctx,
      });
      return true;
    }
    return false;
  }

  return { dispatch };
}

module.exports = { createRouter };
