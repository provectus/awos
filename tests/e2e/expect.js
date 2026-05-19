/**
 * Tiny assertion DSL for E2E scenario assert.js files.
 *
 * The whole point: read a fistful of tool calls extracted from a real
 * Claude Code session and let scenario authors say "I expect a Bash
 * call whose `command` matches /foo/" without dragging in a matcher
 * library. Failures throw with enough context that the human can see
 * what Claude actually did vs what was expected.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Match a single tool call against a target name + optional input
 * matcher. `name` can be a string (exact match) or a RegExp.
 * Each entry of `inputMatcher` is either a RegExp (tested against
 * String(value)) or any other value (compared with `===`).
 * @param {{ name: string, input: object }} call
 * @param {string|RegExp} name
 * @param {object} [inputMatcher]
 * @returns {boolean}
 */
function callMatches(call, name, inputMatcher) {
  if (name instanceof RegExp) {
    if (!name.test(call.name)) return false;
  } else if (call.name !== name) {
    return false;
  }
  if (!inputMatcher) return true;
  for (const [key, expected] of Object.entries(inputMatcher)) {
    const actual = call.input ? call.input[key] : undefined;
    if (expected instanceof RegExp) {
      if (actual === undefined || actual === null) return false;
      if (!expected.test(String(actual))) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * Render a short excerpt of recent tool-call names for an error
 * message. Useful when an assertion fails so the human can see what
 * trace they're working against.
 * @param {Array<{name: string}>} calls
 * @returns {string}
 */
function excerpt(calls) {
  if (!calls.length) return '(no tool calls in session)';
  const names = calls.slice(-15).map((c) => c.name);
  return names.join(' → ');
}

/**
 * Assert that at least one tool call matches `name` (+ optional
 * `inputMatcher`). Returns the matching calls so the caller can do
 * additional checks; throws on miss.
 * @param {Array<object>} calls
 * @param {string|RegExp} name
 * @param {object} [inputMatcher]
 * @returns {Array<object>}
 */
function expectToolCall(calls, name, inputMatcher) {
  const matches = calls.filter((c) => callMatches(c, name, inputMatcher));
  if (matches.length === 0) {
    const expectStr =
      name instanceof RegExp ? `name matching ${name}` : `name === "${name}"`;
    const matcherStr = inputMatcher
      ? ` with input ${JSON.stringify(inputMatcher, regexReplacer)}`
      : '';
    throw new Error(
      `expectToolCall: no tool call matched ${expectStr}${matcherStr}.\n` +
        `  Trace tail: ${excerpt(calls)}`
    );
  }
  return matches;
}

/**
 * Assert that NO tool call matches `name` (+ optional `inputMatcher`).
 * @param {Array<object>} calls
 * @param {string|RegExp} name
 * @param {object} [inputMatcher]
 */
function expectNoToolCall(calls, name, inputMatcher) {
  const matches = calls.filter((c) => callMatches(c, name, inputMatcher));
  if (matches.length > 0) {
    const expectStr =
      name instanceof RegExp ? `name matching ${name}` : `name === "${name}"`;
    const matcherStr = inputMatcher
      ? ` with input ${JSON.stringify(inputMatcher, regexReplacer)}`
      : '';
    throw new Error(
      `expectNoToolCall: found ${matches.length} unwanted call(s) for ${expectStr}${matcherStr}.\n` +
        `  First match input: ${JSON.stringify(matches[0].input)}`
    );
  }
}

/**
 * Assert that a file exists relative to `workdir` and, optionally, that
 * its content matches a RegExp / contains a substring.
 * @param {string} workdir
 * @param {string} relPath
 * @param {RegExp|string} [contentMatcher]
 */
function expectFileExists(workdir, relPath, contentMatcher) {
  const abs = path.join(workdir, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `expectFileExists: file not found at ${relPath} (under ${workdir}).`
    );
  }
  if (contentMatcher === undefined) return;
  const text = fs.readFileSync(abs, 'utf8');
  if (contentMatcher instanceof RegExp) {
    if (!contentMatcher.test(text)) {
      throw new Error(
        `expectFileExists: ${relPath} exists but content did not match ${contentMatcher}.\n` +
          `  Head: ${text.slice(0, 200).replace(/\n/g, '\\n')}`
      );
    }
  } else if (typeof contentMatcher === 'string') {
    if (!text.includes(contentMatcher)) {
      throw new Error(
        `expectFileExists: ${relPath} exists but does not contain "${contentMatcher}".\n` +
          `  Head: ${text.slice(0, 200).replace(/\n/g, '\\n')}`
      );
    }
  }
}

/**
 * JSON.stringify replacer so RegExp values render as /pattern/ rather
 * than as `{}`.
 */
function regexReplacer(_key, value) {
  if (value instanceof RegExp) return value.toString();
  return value;
}

/**
 * Build a `check(description, fn)` helper bound to a `report` object.
 *
 * Scenario `assert.js` files use `check` to name each individual
 * assertion so the verify harness can stream a pass/fail line per
 * check. `report.start(desc)`, `report.pass(desc)`, and
 * `report.fail(desc, err)` are invoked at the obvious moments.
 * `check` re-throws on failure so subsequent dependent checks bail.
 *
 * @param {{ start?: Function, pass: Function, fail: Function }} report
 * @returns {(description: string, fn: Function) => Promise<any>}
 */
function makeChecker(report) {
  return async function check(description, fn) {
    report.start?.(description);
    try {
      const result = await fn();
      report.pass(description);
      return result;
    } catch (err) {
      report.fail(description, err);
      throw err;
    }
  };
}

module.exports = {
  callMatches,
  expectToolCall,
  expectNoToolCall,
  expectFileExists,
  makeChecker,
};
