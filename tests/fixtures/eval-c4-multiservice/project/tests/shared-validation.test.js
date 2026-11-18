'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ValidationError,
  assertNonEmptyString,
  assertPositiveInteger,
  assertIsoTimestamp,
  assertOneOf,
} = require('../packages/shared/src/validation');

test('validation: assertNonEmptyString accepts strings and rejects blanks', () => {
  assert.equal(
    assertNonEmptyString('ok', 'field'),
    'ok',
    'a non-empty string must be returned unchanged'
  );
  assert.throws(
    () => assertNonEmptyString('   ', 'field'),
    ValidationError,
    'whitespace-only strings must be rejected'
  );
  assert.throws(
    () => assertNonEmptyString(42, 'field'),
    ValidationError,
    'non-string values must be rejected'
  );
});

test('validation: assertPositiveInteger rejects zero, negatives, and floats', () => {
  assert.equal(
    assertPositiveInteger(3, 'field'),
    3,
    'a positive integer must be returned unchanged'
  );
  for (const bad of [0, -1, 1.5, '2']) {
    assert.throws(
      () => assertPositiveInteger(bad, 'field'),
      ValidationError,
      `assertPositiveInteger must reject ${JSON.stringify(bad)}`
    );
  }
});

test('validation: assertIsoTimestamp accepts ISO strings and names the field on failure', () => {
  const stamp = '2026-10-12T08:30:00.000Z';
  assert.equal(
    assertIsoTimestamp(stamp, 'occurredAt'),
    stamp,
    'a valid ISO timestamp must be returned unchanged'
  );
  try {
    assertIsoTimestamp('not-a-date', 'occurredAt');
    assert.fail('assertIsoTimestamp must throw on an unparseable timestamp');
  } catch (err) {
    assert.equal(
      err.field,
      'occurredAt',
      'the ValidationError must carry the offending field name'
    );
  }
});

test('validation: assertOneOf lists the allowed values in its error', () => {
  assert.equal(
    assertOneOf('b', ['a', 'b'], 'field'),
    'b',
    'an allowed value must be returned unchanged'
  );
  assert.throws(
    () => assertOneOf('c', ['a', 'b'], 'field'),
    /must be one of \[a, b\]/,
    'the error message must enumerate the allowed values'
  );
});
