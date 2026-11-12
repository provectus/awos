'use strict';

const {
  requireString,
  requireInteger,
  requireOneOf,
  requireNonNegativeInteger,
} = require('../validation/validators');
const { ValidationError } = require('../validation/errors');

const PROMOTION_TYPES = ['percentage', 'fixed-amount', 'buy-n-get-m'];

// A promotion rule. `priority` declares stacking order (lower applies
// first). `validFrom`/`validTo` are ISO timestamps bounding the validity
// window; `perCustomerCap` bounds how many completed checkouts per customer
// may use the promotion. `params` is type-specific:
//   percentage:   { bps }                      basis points off
//   fixed-amount: { amount, currency }         flat amount off
//   buy-n-get-m:  { buyQuantity, getQuantity } cheapest qualifying lines free

function createPromotion({
  promotionId,
  code,
  type,
  priority,
  params,
  validFrom,
  validTo,
  perCustomerCap,
}) {
  if (params === null || typeof params !== 'object') {
    throw new ValidationError('params must be an object');
  }
  return {
    promotionId: requireString(promotionId, 'promotionId'),
    code: requireString(code, 'code'),
    type: requireOneOf(type, PROMOTION_TYPES, 'type'),
    priority: requireInteger(priority, 'priority'),
    params: { ...params },
    validFrom: requireString(validFrom, 'validFrom'),
    validTo: requireString(validTo, 'validTo'),
    perCustomerCap: requireNonNegativeInteger(
      perCustomerCap ?? 0,
      'perCustomerCap'
    ),
  };
}

module.exports = { createPromotion, PROMOTION_TYPES };
