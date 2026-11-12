'use strict';

const { randomUUID } = require('node:crypto');

function uuid() {
  return randomUUID();
}

function orderId() {
  return `ord_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function shipmentId() {
  return `shp_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function jobId() {
  return `job_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

module.exports = { uuid, orderId, shipmentId, jobId };
