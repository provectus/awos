'use strict';

// The authorization decision. Deterministic over (amount, currency):
// - at or under the soft ceiling: authorized in full;
// - over the hard ceiling: declined, suspected_fraud;
// - otherwise: declined, over_band.

const { bandsFor } = require('./decline-bands');
const { DECLINE_CODES } = require('./decline-codes');

function decideAuthorization({ amount, currency }) {
  const band = bandsFor(currency);
  if (amount <= band.softCeiling) {
    return { outcome: 'authorized', authorizedAmount: amount, code: null };
  }
  if (amount > band.hardCeiling) {
    return {
      outcome: 'declined',
      authorizedAmount: 0,
      code: DECLINE_CODES.SUSPECTED_FRAUD,
    };
  }
  return {
    outcome: 'declined',
    authorizedAmount: 0,
    code: DECLINE_CODES.OVER_BAND,
  };
}

module.exports = { decideAuthorization };
