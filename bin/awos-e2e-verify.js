#!/usr/bin/env node
/**
 * awos-e2e-verify <scenario> <workdir>
 *
 * 1. Read <workdir>/.awos-e2e-prepare-time for the lower-bound timestamp.
 * 2. Find session JSONLs at ~/.claude/projects/<encoded(workdir)>/
 *    filtered to first-event timestamp >= prepare-time.
 * 3. Pick the most recent one if multiple are present.
 * 4. Parse events, extract tool calls.
 * 5. Load tests/e2e/scenarios/<scenario>/assert.js — expects a CommonJS
 *    module exporting `async function run({ events, toolCalls, workdir })`.
 * 6. Invoke it. Pass → exit 0 with summary. Fail → exit 1 with message.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const { findSessionsForCwd, readEvents, extractToolCalls } = require(
  path.join(repoRoot, 'tests', 'e2e', 'session-reader')
);

async function main() {
  const scenario = process.argv[2];
  const workdir = process.argv[3];
  if (!scenario || !workdir) {
    process.stderr.write(
      'usage: awos-e2e-verify <scenario> <workdir>\n' +
        '       (workdir is what `awos-e2e-prepare` printed)\n'
    );
    process.exit(2);
  }

  const scenarioDir = path.join(
    repoRoot,
    'tests',
    'e2e',
    'scenarios',
    scenario
  );
  const assertPath = path.join(scenarioDir, 'assert.js');
  if (!fs.existsSync(assertPath)) {
    process.stderr.write(`error: no assert.js at ${assertPath}\n`);
    process.exit(1);
  }

  const stampPath = path.join(workdir, '.awos-e2e-prepare-time');
  if (!fs.existsSync(stampPath)) {
    process.stderr.write(
      `error: ${stampPath} not found — did you run ` +
        `\`npm run e2e:prepare ${scenario}\` first?\n`
    );
    process.exit(1);
  }
  const stampRaw = fs.readFileSync(stampPath, 'utf8').trim();
  const since = new Date(stampRaw);
  if (Number.isNaN(since.getTime())) {
    process.stderr.write(
      `error: ${stampPath} contains invalid timestamp ${JSON.stringify(stampRaw)}\n`
    );
    process.exit(1);
  }

  const sessions = findSessionsForCwd(workdir, { since });
  if (sessions.length === 0) {
    process.stderr.write(
      `error: no session log found for ${workdir} after ${since.toISOString()}.\n` +
        `       Did you run \`claude\` inside ${workdir} and finish the command?\n`
    );
    process.exit(1);
  }

  // findSessionsForCwd returns oldest → newest; pick the most recent.
  const sessionPath = sessions[sessions.length - 1];

  const events = readEvents(sessionPath);
  const toolCalls = extractToolCalls(events);

  const assertModule = require(assertPath);
  const run =
    typeof assertModule === 'function' ? assertModule : assertModule.run;
  if (typeof run !== 'function') {
    process.stderr.write(
      `error: ${assertPath} must export a function ` +
        `(default export or named "run").\n`
    );
    process.exit(1);
  }

  try {
    await run({ events, toolCalls, workdir });
  } catch (err) {
    process.stderr.write(
      `\n[FAIL] ${scenario}\n` +
        `  session: ${sessionPath}\n` +
        `  tool calls observed: ${toolCalls.length}\n\n` +
        `  ${err.message || err}\n`
    );
    process.exit(1);
  }

  process.stdout.write(
    `[pass] ${scenario}\n` +
      `       session: ${sessionPath}\n` +
      `       events:  ${events.length}\n` +
      `       tool calls: ${toolCalls.length}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`verify failed: ${err.stack || err.message || err}\n`);
  process.exit(1);
});
