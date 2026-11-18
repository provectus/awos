'use strict';

const { requireString, optionalString } = require('../validation/validators');

function createCustomer({ customerId, email }) {
  return {
    customerId: requireString(customerId, 'customerId'),
    email: optionalString(email, 'email') || null,
  };
}

module.exports = { createCustomer };
