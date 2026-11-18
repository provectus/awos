'use strict';

const { randomUUID } = require('node:crypto');

function short() {
  return randomUUID().replaceAll('-', '').slice(0, 12);
}

function cartId() {
  return `crt_${short()}`;
}

function quoteId() {
  return `qot_${short()}`;
}

function orderId() {
  return `ord_${short()}`;
}

function attemptId() {
  return `att_${short()}`;
}

function reservationId() {
  return `res_${short()}`;
}

function promotionId() {
  return `pro_${short()}`;
}

function commandId() {
  return `cmd_${short()}`;
}

function eventId() {
  return `evt_${short()}`;
}

function entryId() {
  return `ent_${short()}`;
}

module.exports = {
  cartId,
  quoteId,
  orderId,
  attemptId,
  reservationId,
  promotionId,
  commandId,
  eventId,
  entryId,
};
