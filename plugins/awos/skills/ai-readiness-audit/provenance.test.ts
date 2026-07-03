/**
 * provenance.test.ts — regression tests for the engine-provenance
 * circuit-breaker (barley engine-skip regression, 2026-07-03).
 *
 * A headless orchestrator run skipped `audit-core` entirely and hand-computed
 * the whole audit (70 Bash calls, ~45 min, ~3× cost), justifying the skip by
 * citing a load-time pre-run that never executed. The prompt-side fix removes
 * that narrative from SKILL.md; the engine-side circuit-breaker tested here
 * makes the skip impossible to complete: only `audit-core` stamps
 * `audit.json` with `engine.generated_by`, and `patch-judgment` / `render`
 * (single-repo) / `rollup` (per-repo) refuse audits without the stamp.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { auditCore, hasEngineProvenance } from './audit_core.ts';
import { aggregate } from './audit_patch.ts';

const SKILL = dirname(fileURLToPath(import.meta.url));
const CLI = join(SKILL, 'dist', 'cli.js');
const NODE = process.env.NODE_BIN || process.execPath;
const STANDARDS = join(SKILL, 'references', 'standards.toml');

function runCli(args: string[]): {
  stdout: string;
  stderr: string;
  code: number;
} {
  const r = spawnSync(NODE, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    code: r.status ?? 1,
  };
}

/** A structurally valid single-repo audit.json WITHOUT the engine stamp — what a hand-assembling orchestrator would produce. */
function handBuiltAudit(): Record<string, unknown> {
  return {
    date: '2026-07-03',
    project: 'hand-built',
    audit_total: 285.4,
    coverage: 0.68,
    dimensions: [],
  };
}

test('render refuses a single-repo audit.json without engine provenance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-prov-render-'));
  try {
    const auditPath = join(dir, 'audit.json');
    writeFileSync(auditPath, JSON.stringify(handBuiltAudit()));
    const r = runCli([
      'render',
      auditPath,
      '--format',
      'both',
      '--out-dir',
      dir,
    ]);
    assert.notEqual(
      r.code,
      0,
      'render must exit non-zero on a hand-assembled (unstamped) audit.json'
    );
    assert.ok(
      r.stdout.includes('provenance') && r.stdout.includes('audit-core'),
      `render error must name the missing provenance and point at audit-core; got ${r.stdout}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render still accepts an orchestrator-assembled org portfolio JSON (exempt from the stamp)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-prov-org-'));
  try {
    const orgPath = join(dir, 'org-portfolio.json');
    writeFileSync(
      orgPath,
      JSON.stringify({
        ...handBuiltAudit(),
        project: 'acme portfolio',
        portfolio_metrics: [],
        per_repo: [],
      })
    );
    const r = runCli(['render', orgPath, '--format', 'both', '--out-dir', dir]);
    assert.equal(
      r.code,
      0,
      `org-portfolio.json is legitimately assembled by the orchestrator from rollup output and must render without a stamp; got ${r.stdout} ${r.stderr}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patch-judgment refuses an audits dir whose audit.json is missing or unstamped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-prov-patchj-'));
  try {
    const patches = join(dir, 'judgments.json');
    writeFileSync(
      patches,
      JSON.stringify([{ check_id: 'SDD-03', status: 'PASS' }])
    );
    // Missing audit.json entirely.
    let r = runCli(['patch-judgment', dir, patches]);
    assert.notEqual(
      r.code,
      0,
      'patch-judgment must exit non-zero when audit.json is absent'
    );
    // Present but hand-assembled (no stamp).
    writeFileSync(join(dir, 'audit.json'), JSON.stringify(handBuiltAudit()));
    r = runCli(['patch-judgment', dir, patches]);
    assert.notEqual(
      r.code,
      0,
      'patch-judgment must exit non-zero on an unstamped audit.json'
    );
    assert.ok(
      r.stderr.includes('provenance') && r.stderr.includes('audit-core'),
      `patch-judgment error must name the missing provenance and point at audit-core; got ${r.stderr}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollup skips a per-repo audit.json without engine provenance, naming the reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-prov-rollup-'));
  try {
    const repoDir = join(dir, 'hand-built-repo');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'audit.json'),
      JSON.stringify(handBuiltAudit())
    );
    const r = runCli(['rollup', dir]);
    assert.ok(
      r.stderr.includes('lacks engine provenance'),
      `rollup must say the unstamped repo was skipped for missing provenance; got ${r.stderr}`
    );
    assert.ok(
      !r.stdout.includes('hand-built-repo'),
      'the unstamped repo must not appear in the rollup output'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('audit-core stamps audit.json + dimension JSONs; aggregate preserves and re-derives the stamp', async () => {
  const base = mkdtempSync(join(tmpdir(), 'awos-prov-core-'));
  try {
    const repoPath = join(base, 'repo');
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, 'CLAUDE.md'), '# AI instructions\n');
    execSync(
      'git init && git add . && git commit -m "init" --allow-empty-message',
      {
        cwd: repoPath,
        stdio: 'ignore',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        },
      }
    );
    const outDir = join(base, 'out');
    mkdirSync(outDir, { recursive: true });
    await auditCore(repoPath, outDir, {}, {}, STANDARDS);

    const audit = JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf8'));
    assert.ok(
      hasEngineProvenance(audit),
      'audit-core must stamp audit.json with engine.generated_by = "audit-core"'
    );

    // aggregate (normal flow: prior audit.json present) keeps the stamp.
    aggregate(outDir);
    const reAgg = JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf8'));
    assert.ok(
      hasEngineProvenance(reAgg),
      'aggregate must preserve the engine stamp from the prior audit.json'
    );

    // Repair flow: audit.json deleted — the stamp re-derives from the
    // engine-stamped per-dimension artifacts, so the repaired audit renders.
    rmSync(join(outDir, 'audit.json'));
    aggregate(outDir);
    const repaired = JSON.parse(
      readFileSync(join(outDir, 'audit.json'), 'utf8')
    );
    assert.ok(
      hasEngineProvenance(repaired),
      'aggregate must re-derive the stamp when every per-dimension artifact is engine-stamped'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
