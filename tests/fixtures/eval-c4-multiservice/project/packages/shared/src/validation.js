'use strict';

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
  return value;
}

function assertPositiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive integer`, field);
  }
  return value;
}

function assertIsoTimestamp(value, field) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(
      `${field} must be an ISO-8601 timestamp string`,
      field
    );
  }
  return value;
}

function assertOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `${field} must be one of [${allowed.join(', ')}], got '${value}'`,
      field
    );
  }
  return value;
}

module.exports = {
  ValidationError,
  assertNonEmptyString,
  assertPositiveInteger,
  assertIsoTimestamp,
  assertOneOf,
};
