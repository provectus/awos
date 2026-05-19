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
const { makeChecker } = require(path.join(repoRoot, 'tests', 'e2e', 'expect'));

function loadLastRun() {
  const statePath = path.join(
    path.resolve(__dirname, '..'),
    'tests',
    'e2e',
    '.last-run.json'
  );
  if (!fs.existsSync(statePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  let scenario = process.argv[2];
  let workdir = process.argv[3];

  // No args: pull both from the last-run state.
  if (!scenario && !workdir) {
    const last = loadLastRun();
    if (!last) {
      process.stderr.write(
        'usage: awos-e2e-verify [<scenario>] [<workdir>]\n' +
          '  no args:                use the most recent `e2e:prepare`\n' +
          '  scenario only:          use that scenario, pull workdir from state\n' +
          '  scenario + workdir:     explicit\n\n' +
          'No prior prepare on record at tests/e2e/.last-run.json.\n'
      );
      process.exit(2);
    }
    scenario = last.scenario;
    workdir = last.workdir;
    process.stdout.write(
      `Resuming last prepare: scenario=${scenario}, workdir=${workdir}\n`
    );
  }

  // Scenario only: pull workdir from state if it matches.
  if (scenario && !workdir) {
    const last = loadLastRun();
    if (last && last.scenario === scenario) {
      workdir = last.workdir;
    } else {
      process.stderr.write(
        `error: scenario "${scenario}" given without a workdir, and the last ` +
          `prepare was ${last ? `for "${last.scenario}"` : 'absent'}.\n` +
          `  Run \`bun run e2e:prepare ${scenario}\` or pass the workdir explicitly.\n`
      );
      process.exit(2);
    }
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

  process.stdout.write(`\n${scenario}\n`);
  process.stdout.write(`  session: ${sessionPath}\n`);
  process.stdout.write(
    `  events: ${events.length}, tool calls: ${toolCalls.length}\n\n`
  );

  const stats = { passed: 0, failed: 0 };
  const report = {
    pass(description) {
      stats.passed += 1;
      process.stdout.write(`  ✓ ${description}\n`);
    },
    fail(description, err) {
      stats.failed += 1;
      const msg = (err && (err.message || err.toString())) || 'unknown error';
      process.stdout.write(`  ✗ ${description}\n`);
      process.stdout.write(`      ${msg.replace(/\n/g, '\n      ')}\n`);
    },
  };
  const check = makeChecker(report);

  try {
    await run({ check, events, toolCalls, workdir });
  } catch {
    // The check helper already printed the failing line; we just need
    // to short-circuit so subsequent dependent checks don't fire.
  }

  const total = stats.passed + stats.failed;
  process.stdout.write(`\n  ${stats.passed}/${total} checks passed\n`);
  if (stats.failed > 0) {
    process.stdout.write(`[FAIL] ${scenario}\n`);
    process.exit(1);
  }
  process.stdout.write(`[pass] ${scenario}\n`);
}

main().catch((err) => {
  process.stderr.write(`verify failed: ${err.stack || err.message || err}\n`);
  process.exit(1);
});
