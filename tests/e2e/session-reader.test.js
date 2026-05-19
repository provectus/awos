/**
 * Unit tests for tests/e2e/session-reader.js.
 *
 * These run against the checked-in fixture JSONL — no live Claude
 * session needed. Same node:test discipline as the rest of the suite;
 * passes under both `node --test` and `bun test`.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const os = require('node:os');
const path = require('node:path');

const {
  encodeCwd,
  findSessionsForCwd,
  readEvents,
  extractToolCalls,
} = require('./session-reader');

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-session.jsonl');

test('encodeCwd converts slashes and underscores to dashes', () => {
  // Use a nonce so the path can't exist; encodeCwd then skips realpath
  // and exercises the pure transformation.
  const nonce = Date.now() + '-' + Math.random().toString(36).slice(2);
  assert.equal(encodeCwd('/Users/me/work-' + nonce), '-Users-me-work-' + nonce);
  // macOS temp paths look like /private/var/folders/_x/<hash>/T/<dir>;
  // Claude Code's encoded form is -private-var-folders--x-<hash>-T-<dir>
  // (note the double dash from `_x/`).
  assert.equal(
    encodeCwd('/private/var/folders/_x/abc/T/foo-' + nonce),
    '-private-var-folders--x-abc-T-foo-' + nonce
  );
});

test('readEvents parses every JSON line in order', () => {
  const events = readEvents(FIXTURE);
  // 9 non-blank lines in the fixture.
  assert.equal(events.length, 9, 'expected 9 events in fixture');
  assert.equal(events[0].type, 'summary');
  assert.equal(events[1].type, 'user');
  assert.equal(events[2].type, 'assistant');
  assert.equal(events[events.length - 1].type, 'last-prompt');
});

test('readEvents handles both string and array user content', () => {
  const events = readEvents(FIXTURE);
  // First user event has string content (intro prompt).
  const stringUser = events.find(
    (e) => e.type === 'user' && typeof e.message?.content === 'string'
  );
  assert.ok(stringUser, 'expected a user event with string content');

  // Later user events carry tool_result arrays.
  const arrayUser = events.find(
    (e) => e.type === 'user' && Array.isArray(e.message?.content)
  );
  assert.ok(arrayUser, 'expected a user event with array content');
  assert.equal(arrayUser.message.content[0].type, 'tool_result');
});

test('extractToolCalls flattens tool_use blocks across assistant events', () => {
  const events = readEvents(FIXTURE);
  const calls = extractToolCalls(events);

  // 1 Bash + 2 parallel Reads = 3 total.
  assert.equal(calls.length, 3, 'expected 3 tool calls in fixture');

  const names = calls.map((c) => c.name);
  assert.deepEqual(names, ['Bash', 'Read', 'Read']);

  // Bash call carries the command.
  assert.equal(calls[0].name, 'Bash');
  assert.equal(calls[0].input.command, 'ls -la');

  // Both Reads carry file_path.
  assert.match(calls[1].input.file_path, /package\.json$/);
  assert.match(calls[2].input.file_path, /README\.md$/);

  // Metadata propagates from the assistant event.
  for (const call of calls) {
    assert.ok(call.timestamp, 'each call carries a timestamp');
    assert.ok(call.assistantUuid, 'each call carries originating uuid');
    assert.equal(call.sessionId, 'sess-1111');
  }

  // The two parallel Reads share the same originating assistant event.
  assert.equal(calls[1].assistantUuid, calls[2].assistantUuid);
});

test('extractToolCalls returns [] when there are no assistant events', () => {
  const calls = extractToolCalls([
    { type: 'summary' },
    { type: 'user', message: { role: 'user', content: 'hi' } },
  ]);
  assert.deepEqual(calls, []);
});

// findSessionsForCwd needs HOME to point somewhere we control. The
// session-reader reads `process.env.HOME` lazily so swapping it here
// inside one test is safe.
const createdHomes = [];
after(async () => {
  for (const d of createdHomes) {
    try {
      await fsPromises.rm(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

test('findSessionsForCwd resolves encoded path under HOME/.claude/projects', async () => {
  const fakeHome = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'awos-e2e-home-')
  );
  createdHomes.push(fakeHome);
  const cwd = '/tmp/awos-e2e-sample';
  const projectDir = path.join(fakeHome, '.claude', 'projects', encodeCwd(cwd));
  await fsPromises.mkdir(projectDir, { recursive: true });

  // Drop the fixture in as two separate sessions with different
  // start timestamps.
  const fixtureRaw = await fsPromises.readFile(FIXTURE, 'utf8');
  const olderPath = path.join(projectDir, 'sess-older.jsonl');
  const newerPath = path.join(projectDir, 'sess-newer.jsonl');
  // Older — first timestamp is 2020-01-01.
  await fsPromises.writeFile(
    olderPath,
    fixtureRaw.replace(/2026-05-19T10:00:00\.000Z/, '2020-01-01T00:00:00.000Z')
  );
  // Newer — keep as-is (2026-05-19).
  await fsPromises.writeFile(newerPath, fixtureRaw);

  const origHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    // No `since` filter — both sessions returned, oldest first.
    const all = findSessionsForCwd(cwd);
    assert.equal(all.length, 2);
    assert.equal(path.basename(all[0]), 'sess-older.jsonl');
    assert.equal(path.basename(all[1]), 'sess-newer.jsonl');

    // `since` clips out the older one.
    const recent = findSessionsForCwd(cwd, {
      since: new Date('2023-01-01T00:00:00.000Z'),
    });
    assert.equal(recent.length, 1);
    assert.equal(path.basename(recent[0]), 'sess-newer.jsonl');

    // Unknown cwd → empty result.
    const missing = findSessionsForCwd('/does/not/exist');
    assert.deepEqual(missing, []);
  } finally {
    process.env.HOME = origHome;
  }
});
