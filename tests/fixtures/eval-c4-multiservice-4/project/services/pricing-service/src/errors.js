'use strict';

class UnknownCommandError extends Error {
  constructor(command) {
    super(`pricing-service does not handle command: ${command}`);
    this.name = 'UnknownCommandError';
    this.retryable = false;
  }
}

class UnpricedSkuError extends Error {
  constructor(sku) {
    super(`no base price on file for sku ${sku}`);
    this.name = 'UnpricedSkuError';
    this.retryable = false;
  }
}

module.exports = { UnknownCommandError, UnpricedSkuError };
