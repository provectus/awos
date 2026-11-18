'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ValidationError,
  assertNonEmptyString,
  assertNonNegativeNumber,
  assertIsoTimestamp,
  assertOneOf,
} = require('../packages/core/src/validation');

test('core validation: assertNonEmptyString rejects blanks and non-strings', () => {
  assert.throws(
    () => assertNonEmptyString('   ', 'field'),
    ValidationError,
    'whitespace-only strings must be rejected as empty'
  );
  assert.throws(
    () => assertNonEmptyString(42, 'field'),
    ValidationError,
    'non-string values must be rejected'
  );
  assert.equal(
    assertNonEmptyString('ok', 'field'),
    'ok',
    'valid strings must be returned unchanged'
  );
});

test('core validation: assertNonNegativeNumber accepts zero and rejects NaN', () => {
  assert.equal(
    assertNonNegativeNumber(0, 'field'),
    0,
    'zero is a valid register value and must be accepted'
  );
  assert.throws(
    () => assertNonNegativeNumber(Number.NaN, 'field'),
    ValidationError,
    'NaN must be rejected as a register value'
  );
  assert.throws(
    () => assertNonNegativeNumber(-1, 'field'),
    ValidationError,
    'negative numbers must be rejected'
  );
});

test('core validation: assertIsoTimestamp rejects unparseable strings', () => {
  assert.throws(
    () => assertIsoTimestamp('yesterday-ish', 'field'),
    ValidationError,
    'strings Date.parse cannot handle must be rejected as timestamps'
  );
  assert.equal(
    assertIsoTimestamp('2026-10-01T00:00:00.000Z', 'field'),
    '2026-10-01T00:00:00.000Z',
    'valid ISO timestamps must be returned unchanged'
  );
});

test('core validation: assertOneOf names the allowed values in its error', () => {
  assert.throws(
    () => assertOneOf('gold', ['standard', 'economy7'], 'tariff'),
    (err) => err instanceof ValidationError && err.message.includes('standard'),
    'the rejection message must list the allowed values so callers can self-correct'
  );
});
