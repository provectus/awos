/**
 * Claude Code session log parser.
 *
 * Sessions are written by Claude Code as JSONL files under
 * ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl. Each line is one
 * event. We don't try to validate Claude Code's full schema — just expose
 * the fields the E2E harness needs:
 *
 *   findSessionsForCwd(cwd, { since? }) → string[]
 *   readEvents(jsonlPath)               → Array<Event>
 *   extractToolCalls(events)            → Array<ToolCall>
 *
 * Tool calls live as content blocks inside `type: "assistant"` events:
 *   { type: "tool_use", id, name, input }
 *
 * Zero npm dependencies. Built on node:fs / node:path / node:os.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Mirror Claude Code's project-directory encoding: every `/` in the
 * absolute cwd becomes `-`. So `/tmp/awos-e2e-abc` → `-tmp-awos-e2e-abc`.
 * @param {string} cwd
 * @returns {string}
 */
function encodeCwd(cwd) {
  // Claude Code converts both `/` and `_` to `-` when forming the project
  // directory name under ~/.claude/projects/. The macOS-specific gotcha is
  // that /var/folders/... is a symlink to /private/var/folders/..., and
  // Claude records the canonical (realpath) form — so resolve the symlink
  // first when the path exists.
  let resolved = cwd;
  try {
    resolved = fs.realpathSync(cwd);
  } catch {
    // Path may not exist (synthetic input for tests); fall back to cwd as-is.
  }
  return resolved.replace(/[/_]/g, '-');
}

/**
 * Resolve the projects-root directory under the user's HOME.
 * `process.env.HOME` is honored when set so tests can stub it.
 * @returns {string}
 */
function projectsRoot() {
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.claude', 'projects');
}

/**
 * Return the timestamp of the first non-summary event in a JSONL file,
 * or null if no usable timestamp is present. We skip `summary` /
 * `last-prompt` and similar synthetic events that lack `timestamp`.
 * @param {string} jsonlPath
 * @returns {Date|null}
 */
function firstEventTimestamp(jsonlPath) {
  let raw;
  try {
    raw = fs.readFileSync(jsonlPath, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    if (evt && typeof evt.timestamp === 'string') {
      const d = new Date(evt.timestamp);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * Find session log files associated with a given cwd.
 * @param {string} cwd - Absolute working directory used by Claude Code.
 * @param {{ since?: Date }} [opts]
 * @returns {string[]} Absolute paths to *.jsonl files, sorted oldest → newest.
 */
function findSessionsForCwd(cwd, opts = {}) {
  const dir = path.join(projectsRoot(), encodeCwd(cwd));
  if (!fs.existsSync(dir)) return [];

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => path.join(dir, e.name));

  const since = opts.since ? opts.since.getTime() : null;

  const annotated = entries
    .map((p) => ({ path: p, ts: firstEventTimestamp(p) }))
    .filter((row) => {
      if (since === null) return true;
      if (!row.ts) return false;
      return row.ts.getTime() >= since;
    })
    .sort((a, b) => {
      const at = a.ts ? a.ts.getTime() : 0;
      const bt = b.ts ? b.ts.getTime() : 0;
      return at - bt;
    });

  return annotated.map((row) => row.path);
}

/**
 * Read a JSONL session log and return the parsed events in order.
 * Malformed lines are skipped silently so a partial / in-flight log
 * doesn't blow up the assertion harness.
 * @param {string} jsonlPath
 * @returns {Array<object>}
 */
function readEvents(jsonlPath) {
  const raw = fs.readFileSync(jsonlPath, 'utf8');
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Skip — partial line at end of file, or unrelated noise.
    }
  }
  return out;
}

/**
 * Walk a list of session events and pull out every tool_use content
 * block from `type: "assistant"` events.
 * @param {Array<object>} events
 * @returns {Array<{name: string, input: object, timestamp: string|null, assistantUuid: string|null, sessionId: string|null, id: string|null}>}
 */
function extractToolCalls(events) {
  const calls = [];
  for (const evt of events) {
    if (!evt || evt.type !== 'assistant') continue;
    const content =
      evt.message && Array.isArray(evt.message.content)
        ? evt.message.content
        : [];
    for (const block of content) {
      if (!block || block.type !== 'tool_use') continue;
      calls.push({
        id: block.id || null,
        name: block.name || '',
        input: block.input || {},
        timestamp: evt.timestamp || null,
        assistantUuid: evt.uuid || null,
        sessionId: evt.sessionId || null,
      });
    }
  }
  return calls;
}

module.exports = {
  encodeCwd,
  projectsRoot,
  firstEventTimestamp,
  findSessionsForCwd,
  readEvents,
  extractToolCalls,
};
