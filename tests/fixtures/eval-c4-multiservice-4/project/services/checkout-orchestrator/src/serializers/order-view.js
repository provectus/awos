'use strict';

const { formatMoney } = require('../../../../packages/domain/src/money/format');

function toOrderView(order) {
  return {
    orderId: order.orderId,
    cartId: order.cartId,
    status: order.status,
    currency: order.currency,
    total: order.total,
    display: formatMoney({ amount: order.total, currency: order.currency }),
    promotionIds: order.promotionIds,
  };
}

module.exports = { toOrderView };
