'use strict';

const { ValidationError } = require('./errors');

function requireString(value, field) {
  if (typeof value !== 'string' || value === '') {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireInteger(value, field) {
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer`);
  }
  return value;
}

function requirePositiveInteger(value, field) {
  requireInteger(value, field);
  if (value <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return value;
}

function requireNonNegativeInteger(value, field) {
  requireInteger(value, field);
  if (value < 0) {
    throw new ValidationError(`${field} must not be negative`);
  }
  return value;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`);
  }
  return value;
}

function requireOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `${field} must be one of ${allowed.join(', ')}; saw ${value}`
    );
  }
  return value;
}

function optionalString(value, field) {
  if (value === undefined || value === null) return undefined;
  return requireString(value, field);
}

module.exports = {
  requireString,
  requireInteger,
  requirePositiveInteger,
  requireNonNegativeInteger,
  requireArray,
  requireOneOf,
  optionalString,
};
