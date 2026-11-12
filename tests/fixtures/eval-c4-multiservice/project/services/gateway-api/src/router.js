'use strict';

// Minimal method + path-pattern router. Patterns use ':name' segments, e.g.
// '/orders/:orderId'. Handlers receive a ctx object built by the server.

function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const source = pattern.replace(/:[^/]+/g, (segment) => {
      keys.push(segment.slice(1));
      return '([^/]+)';
    });
    routes.push({ method, regex: new RegExp(`^${source}$`), keys, handler });
  }

  function match(method, pathname) {
    for (const route of routes) {
      if (route.method !== method) continue;
      const result = route.regex.exec(pathname);
      if (!result) continue;
      const params = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(result[index + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }

  return {
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    match,
  };
}

module.exports = { createRouter };
