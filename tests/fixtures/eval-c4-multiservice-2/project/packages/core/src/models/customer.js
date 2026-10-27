'use strict';

const { assertNonEmptyString } = require('../validation');
const { customerId } = require('../ids');
const { nowIso } = require('../clock');

function createCustomer(input = {}) {
  return {
    id: input.id || customerId(),
    name: assertNonEmptyString(input.name, 'customer.name'),
    email: assertNonEmptyString(input.email, 'customer.email'),
    createdAt: nowIso(),
  };
}

module.exports = { createCustomer };
