#!/usr/bin/env node
// One eval run: one arm, one scratch copy, two headless sessions.
// Protocol is pre-registered in docs/2.0/c4-diagram-eval-plan.md — do not
// change behavior between arms or mid-campaign.
//
//   node tools/c4-evals/run-eval.mjs \
//     --arm B --run-index 4 --campaign 2026-10-20 \
//     --model claude-sonnet-x-y \
//     [--fixture tests/fixtures/eval-c4-multiservice] [--keep-scratch]
//
// Isolation: the scratch copy lives under $TMPDIR/c4-eval-runs/ (outside the
// repo; the installer runs from this checkout INTO the scratch, never inside
// this repo). Archives land in <repo>/tmp/c4-eval-runs/<campaign>/. No global
// configuration (marketplace, settings.json) is read or written.

'use strict';

import {
  cpSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTO_CONTINUE_TEXT = 'Proceed with your stated recommendation.';
const LOCK_PATH = join(tmpdir(), 'awos-c4-eval.lock');

function parseArgs(argv) {
  const args = {
    fixture: 'tests/fixtures/eval-c4-multiservice',
    keepScratch: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep-scratch') args.keepScratch = true;
    else if (a.startsWith('--'))
      args[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  for (const req of ['arm', 'runIndex', 'campaign', 'model']) {
    if (!args[req]) {
      console.error(
        `missing --${req.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`
      );
      process.exit(1);
    }
  }
  if (!['A', 'B', 'C'].includes(args.arm)) {
    console.error(`--arm must be A, B or C, got '${args.arm}'`);
    process.exit(1);
  }
  // The spec is a property of the fixture: derive it rather than defaulting,
  // so a fixture/spec mismatch cannot burn a session against a directory
  // that does not exist. --spec stays as an override for multi-spec fixtures.
  if (!args.spec) {
    const specRoot = resolve(
      REPO_ROOT,
      args.fixture,
      'project',
      'context',
      'spec'
    );
    const entries = existsSync(specRoot) ? readdirSync(specRoot) : [];
    if (entries.length !== 1) {
      console.error(
        `cannot derive --spec: ${specRoot} holds ${entries.length} entries (${entries.join(', ') || 'none'}); pass --spec explicitly`
      );
      process.exit(1);
    }
    args.spec = entries[0];
  }
  return args;
}

// --- machine-wide run lock (audit-harness pattern: stale pids taken over) ---
// Acquisition is atomic (flag 'wx'): a check-then-write race between two
// near-simultaneous launches would let both proceed, which is exactly what
// the lock exists to prevent.
function acquireLock(label) {
  const payload = JSON.stringify({
    pid: process.pid,
    label,
    startedAt: new Date().toISOString(),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(LOCK_PATH, payload, { flag: 'wx' });
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let holder = {};
      try {
        holder = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      } catch {
        // unreadable lock: treat as stale
      }
      let alive = Boolean(holder.pid);
      if (alive) {
        try {
          process.kill(holder.pid, 0);
        } catch {
          alive = false;
        }
      }
      if (alive) {
        console.error(
          `another eval run is live: pid ${holder.pid}, ${holder.label}, started ${holder.startedAt}`
        );
        process.exit(1);
      }
      rmSync(LOCK_PATH, { force: true });
    }
  }
  throw new Error('could not acquire run lock after stale takeover');
}

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
    ...opts,
  });
  if (res.error) throw res.error;
  return res;
}

// --- claude session --------------------------------------------------------
function lastAssistantNeedsAnswer(events) {
  const assistant = [...events].reverse().find((e) => e.type === 'assistant');
  const content = assistant?.message?.content;
  if (!Array.isArray(content)) return false;
  if (
    content.some((b) => b.type === 'tool_use' && b.name === 'AskUserQuestion')
  )
    return true;
  const lastText = [...content].reverse().find((b) => b.type === 'text');
  return Boolean(lastText && lastText.text.trim().endsWith('?'));
}

function claudeSession(prompt, { cwd, model, resumeId }) {
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--strict-mcp-config',
    '--dangerously-skip-permissions',
    '--model',
    model,
  ];
  if (resumeId) args.push('--resume', resumeId);
  const res = run('claude', args, { cwd });
  const events = res.stdout
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const sessionId = events.find((e) => e.session_id)?.session_id ?? null;
  return { raw: res.stdout, events, sessionId, status: res.status };
}

// Runs one command-session with the pre-registered single auto-continuation.
// A session that produced no real usage (auth failure, launch failure) must
// invalidate the run loudly, never be graded as if the model attempted it —
// observed 2026-10-14: overnight OAuth expiry yielded 4-second "runs" whose
// only output was an auth error, silently graded as 0-pass attempts.
function assertSessionValid(events, label) {
  const result = [...events].reverse().find((e) => e.type === 'result');
  const output = result?.usage?.output_tokens ?? 0;
  const text = String(result?.result ?? '');
  if (!result || output === 0 || /failed to authenticate/i.test(text)) {
    throw new Error(
      `${label} session invalid (no usage or auth failure): ${text.slice(0, 160) || 'no result event'}`
    );
  }
}

function runStage(prompt, { cwd, model }) {
  let { raw, events, sessionId } = claudeSession(prompt, { cwd, model });
  assertSessionValid(events, prompt.slice(0, 40));
  let autoContinuations = 0;
  let stalled = false;
  if (lastAssistantNeedsAnswer(events)) {
    autoContinuations = 1;
    const cont = claudeSession(AUTO_CONTINUE_TEXT, {
      cwd,
      model,
      resumeId: sessionId,
    });
    // The continuation is a session like any other: an auth-failed or empty
    // continuation must invalidate the run, not merge silently.
    assertSessionValid(cont.events, `${prompt.slice(0, 40)} (continuation)`);
    raw += cont.raw;
    events = events.concat(cont.events);
    if (lastAssistantNeedsAnswer(cont.events)) stalled = true;
  }
  return { raw, events, autoContinuations, stalled };
}

// --- fixture test execution ------------------------------------------------
// Anchored to the TAP/spec summary block lines ('# pass 9' / 'ℹ pass 9'):
// an unanchored match would grab 'pass 2' out of a test name or assertion
// diff that precedes the summary.
export function parseNodeTestSummary(output) {
  const grab = (name) => {
    const m = output.match(new RegExp(`^[#ℹ]\\s*${name}\\s+(\\d+)\\s*$`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  const pass = grab('pass');
  const fail = grab('fail');
  return { pass, fail, total: pass + fail };
}

function listFiles(root, base = root, acc = []) {
  for (const entry of readdirSync(root)) {
    if (entry === '.git' || entry === 'node_modules' || entry === 'var')
      continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) listFiles(full, base, acc);
    else acc.push(relative(base, full));
  }
  return acc;
}

// --- main ------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtureDir = resolve(REPO_ROOT, args.fixture);
  const label = `c4-eval ${args.campaign} run ${args.runIndex} arm ${args.arm}`;
  acquireLock(label);

  const scratch = join(
    tmpdir(),
    'c4-eval-runs',
    `${args.campaign}-run-${args.runIndex}-${args.arm}`
  );
  const archive = join(
    REPO_ROOT,
    'tmp',
    'c4-eval-runs',
    args.campaign,
    `run-${String(args.runIndex).padStart(3, '0')}-${args.arm}`
  );

  try {
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch, { recursive: true });
    // A re-run of the same run-index/arm must not inherit a previous
    // attempt's files (a stale metrics.json would survive a failed re-grade
    // and feed compare-arms a cross-attempt data point).
    rmSync(archive, { recursive: true, force: true });
    mkdirSync(archive, { recursive: true });
    cpSync(join(fixtureDir, 'project'), scratch, { recursive: true });

    // Arm swap: B and C overwrite the context documents; A is the fixture as-is.
    if (args.arm !== 'A') {
      const armDir = join(fixtureDir, 'arms', args.arm);
      copyFileSync(
        join(armDir, 'architecture.md'),
        join(scratch, 'context', 'product', 'architecture.md')
      );
      copyFileSync(
        join(armDir, 'technical-considerations.md'),
        join(
          scratch,
          'context',
          'spec',
          args.spec,
          'technical-considerations.md'
        )
      );
    }

    // Baseline commit so the post-run diff is exactly what the run did.
    run('git', ['init', '-q'], { cwd: scratch });
    run('git', ['add', '-A'], { cwd: scratch });
    run(
      'git',
      [
        '-c',
        'user.email=eval@local',
        '-c',
        'user.name=c4-eval',
        'commit',
        '-qm',
        'fixture baseline',
      ],
      { cwd: scratch }
    );

    // Install AWOS from THIS checkout into the scratch copy (never into this repo).
    const install = run('node', [join(REPO_ROOT, 'index.js')], {
      cwd: scratch,
    });
    if (install.status !== 0) {
      throw new Error(`installer failed in scratch:\n${install.stderr}`);
    }
    run('git', ['add', '-A'], { cwd: scratch });
    run(
      'git',
      [
        '-c',
        'user.email=eval@local',
        '-c',
        'user.name=c4-eval',
        'commit',
        '-qm',
        'awos installed',
      ],
      { cwd: scratch }
    );

    const startedAt = new Date().toISOString();
    const cliVersion = run('claude', ['--version']).stdout.trim();

    // Session 1: tasks. Session 2: implement, a genuinely fresh session.
    const tasks = runStage(
      `/awos:tasks for the spec in context/spec/${args.spec}/. Work non-interactively.`,
      { cwd: scratch, model: args.model }
    );
    // The human review step, simulated identically for every arm: implement
    // refuses a tasks.md still carrying the not-user-reviewed marker, and the
    // eval protocol has no human in the loop between the two sessions.
    const tasksMdLive = join(scratch, 'context', 'spec', args.spec, 'tasks.md');
    if (existsSync(tasksMdLive)) {
      writeFileSync(
        tasksMdLive,
        readFileSync(tasksMdLive, 'utf8').replace(
          /^<!-- not-user-reviewed -->\n?/,
          ''
        )
      );
    }

    const implement = tasks.stalled
      ? {
          raw: '',
          events: [],
          autoContinuations: 0,
          stalled: false,
          skipped: true,
        }
      : runStage(
          `/awos:implement for the spec in context/spec/${args.spec}/. Work non-interactively.`,
          { cwd: scratch, model: args.model }
        );

    // Post-run artifacts for the grader. node --test needs explicit files
    // (bare directory args fail on Node 24), and the diff must include the
    // run's new files, so stage everything before diffing against the
    // baseline commit.
    const testFiles = readdirSync(join(scratch, 'tests'))
      .filter((f) => f.endsWith('.test.js'))
      .map((f) => join('tests', f));
    const tests = run('node', ['--test', ...testFiles], { cwd: scratch });
    const testResults = parseNodeTestSummary(tests.stdout + tests.stderr);
    run('git', ['add', '-A'], { cwd: scratch });
    const diff = run('git', ['diff', '--cached'], { cwd: scratch }).stdout;
    const changed = run('git', ['diff', '--cached', '--name-status'], {
      cwd: scratch,
    }).stdout;

    writeFileSync(join(archive, 'transcript-tasks.jsonl'), tasks.raw);
    writeFileSync(join(archive, 'transcript-implement.jsonl'), implement.raw);
    writeFileSync(join(archive, 'diff.patch'), diff);
    writeFileSync(join(archive, 'changed-files.txt'), changed);
    const postrunFiles = listFiles(scratch);
    writeFileSync(join(archive, 'postrun-files.txt'), postrunFiles.join('\n'));
    // Concatenated post-run source text: the grader resolves endpoint-like
    // references against it. Without this file it falls back to diff.patch
    // and false-flags references to pre-existing fixture endpoints.
    writeFileSync(
      join(archive, 'postrun-sources.txt'),
      postrunFiles
        .filter((f) => /\.(js|mjs|cjs|json|md)$/.test(f))
        .map((f) => readFileSync(join(scratch, f), 'utf8'))
        .join('\n')
    );
    writeFileSync(
      join(archive, 'test-results.json'),
      JSON.stringify(testResults, null, 2)
    );
    writeFileSync(
      join(archive, 'test-output.txt'),
      tests.stdout + tests.stderr
    );
    const tasksMdPath = join(scratch, 'context', 'spec', args.spec, 'tasks.md');
    writeFileSync(
      join(archive, 'tasks.md'),
      existsSync(tasksMdPath) ? readFileSync(tasksMdPath, 'utf8') : ''
    );
    writeFileSync(
      join(archive, 'meta.json'),
      JSON.stringify(
        {
          arm: args.arm,
          runIndex: Number(args.runIndex),
          campaign: args.campaign,
          model: args.model,
          // The model the session actually ran, from the init event — the
          // pinned ID could in principle re-point between campaigns.
          resolvedModel:
            tasks.events.find((e) => e.type === 'system' && e.model)?.model ??
            null,
          cliVersion,
          startedAt,
          finishedAt: new Date().toISOString(),
          autoContinuations:
            tasks.autoContinuations + implement.autoContinuations,
          stalled: tasks.stalled || implement.stalled,
          implementSkipped: Boolean(implement.skipped),
        },
        null,
        2
      )
    );

    // Grade immediately so the archive is self-contained.
    const grade = run('node', [
      join(REPO_ROOT, 'tools', 'c4-evals', 'grade-run.mjs'),
      archive,
      fixtureDir,
    ]);
    if (grade.status !== 0)
      console.error(`grading failed (archive kept): ${grade.stderr}`);

    console.log(`archived: ${archive}`);
    console.log(
      `tests ${testResults.pass}/${testResults.total} pass, stalled=${tasks.stalled || implement.stalled}`
    );
  } finally {
    rmSync(LOCK_PATH, { force: true });
    if (!args.keepScratch) rmSync(scratch, { recursive: true, force: true });
  }
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main();
