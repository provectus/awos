'use strict';

function toProductView(product) {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description,
  };
}

module.exports = { toProductView };
