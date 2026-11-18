'use strict';

function createLogger(prefix, sink = console) {
  const tag = `[${prefix}]`;
  return {
    log: (...args) => sink.log(tag, ...args),
    warn: (...args) => sink.warn(tag, ...args),
    error: (...args) => sink.error(tag, ...args),
  };
}

module.exports = { createLogger };
