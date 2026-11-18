'use strict';

function toVariantView(variant) {
  return {
    variantId: variant.variantId,
    sku: variant.sku,
    attributes: variant.attributes,
  };
}

module.exports = { toVariantView };
