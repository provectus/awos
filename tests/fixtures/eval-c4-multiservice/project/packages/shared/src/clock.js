'use strict';

// Injectable clock. Production code always goes through nowIso()/nowMs() so
// tests can freeze time without monkey-patching Date.

let frozen = null;

function nowIso() {
  return (frozen ?? new Date()).toISOString();
}

function nowMs() {
  return frozen ? frozen.getTime() : Date.now();
}

function freeze(date) {
  frozen = date instanceof Date ? date : new Date(date);
}

function unfreeze() {
  frozen = null;
}

module.exports = { nowIso, nowMs, freeze, unfreeze };
