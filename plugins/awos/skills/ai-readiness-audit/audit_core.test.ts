// audit_core.test.ts — unit tests for aggregate() in audit_core.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { aggregate } from './audit_core.ts';

// ---------------------------------------------------------------------------
// Task 2.1: aggregate re-derives applies from status
// ---------------------------------------------------------------------------

test('aggregate must include patched-PASS connector checks in the coverage denominator — coverage cannot exceed 100% (issue #12)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-agg-'));
  try {
    // Connector check: patched SKIP→PASS but applies still false (the bug).
    const connectorCheck = {
      check_id: 'ADP-01',
      code: [101],
      method: 'computed',
      status: 'PASS',
      value: 1,
      evidence: [],
      weight_awarded: 5,
      weight_max: 5,
      applies: false,
      reliability: { tag: 'not-reliable', confidence: 'HIGH', note: null },
      source: '',
      definition: '',
      hint: '',
      plain: '',
    };
    // Normal detected check: applies=true.
    const normalCheck = {
      check_id: 'ADP-02',
      code: [102],
      method: 'detected',
      status: 'PASS',
      value: true,
      evidence: [],
      weight_awarded: 5,
      weight_max: 5,
      applies: true,
      reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
      source: '',
      definition: '',
      hint: '',
      plain: '',
    };
    const dim = {
      dimension: 'ai-sdlc-adoption',
      date: '2026-01-01',
      score: 10,
      coverage: 2.0,
      checks: [connectorCheck, normalCheck],
    };
    writeFileSync(join(dir, 'ai-sdlc-adoption.json'), JSON.stringify(dim));

    aggregate(dir);

    const updated = JSON.parse(
      readFileSync(join(dir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    assert.ok(
      updated.coverage <= 1,
      `coverage must be ≤ 1 after aggregate, got ${updated.coverage}`
    );
    assert.equal(
      updated.coverage,
      1.0,
      `coverage must be 10/10=1.0 when patched-PASS check is counted in denominator, got ${updated.coverage}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Task 2.2: buildCheck must thread metric value+evidence through to the record
// ---------------------------------------------------------------------------

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { auditCore } from './audit_core.ts';

test('Metric-routed checks must carry the metric value+evidence into the record (issue #12 blank connector values)', async () => {
  const tmpBase = mkdtempSync(join(tmpdir(), 'awos-buildcheck-'));
  try {
    const repoPath = join(tmpBase, 'repo');
    mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath, stdio: 'ignore' });

    const outDir = join(tmpBase, 'out');
    mkdirSync(outDir, { recursive: true });

    const standardsPath = join(tmpBase, 'standards.toml');
    writeFileSync(
      standardsPath,
      [
        '[meta]',
        'monthly_bucket_days = 30',
        'max_lookback_days = 730',
        '',
        '[category.test_metric_cat]',
        'code = 999',
        'metric = "test_metric"',
        'dimension = "ai-sdlc-adoption"',
        'weight = 5',
        'method = "computed"',
        'definition = "Test metric"',
        'applies_when = "always"',
        'sources = ["git"]',
        'reliability_default = "not-reliable"',
        'source = "test"',
      ].join('\n')
    );

    const mockMetric = async () => ({
      metric: 'test_metric',
      value: 0.62,
      kind: 'computed',
      band: null as null,
      categories_awarded: [999],
      reliability: {
        tag: 'not-reliable',
        confidence: 'HIGH' as const,
        note: null,
      },
      sources_used: ['git'],
      sources_missing: [] as string[],
      status: 'OK' as const,
      expression: '31/50 growth',
    });

    await auditCore(
      repoPath,
      outDir,
      {},
      { test_metric: mockMetric },
      standardsPath
    );

    const dimJson = JSON.parse(
      readFileSync(join(outDir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const check = (dimJson.checks as any[]).find((c: any) =>
      Array.isArray(c.code) ? c.code.includes(999) : c.code === 999
    );
    assert.ok(
      check,
      'check with code 999 must exist in ai-sdlc-adoption dimension JSON'
    );
    assert.equal(
      check.value,
      0.62,
      `check.value must be 0.62 from metric result, got ${JSON.stringify(check.value)}`
    );
    assert.ok(
      Array.isArray(check.evidence) && check.evidence.length > 0,
      `check.evidence must be non-empty (from metric expression), got ${JSON.stringify(check.evidence)}`
    );
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Task 2.3: ai-sdlc-adoption checks must use short ADP-NN ids
// ---------------------------------------------------------------------------

import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('ai-sdlc-adoption checks must use short ADP-NN ids, not category slugs (issue #12)', async () => {
  const skillRoot = pathJoin(dirname(fileURLToPath(import.meta.url)), '.');
  const standardsPath = pathJoin(skillRoot, 'references', 'standards.toml');

  const tmpBase = mkdtempSync(join(tmpdir(), 'awos-adpid-'));
  try {
    const repoPath = join(tmpBase, 'repo');
    mkdirSync(repoPath, { recursive: true });
    // Create a CLAUDE.md to trigger ADP-01 (code 101)
    writeFileSync(
      join(repoPath, 'CLAUDE.md'),
      '# AI Instructions\nContext for AI'
    );
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

    const outDir = join(tmpBase, 'out');
    mkdirSync(outDir, { recursive: true });

    // Import detectors and metrics from the cli to get the full registry.
    // Use auditCore directly with an empty registry — we only care about
    // the check_id sourced from standards.toml for the metric-routed check
    // with code 101.
    await auditCore(repoPath, outDir, {}, {}, standardsPath);

    const dimJson = JSON.parse(
      readFileSync(join(outDir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const check101 = (dimJson.checks as any[]).find((c: any) =>
      Array.isArray(c.code) ? c.code.includes(101) : c.code === 101
    );
    assert.ok(check101, 'check with code 101 must exist');
    assert.equal(
      check101.check_id,
      'ADP-01',
      `ai-sdlc-adoption checks must use short ADP-NN ids, not category slugs (issue #12): got ${JSON.stringify(check101.check_id)}`
    );
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fix 1: float dust — dim.score and audit_total must be exactly 1 dp
// ---------------------------------------------------------------------------

test('aggregate must round dim.score and audit_total to 1 dp — no float dust (e.g. 2.1 + 0.8 must be 2.9, not 2.9000000000000004)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-rnd-'));
  try {
    // aggregate re-derives weight_awarded = round(weight_max * score * 10)/10.
    // We need: dim1 checks → 1.4 + 0.7 = 2.1, dim2 check → 0.8.
    // 2.1 + 0.8 = 2.9000000000000004 in IEEE 754 — the bug this test guards.
    // score=0.7, weight_max=2 → weight_awarded = round(2*0.7*10)/10 = 1.4
    // score=0.7, weight_max=1 → weight_awarded = round(1*0.7*10)/10 = 0.7
    // score=0.4, weight_max=2 → weight_awarded = round(2*0.4*10)/10 = 0.8
    const makeCheckFixture = (
      id: string,
      scoreVal: number,
      weightMax: number
    ) => ({
      check_id: id,
      code: [1],
      method: 'detected',
      status: 'PASS',
      value: true,
      evidence: [],
      weight_awarded: Math.round(weightMax * scoreVal * 10) / 10,
      weight_max: weightMax,
      applies: true,
      reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
      source: '',
      definition: '',
      hint: '',
      plain: '',
      score: scoreVal,
      confidence: 1,
      sources: [],
    });
    const dim1 = {
      dimension: 'dim-one',
      date: '2026-01-01',
      score: 2.1,
      coverage: 1,
      // A-01: 0.7*2=1.4, A-02: 0.7*1=0.7 → sum=2.1
      checks: [
        makeCheckFixture('A-01', 0.7, 2),
        makeCheckFixture('A-02', 0.7, 1),
      ],
    };
    const dim2 = {
      dimension: 'dim-two',
      date: '2026-01-01',
      score: 0.8,
      coverage: 1,
      // B-01: 0.4*2=0.8 → sum=0.8
      checks: [makeCheckFixture('B-01', 0.4, 2)],
    };
    writeFileSync(join(dir, 'dim-one.json'), JSON.stringify(dim1));
    writeFileSync(join(dir, 'dim-two.json'), JSON.stringify(dim2));

    aggregate(dir);

    const updatedDim1 = JSON.parse(
      readFileSync(join(dir, 'dim-one.json'), 'utf8')
    );
    const updatedDim2 = JSON.parse(
      readFileSync(join(dir, 'dim-two.json'), 'utf8')
    );
    const updatedAudit = JSON.parse(
      readFileSync(join(dir, 'audit.json'), 'utf8')
    );

    assert.strictEqual(
      updatedDim1.score,
      2.1,
      `dim-one.score must be exactly 2.1 (no float dust), got ${updatedDim1.score}`
    );
    assert.strictEqual(
      updatedDim2.score,
      0.8,
      `dim-two.score must be exactly 0.8 (no float dust), got ${updatedDim2.score}`
    );
    assert.strictEqual(
      updatedAudit.audit_total,
      2.9,
      `audit_total must be exactly 2.9, not ${updatedAudit.audit_total} — float dust from 2.1+0.8 must be rounded away`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// R4: every SKIP check must carry a human-readable reason in `evidence`.
// R5: a category `summary` becomes the inline lead (`plain`); `definition`
//     stays verbose (for the tooltip).
// ---------------------------------------------------------------------------

function buildBareRepo(): { repoPath: string; outDir: string; base: string } {
  const base = mkdtempSync(join(tmpdir(), 'awos-skipreason-'));
  const repoPath = join(base, 'repo');
  mkdirSync(repoPath, { recursive: true });
  execSync('git init && git add . && git commit -m init --allow-empty', {
    cwd: repoPath,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@t.co',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@t.co',
    },
  });
  const outDir = join(base, 'out');
  mkdirSync(outDir, { recursive: true });
  return { repoPath, outDir, base };
}

const standardsPathForSkip = pathJoin(
  dirname(fileURLToPath(import.meta.url)),
  'references',
  'standards.toml'
);

test('every SKIP check carries a reason in evidence — never a bare "—" (R4)', async () => {
  const { repoPath, outDir, base } = buildBareRepo();
  try {
    // Empty registries: connector/topology-gated categories (no CI/docs/tracker
    // on a bare repo) resolve to SKIP.
    await auditCore(repoPath, outDir, {}, {}, standardsPathForSkip);

    const files = readdirSync(outDir).filter(
      (f) => f.endsWith('.json') && f !== 'audit.json'
    );
    const skips: { file: string; id: string; evidence: unknown }[] = [];
    for (const f of files) {
      const dim = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (dim.checks ?? []) as any[]) {
        if (c.status === 'SKIP')
          skips.push({ file: f, id: c.check_id, evidence: c.evidence });
      }
    }
    assert.ok(
      skips.length > 0,
      'a bare repo should produce at least one SKIP (CI/tracker/docs-gated categories)'
    );
    for (const s of skips) {
      assert.ok(
        Array.isArray(s.evidence) &&
          s.evidence.length > 0 &&
          String(s.evidence[0]).trim().length > 0,
        `SKIP check ${s.id} (${s.file}) must carry a human-readable reason in evidence, got ${JSON.stringify(s.evidence)}`
      );
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a category summary becomes the inline lead (plain); definition stays verbose (R5)', async () => {
  const { repoPath, outDir, base } = buildBareRepo();
  try {
    await auditCore(repoPath, outDir, {}, {}, standardsPathForSkip);
    const dim = JSON.parse(
      readFileSync(join(outDir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rework = (dim.checks as any[]).find((c: any) =>
      Array.isArray(c.code) ? c.code.includes(1401) : c.code === 1401
    );
    assert.ok(rework, 'ADP-24 (code 1401) must exist');
    assert.equal(
      rework.plain,
      'DORA deployment rework rate: share of deploys that are unplanned bug-fix work.',
      `check.plain must be the concise summary, got ${JSON.stringify(rework.plain)}`
    );
    assert.ok(
      String(rework.definition).includes('fix/bugfix/hotfix'),
      'the verbose definition must be retained (it feeds the tooltip)'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Part 1 #1: `enrich` re-scores connector metrics from an already-populated
// collected/ dir in one pass (auditCore with collectedDirOverride), replacing
// the old per-metric `node metric <id>` spawns. It must NOT overwrite the
// connector artifacts, and it must flip the gated check from SKIP to scored.
// ---------------------------------------------------------------------------

import { compute as i1WorkMix } from './metrics/adp_i1_work_mix.ts';

test('enrich re-scores a connector metric from a populated collected/ dir without clobbering it', async () => {
  const { repoPath, outDir, base } = buildBareRepo();
  try {
    const registry = { adp_i1_work_mix: i1WorkMix };
    // Baseline: no tracker connector → adp_i1 (code 1101) is gated off → SKIP.
    await auditCore(repoPath, outDir, {}, registry, standardsPathForSkip);
    const readI1 = () => {
      const dim = JSON.parse(
        readFileSync(join(outDir, 'ai-sdlc-adoption.json'), 'utf8')
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (dim.checks as any[]).find((c: any) =>
        Array.isArray(c.code) ? c.code.includes(1101) : c.code === 1101
      );
    };
    assert.equal(
      readI1().status,
      'SKIP',
      'baseline: the tracker check SKIPs without a connector'
    );

    // Orchestrator writes an available tracker connector artifact.
    writeFileSync(
      join(outDir, 'collected', 'tracker.json'),
      JSON.stringify({
        source: 'tracker',
        available: true,
        period: { lookback_days: 180, source_label: 'Jira via MCP' },
        tickets: [],
        type_counts: { feature: 10, story: 5 },
        resolved_count: 8,
        incident_source: null,
      })
    );

    // enrich = auditCore re-score against the populated collected/ (override).
    await auditCore(
      repoPath,
      outDir,
      {},
      registry,
      standardsPathForSkip,
      join(outDir, 'collected')
    );

    assert.notEqual(
      readI1().status,
      'SKIP',
      'after enrich the tracker check must be scored (topology.has_tracker flips true), not SKIP'
    );
    const tracker = JSON.parse(
      readFileSync(join(outDir, 'collected', 'tracker.json'), 'utf8')
    );
    assert.equal(
      tracker.available,
      true,
      'enrich must reuse (not overwrite) the connector artifact — available stays true'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('render --format both writes report.md + report.html in one invocation', () => {
  const { repoPath, outDir, base } = buildBareRepo();
  try {
    execSync(
      `node "${pathJoin(dirname(fileURLToPath(import.meta.url)), 'dist', 'cli.js')}" audit-core "${repoPath}" "${outDir}"`,
      { stdio: 'ignore' }
    );
    const cli = pathJoin(
      dirname(fileURLToPath(import.meta.url)),
      'dist',
      'cli.js'
    );
    execSync(
      `node "${cli}" render "${join(outDir, 'audit.json')}" --format both --out-dir "${outDir}"`,
      { stdio: 'ignore' }
    );
    assert.ok(
      readFileSync(join(outDir, 'report.md'), 'utf8').length > 0,
      'render --format both must write report.md'
    );
    assert.ok(
      readFileSync(join(outDir, 'report.html'), 'utf8').includes('<html'),
      'render --format both must write report.html'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// B4: aggregate clamps out-of-range patched scores and reconciles score/status
// ---------------------------------------------------------------------------

function makePatchableCheck(overrides: Record<string, unknown>) {
  return {
    check_id: 'AI-01',
    code: [3001],
    method: 'judgment',
    status: 'PASS',
    value: null,
    evidence: [],
    weight_awarded: 0,
    weight_max: 8,
    applies: true,
    reliability: { tag: 'maximal', confidence: 'medium', note: null },
    source: '',
    definition: '',
    hint: '',
    plain: '',
    score: 0,
    confidence: 1,
    ...overrides,
  };
}

test('aggregate clamps a patched score > 1 — a raw weight written into score cannot inflate the total (B4)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-agg-clamp-'));
  try {
    // Observed live: the orchestrator patched score=8 (the weight) instead of a
    // 0–1 fraction, producing weight_awarded 64/8.
    const dim = {
      dimension: 'ai-development-tooling',
      date: '2026-01-01',
      score: 0,
      coverage: 0,
      checks: [makePatchableCheck({ score: 8 })],
    };
    writeFileSync(
      join(dir, 'ai-development-tooling.json'),
      JSON.stringify(dim)
    );
    aggregate(dir);
    const updated = JSON.parse(
      readFileSync(join(dir, 'ai-development-tooling.json'), 'utf8')
    );
    const check = updated.checks[0];
    assert.equal(
      check.weight_awarded,
      8,
      `weight_awarded must be clamped to weight_max (8), got ${check.weight_awarded}`
    );
    assert.equal(
      check.score,
      1,
      `score must be written back clamped to [0,1], got ${check.score}`
    );
    assert.equal(
      updated.score,
      8,
      `dimension score must not exceed applicable weight, got ${updated.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('aggregate reconciles a status-only patch (PASS with score left at 0) instead of zeroing the credit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-agg-reconcile-'));
  try {
    // Orchestrator set status/weight_awarded but never touched score.
    const dim = {
      dimension: 'ai-development-tooling',
      date: '2026-01-01',
      score: 0,
      coverage: 0,
      checks: [makePatchableCheck({ score: 0, weight_awarded: 8 })],
    };
    writeFileSync(
      join(dir, 'ai-development-tooling.json'),
      JSON.stringify(dim)
    );
    aggregate(dir);
    const check = JSON.parse(
      readFileSync(join(dir, 'ai-development-tooling.json'), 'utf8')
    ).checks[0];
    assert.equal(
      check.weight_awarded,
      8,
      `a PASS patch without a score must keep its awarded weight, got ${check.weight_awarded}`
    );
    assert.equal(
      check.score,
      1,
      `score must be reconciled with the PASS status, got ${check.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('aggregate zeroes stale credit on a FAIL — weight_awarded cannot survive a failing status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-agg-fail-'));
  try {
    const dim = {
      dimension: 'ai-development-tooling',
      date: '2026-01-01',
      score: 0,
      coverage: 0,
      checks: [
        makePatchableCheck({ status: 'FAIL', score: 0, weight_awarded: 8 }),
      ],
    };
    writeFileSync(
      join(dir, 'ai-development-tooling.json'),
      JSON.stringify(dim)
    );
    aggregate(dir);
    const check = JSON.parse(
      readFileSync(join(dir, 'ai-development-tooling.json'), 'utf8')
    ).checks[0];
    assert.equal(
      check.weight_awarded,
      0,
      `a FAIL check must carry zero awarded weight, got ${check.weight_awarded}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// parseCheckIds: heading prefixes may contain digits (E2E-01, E2ED-01)
// ---------------------------------------------------------------------------

import { parseCheckIds } from './audit_core.ts';

test('parseCheckIds maps digit-containing check-id prefixes (E2E-01) — not just pure-letter ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-checkids-'));
  try {
    writeFileSync(
      join(dir, 'end-to-end-delivery.md'),
      '# E2ED\n\n### E2E-01: Cross-layer branches\n\n- **Category:** 2300\n\n### SEC-01: Env files\n\n- **Category:** 2600\n'
    );
    const map = parseCheckIds(dir);
    assert.equal(
      map.get(2300),
      'E2E-01',
      `code 2300 must map to E2E-01 (digit-containing prefix), got ${map.get(2300)}`
    );
    assert.equal(
      map.get(2600),
      'SEC-01',
      `plain-letter prefixes must keep working, got ${map.get(2600)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
