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

/**
 * Tokens at the start of a Bash command that demonstrate the command
 * is reading content (not creating, deleting, or just naming the path
 * in a string). Bash is generic; without this guard a command like
 * `echo ".claude/agents"` or `mkdir .claude/agents` would falsely
 * count as access.
 *
 * Picked conservatively — common read tools only. Add to this list
 * when a real-world session uses something not covered.
 */
const BASH_READ_TOKENS =
  /(^|[\s|&;`(])\s*(ls|cat|head|tail|find|grep|rg|wc|tree|file|stat|less|more|awk|sed|jq|yq|tac|column|sort|uniq|diff|cmp)\b/;

/**
 * Find tool calls whose target path matches `pathRegex`. Used by
 * scenarios to assert that Claude touched a specific directory or
 * file by any reasonable mechanism — without locking the assertion
 * to a single tool.
 *
 * Covers:
 *   Glob/Read/LS/Grep    — direct filesystem tools (path appears in input)
 *   Bash                  — shell access, but ONLY when the command
 *                           contains a read-like binary (ls, cat, find,
 *                           grep, etc.) AND the path. A bare mention of
 *                           the path (echo, mkdir, rm) doesn't count.
 *   Agent/Task            — delegation whose prompt mentions the path,
 *                           or whose subagent_type is Explore (read-only)
 *
 * The union is intentionally tolerant: any of these proves the path
 * was inspected; a stricter check would over-fit to one tool choice.
 *
 * @param {Array<object>} toolCalls
 * @param {RegExp} pathRegex
 * @returns {Array<object>}
 */
function pathAccessCalls(toolCalls, pathRegex) {
  return toolCalls.filter((call) => {
    const input = call.input || {};
    if (call.name === 'Glob')
      return pathRegex.test(String(input.pattern || ''));
    if (call.name === 'Read')
      return pathRegex.test(String(input.file_path || ''));
    if (call.name === 'LS') return pathRegex.test(String(input.path || ''));
    if (call.name === 'Grep') {
      return pathRegex.test(String(input.path || input.glob || ''));
    }
    if (call.name === 'Bash') {
      const cmd = String(input.command || '');
      return pathRegex.test(cmd) && BASH_READ_TOKENS.test(cmd);
    }
    if (call.name === 'Agent' || call.name === 'Task') {
      return (
        pathRegex.test(String(input.prompt || '')) ||
        pathRegex.test(String(input.description || '')) ||
        /Explore/i.test(String(input.subagent_type || ''))
      );
    }
    return false;
  });
}

module.exports = {
  callMatches,
  expectToolCall,
  expectNoToolCall,
  expectFileExists,
  makeChecker,
  pathAccessCalls,
};
