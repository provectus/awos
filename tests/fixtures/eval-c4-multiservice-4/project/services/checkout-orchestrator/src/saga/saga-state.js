'use strict';

// The checkout saga's states and legal transitions. Forward path:
// authorizing -> reserving -> capturing -> confirmed. Anything can decline.

const STATES = [
  'authorizing',
  'reserving',
  'capturing',
  'confirmed',
  'declined',
];

const TRANSITIONS = {
  authorizing: ['reserving', 'declined'],
  reserving: ['capturing', 'declined'],
  capturing: ['confirmed', 'declined'],
  confirmed: [],
  declined: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = { STATES, TRANSITIONS, canTransition };
