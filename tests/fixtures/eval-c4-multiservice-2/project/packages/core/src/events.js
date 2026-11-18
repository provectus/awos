'use strict';

const { EventEmitter } = require('node:events');

// Small in-process event helper. This never crosses a process boundary: it is
// a convenience for decoupling log/metric listeners from request handlers
// inside a single service. Cross-service integration goes through the
// file-backed queue in src/queue/file-queue.js, not through this emitter.

function createEmitter() {
  const emitter = new EventEmitter();

  function emit(name, payload) {
    emitter.emit(name, payload);
  }

  function on(name, listener) {
    emitter.on(name, listener);
    return () => emitter.off(name, listener);
  }

  return { emit, on };
}

module.exports = { createEmitter };
