#!/usr/bin/env node --import tsx
/**
 * compliance_smoke.ts — fast repeated headless compliance check for the
 * ai-readiness-audit SKILL.md.
 *
 * Purpose: after any SKILL.md edit, answer ONE question cheaply and N times —
 * "does a headless `claude -p` run stay on the rails?" — where "on the rails"
 * means: it runs the deterministic engine (audit-core), lets the engine write
 * every scoring artifact and report, patches judgments through patch-judgment,
 * and never stalls waiting for a user that isn't there.
 *
 * This is NOT the full harness (run_audit_test.ts): no token comparison, no
 * phase seeding, no retries, no salvage. Raw model behavior, tiny synthetic
 * fixture repo (audits in ~1-3 min), pass/fail per run plus a compliance rate.
 *
 * Usage:
 *   npm run audit:smoke                       # 3 runs, sonnet, worktree skill
 *   npm run audit:smoke -- --runs 5
 *   npm run audit:smoke -- --model haiku --runs 10
 *   npm run audit:smoke -- --no-deploy       # use whatever marketplace serves
 *   npm run audit:smoke -- --runs 5 --keep-going   # measure a rate, no fail-fast
 *
 * Fail-fast by default: the loop stops at the first failing run — a failure
 * means SKILL.md needs a fix, and repeating the run only buys the same
 * failure again at full price. Exit code: 0 when every executed run passes,
 * 1 otherwise.
 *
 * Verdict signals per run (all hard, all from artifacts + transcript):
 *   engine        audit-core Bash call seen AND audit.json exists
 *   provenance    audit.json carries engine.generated_by === "audit-core"
 *   judgments     no PENDING_JUDGMENT left (patch-judgment ran)
 *   rendered      report.md + report.html exist on disk
 *   no_handwork   no Write/Edit of reports or scoring JSONs, no python/node
 *                 inline-compute, no shell redirects into audit JSONs
 *   no_fanout     zero dimension-auditor Agent spawns
 *   no_stall      the run didn't end by asking the (absent) user a question
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import {
  assessEngineCompliance,
  awosMainCheckout,
  formatWallTime,
  isFile,
  isMainModule,
  locateOutDir,
  readJson,
  repointMarketplace,
  restoreMarketplace,
  runClaudeAudit,
  scanJudgmentsPatched,
  scriptRepoRoot,
  sha256,
  smokeSignalsFromTranscript,
} from './harness_lib.ts';
import type { MarketPaths } from './harness_lib.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const log = (m = '') => process.stderr.write(m + '\n');

// ---------------------------------------------------------------------------
// Tiny fixture repo — just enough surface for a real audit (TS sources, CI
// config, agent instructions, a few commits from two authors) while keeping
// the deterministic pass and the judgment slice small and fast.
// ---------------------------------------------------------------------------
function generateFixture(dir: string): void {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  const write = (rel: string, content: string) =>
    fs.writeFileSync(path.join(dir, rel), content);

  write(
    'package.json',
    JSON.stringify(
      {
        name: 'smoke-fixture',
        version: '1.0.0',
        private: true,
        scripts: { test: 'node --test tests/', build: 'tsc -p .' },
        devDependencies: { typescript: '^5.6.0' },
      },
      null,
      2
    ) + '\n'
  );
  write(
    'README.md',
    '# smoke-fixture\n\nTiny TypeScript service used as a fixture for audit smoke tests.\n\n## Usage\n\n```sh\nnpm test\nnpm run build\n```\n\n## Layout\n\n- `src/` — the service\n- `tests/` — node:test suites\n'
  );
  write(
    'CLAUDE.md',
    '# CLAUDE.md\n\nSmall TypeScript service. Run `npm test` before committing. Keep functions pure where possible.\n'
  );
  write(
    'src/util.ts',
    'export function clamp(n: number, lo: number, hi: number): number {\n  return Math.min(hi, Math.max(lo, n));\n}\n\nexport function sum(xs: number[]): number {\n  return xs.reduce((a, b) => a + b, 0);\n}\n'
  );
  write(
    'src/index.ts',
    "import { clamp, sum } from './util';\n\nexport function score(values: number[]): number {\n  if (values.length === 0) return 0;\n  return clamp(sum(values) / values.length, 0, 100);\n}\n"
  );
  write(
    'tests/util.test.ts',
    "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { clamp, sum } from '../src/util';\n\ntest('clamp bounds', () => {\n  assert.equal(clamp(5, 0, 3), 3);\n});\n\ntest('sum', () => {\n  assert.equal(sum([1, 2, 3]), 6);\n});\n"
  );
  write(
    '.github/workflows/ci.yml',
    'name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 22 }\n      - run: npm test\n'
  );
  write('.gitignore', 'node_modules/\ndist/\n');

  const git = (args: string[], author: [string, string]) =>
    execFileSync('git', args, {
      cwd: dir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author[0],
        GIT_AUTHOR_EMAIL: author[1],
        GIT_COMMITTER_NAME: author[0],
        GIT_COMMITTER_EMAIL: author[1],
      },
    });
  const dev1: [string, string] = ['Dev One', 'dev1@example.com'];
  const dev2: [string, string] = ['Dev Two', 'dev2@example.com'];
  git(['init', '-q'], dev1);
  git(['add', 'package.json', 'README.md', '.gitignore'], dev1);
  git(['commit', '-q', '-m', 'chore: scaffold project'], dev1);
  git(['add', 'src', 'tests'], dev2);
  git(['commit', '-q', '-m', 'feat: scoring service with tests'], dev2);
  git(['add', '.github', 'CLAUDE.md'], dev1);
  git(['commit', '-q', '-m', 'ci: add workflow and agent instructions'], dev1);
}

// ---------------------------------------------------------------------------
// One headless run: claude -p in the fixture, transcript to runLog.
// ---------------------------------------------------------------------------
async function headlessRun(
  cwd: string,
  model: string,
  runLog: string,
  quiet: boolean
): Promise<number> {
  const { rc } = await runClaudeAudit({
    cwd,
    flags: ['--strict-mcp-config', '--model', model],
    runLog,
    stdin: 'ignore',
    heartbeat: {
      mode: 'wall',
      tick: (elapsedMs) => {
        if (!quiet) log(`    … running (${formatWallTime(elapsedMs)})`);
      },
    },
  });
  return rc;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
interface RunVerdict {
  run: number;
  pass: boolean;
  reasons: string[];
  wall: string;
  signals: Record<string, unknown>;
}

function assessRun(
  fixture: string,
  runLog: string
): Omit<RunVerdict, 'run' | 'wall'> {
  const audits = path.join(fixture, 'context/audits');
  const today = new Date().toISOString().slice(0, 10);
  const outDir = locateOutDir(audits, today, null);
  // Read the (multi-MB) transcript once and feed both scanners.
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(runLog, 'utf8').split('\n');
  } catch {
    // no transcript — every transcript-based signal stays at defaults
  }
  const comp = assessEngineCompliance(outDir, lines);
  const smoke = smokeSignalsFromTranscript(lines);

  let provenance = false;
  if (outDir && isFile(path.join(outDir, 'audit.json'))) {
    try {
      provenance =
        readJson(path.join(outDir, 'audit.json'))?.engine?.generated_by ===
        'audit-core';
    } catch {
      provenance = false;
    }
  }
  const judgments = outDir ? scanJudgmentsPatched(outDir) : null;
  const rendered =
    !!outDir &&
    isFile(path.join(outDir, 'report.md')) &&
    isFile(path.join(outDir, 'report.html'));

  const reasons: string[] = [];
  if (!comp.engine_compliant) {
    reasons.push(
      `engine skipped (audit_core_calls=${comp.audit_core_calls}, has_audit_json=${comp.has_audit_json})`
    );
    if (!comp.has_audit_json && smoke.final_text_is_question) {
      reasons.push('stalled: run ended by asking the user a question');
    }
  }
  if (comp.engine_compliant && !provenance) {
    reasons.push('audit.json lacks the audit-core provenance stamp');
  }
  if (comp.fanout_agent_spawns > 0) {
    reasons.push(`per-dimension fan-out (${comp.fanout_agent_spawns} spawns)`);
  }
  if (judgments === false) reasons.push('PENDING_JUDGMENT left unpatched');
  if (comp.has_audit_json && !rendered) {
    reasons.push('report.md/report.html not rendered');
  }
  if (smoke.handwritten_report_writes > 0) {
    reasons.push(
      `model hand-wrote reports (${smoke.handwritten_report_writes} Write/Edit)`
    );
  }
  if (smoke.hand_json_writes > 0) {
    reasons.push(
      `model hand-wrote scoring JSON (${smoke.hand_json_writes} writes)`
    );
  }
  if (smoke.hand_compute_calls > 0) {
    reasons.push(
      `inline hand-compute (${smoke.hand_compute_calls}× python/node -e|-c)`
    );
  }
  return {
    pass: reasons.length === 0,
    reasons,
    signals: { ...comp, ...smoke, provenance, judgments, rendered, outDir },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      runs: { type: 'string', default: '3' },
      model: { type: 'string', default: 'sonnet' },
      worktree: { type: 'string' },
      label: { type: 'string', default: '' },
      quiet: { type: 'boolean', default: false },
      'no-deploy': { type: 'boolean', default: false },
      'keep-fixtures': { type: 'boolean', default: false },
      // Fail-fast is the default: a failing run means SKILL.md needs a fix,
      // and repeating the run just buys the same failure again at full price.
      // --keep-going exists only for deliberate compliance-rate measurement.
      'keep-going': { type: 'boolean', default: false },
    },
  });
  const runs = Math.max(1, parseInt(args.runs!, 10) || 3);
  const worktree = path.resolve(args.worktree ?? scriptRepoRoot(HERE));
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..*/, 'Z');
  const archive = path.join(
    awosMainCheckout(HERE),
    'tmp',
    'audit-runs',
    '_smoke',
    `${stamp}${args.label ? '__' + args.label.replace(/\s+/g, '-') : ''}`
  );
  fs.mkdirSync(archive, { recursive: true });

  let origMarket: MarketPaths | null = null;
  let deployedSha = '(marketplace as-is)';
  if (!args['no-deploy']) {
    [origMarket, deployedSha] = repointMarketplace(worktree);
  }
  const skillSha = sha256(
    path.join(worktree, 'plugins/awos/skills/ai-readiness-audit/SKILL.md')
  ).slice(0, 12);
  log(`▶ compliance smoke — ${runs} run(s), model=${args.model}`);
  log(`  SKILL.md ${skillSha}  archive ${archive}`);

  const verdicts: RunVerdict[] = [];
  try {
    for (let i = 1; i <= runs; i++) {
      const fixture = path.join(archive, `run${i}`, 'fixture');
      const runLog = path.join(archive, `run${i}`, 'run.jsonl');
      fs.mkdirSync(path.dirname(runLog), { recursive: true });
      generateFixture(fixture);
      log(`\n▶ run ${i}/${runs}`);
      const started = Date.now();
      const rc = await headlessRun(
        fixture,
        args.model!,
        runLog,
        Boolean(args.quiet)
      );
      const wall = formatWallTime(Date.now() - started);
      const v = { run: i, wall, ...assessRun(fixture, runLog) };
      verdicts.push(v);
      log(
        `  ${v.pass ? '✓ PASS' : '✗ FAIL'} (${wall}, claude rc=${rc})` +
          (v.reasons.length ? `\n    - ${v.reasons.join('\n    - ')}` : '')
      );
      // Keep the audit artifacts for inspection; drop the code fixture unless asked.
      if (!args['keep-fixtures']) {
        const keep = path.join(archive, `run${i}`, 'audit-output');
        const outDir = (v.signals.outDir as string) || '';
        if (outDir && fs.existsSync(outDir)) {
          fs.cpSync(outDir, keep, { recursive: true });
        }
        fs.rmSync(fixture, { recursive: true, force: true });
      }
      if (!v.pass && !args['keep-going']) {
        log(
          `  ↯ fail-fast: stopping after first failure (run ${i}/${runs}); fix SKILL.md, then rerun`
        );
        break;
      }
    }
  } finally {
    if (origMarket) restoreMarketplace(origMarket);
  }

  const passed = verdicts.filter((v) => v.pass).length;
  fs.writeFileSync(
    path.join(archive, 'smoke-meta.json'),
    JSON.stringify(
      {
        stamp,
        label: args.label,
        model: args.model,
        skill_sha256_12: skillSha,
        deployed: deployedSha,
        runs: verdicts,
        passed,
        executed: verdicts.length,
        requested: runs,
      },
      null,
      2
    )
  );
  log(`\n${'─'.repeat(60)}`);
  log(
    `compliance: ${passed}/${verdicts.length} runs passed` +
      (verdicts.length < runs ? ` (fail-fast; ${runs} requested)` : '') +
      ` — SKILL.md ${skillSha}`
  );
  for (const v of verdicts) {
    log(
      ` run${v.run}: ${v.pass ? 'PASS' : 'FAIL'}${v.reasons.length ? ' — ' + v.reasons.join('; ') : ''}`
    );
  }
  log(`meta: ${path.join(archive, 'smoke-meta.json')}`);
  if (passed !== verdicts.length) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
