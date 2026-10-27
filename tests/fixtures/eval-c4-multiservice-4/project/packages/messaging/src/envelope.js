'use strict';

// Envelope validation shared by both queues. Commands are imperative and
// addressed (`target` names the one consuming service); events are facts
// (`source` names the emitter, anyone may consume).

function assertCommandFields({ target, command }) {
  if (typeof target !== 'string' || target === '') {
    throw new Error('command envelope requires a non-empty target');
  }
  if (typeof command !== 'string' || command === '') {
    throw new Error('command envelope requires a non-empty command name');
  }
}

function assertEventFields({ source, event }) {
  if (typeof source !== 'string' || source === '') {
    throw new Error('event envelope requires a non-empty source');
  }
  if (typeof event !== 'string' || event === '') {
    throw new Error('event envelope requires a non-empty event name');
  }
}

module.exports = { assertCommandFields, assertEventFields };
