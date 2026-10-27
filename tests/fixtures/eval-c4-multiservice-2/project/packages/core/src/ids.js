'use strict';

const { randomUUID } = require('node:crypto');

function short() {
  return randomUUID().replaceAll('-', '').slice(0, 12);
}

function meterId() {
  return `mtr_${short()}`;
}

function readingId() {
  return `rdg_${short()}`;
}

function invoiceId() {
  return `inv_${short()}`;
}

function customerId() {
  return `cus_${short()}`;
}

function jobId() {
  return `job_${short()}`;
}

module.exports = { meterId, readingId, invoiceId, customerId, jobId };
