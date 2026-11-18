'use strict';

// The platform's message vocabulary in one place. Commands are addressed to
// exactly one service; events are facts any service may consume.

const COMMANDS = {
  QUOTE_CART: 'quote-cart',
  UPSERT_RATE: 'upsert-rate',
  UPSERT_TIER: 'upsert-tier',
  UPSERT_CONVERSION_RATE: 'upsert-conversion-rate',
  UPSERT_ROUNDING_RULE: 'upsert-rounding-rule',
  UPSERT_PROMOTION: 'upsert-promotion',
  SET_ON_HAND: 'set-on-hand',
  CHECKOUT: 'checkout',
  AUTHORIZE_PAYMENT: 'authorize-payment',
  CAPTURE_PAYMENT: 'capture-payment',
  RESERVE_STOCK: 'reserve-stock',
  RELEASE_STOCK: 'release-stock',
};

const EVENTS = {
  PRICE_QUOTED: 'price.quoted',
  PROMOTION_APPLIED: 'promotion.applied',
  PAYMENT_AUTHORIZED: 'payment.authorized',
  PAYMENT_DECLINED: 'payment.declined',
  PAYMENT_CAPTURED: 'payment.captured',
  STOCK_RESERVED: 'stock.reserved',
  STOCK_REJECTED: 'stock.rejected',
  STOCK_RELEASED: 'stock.released',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_DECLINED: 'order.declined',
};

const TARGETS = {
  PRICING: 'pricing-service',
  PROMOTIONS: 'promotions-service',
  ORCHESTRATOR: 'checkout-orchestrator',
  PAYMENTS: 'payments-gateway',
  STOCK: 'stock-service',
};

module.exports = { COMMANDS, EVENTS, TARGETS };
