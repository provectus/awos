'use strict';

class HandlerError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = 'HandlerError';
    this.retryable = retryable;
  }
}

class UnknownTariffError extends Error {
  constructor(tariff) {
    super(`no rate table entry for tariff '${tariff}'`);
    this.name = 'UnknownTariffError';
    this.retryable = false;
  }
}

module.exports = { HandlerError, UnknownTariffError };
