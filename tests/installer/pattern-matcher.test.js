/**
 * Unit tests for src/utils/pattern-matcher.js.
 *
 * Exhaustive coverage of matchesPattern: all four branches of the glob-to-
 * regex translation (literal, *, ?, escaped dot), the '*' fast path,
 * scalar vs array pattern inputs, case-insensitivity, and rejection.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  matchesPattern,
  matchesAnyPattern,
} = require('../../src/utils/pattern-matcher');

test("'*' short-circuits and matches every filename", () => {
  assert.equal(matchesPattern('anything.md', '*'), true);
  assert.equal(matchesPattern('no-extension', '*'), true);
  assert.equal(matchesPattern('', '*'), true);
});

test('literal filename matches itself only', () => {
  assert.equal(matchesPattern('product.md', 'product.md'), true);
  assert.equal(matchesPattern('product.md', 'roadmap.md'), false);
});

test('dots in the pattern are escaped (not treated as regex wildcards)', () => {
  // Without escaping, 'a.b' would also match 'axb' under regex semantics.
  // The escape branch in pattern-matcher.js makes the dot literal.
  assert.equal(matchesPattern('axb', 'a.b'), false);
  assert.equal(matchesPattern('a.b', 'a.b'), true);
});

test("'*' inside a pattern matches any run of characters", () => {
  assert.equal(matchesPattern('architecture.md', '*.md'), true);
  assert.equal(matchesPattern('architecture.md', 'arch*'), true);
  assert.equal(matchesPattern('architecture.md', '*tect*'), true);
  assert.equal(matchesPattern('architecture.md', '*.txt'), false);
});

test("'?' matches exactly one character", () => {
  assert.equal(matchesPattern('abc.md', 'a?c.md'), true);
  // '?' is one char, so 'ac.md' should NOT match 'a?c.md'.
  assert.equal(matchesPattern('ac.md', 'a?c.md'), false);
  assert.equal(matchesPattern('abbc.md', 'a?c.md'), false);
});

test('matching is case-insensitive', () => {
  assert.equal(matchesPattern('ARCH.MD', 'arch.md'), true);
  assert.equal(matchesPattern('Arch.md', '*.MD'), true);
});

test('array of patterns matches if any element matches', () => {
  assert.equal(matchesPattern('product.md', ['*.txt', '*.md']), true);
  assert.equal(matchesPattern('product.bin', ['*.txt', '*.md']), false);
  assert.equal(matchesPattern('product.md', []), false);
});

test('matchesAnyPattern is an alias of matchesPattern', () => {
  // Pinned for back-compat — file-copier and tests import it under both names.
  assert.equal(matchesAnyPattern, matchesPattern);
});
