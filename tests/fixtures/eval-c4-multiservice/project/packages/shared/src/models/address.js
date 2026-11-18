'use strict';

const { assertNonEmptyString } = require('../validation');

function createAddress(input = {}) {
  return {
    line1: assertNonEmptyString(input.line1, 'address.line1'),
    line2: typeof input.line2 === 'string' ? input.line2 : '',
    city: assertNonEmptyString(input.city, 'address.city'),
    postalCode: assertNonEmptyString(input.postalCode, 'address.postalCode'),
    country: assertNonEmptyString(input.country, 'address.country')
      .trim()
      .toUpperCase(),
  };
}

function formatOneLine(address) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.postalCode,
    address.country,
  ]
    .filter((part) => part !== '')
    .join(', ');
}

module.exports = { createAddress, formatOneLine };
