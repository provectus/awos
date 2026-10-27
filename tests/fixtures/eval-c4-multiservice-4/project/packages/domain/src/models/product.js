'use strict';

const { requireString, optionalString } = require('../validation/validators');

function createProduct({ sku, name, description }) {
  return {
    sku: requireString(sku, 'sku'),
    name: requireString(name, 'name'),
    description: optionalString(description, 'description') || '',
  };
}

module.exports = { createProduct };
