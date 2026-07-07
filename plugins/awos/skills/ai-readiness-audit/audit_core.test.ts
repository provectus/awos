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
import { aggregate } from './audit_patch.ts';

// ---------------------------------------------------------------------------
// Task 2.1: aggregate re-derives applies from status
// ---------------------------------------------------------------------------

test('aggregate must include patched-PASS connector checks in the coverage denominator — coverage cannot exceed 100% (issue #12)', () => {
  const dir = tmpDir('awos-agg-');
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
  const tmpBase = tmpDir('awos-buildcheck-');
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
      score: 1,
      confidence: 1,
      expression: '31/50 growth',
    });

    const summary = await auditCore(
      repoPath,
      outDir,
      {},
      { test_metric: mockMetric },
      standardsPath
    );
    assert.equal(
      summary.lookback_days,
      730,
      'the summary must echo [meta].max_lookback_days — the orchestrator substitutes it into connector query recipes instead of hardcoding a day count'
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

  const tmpBase = tmpDir('awos-adpid-');
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
  const dir = tmpDir('awos-rnd-');
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
  const base = tmpDir('awos-skipreason-');
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
      readFileSync(join(outDir, 'delivery-flow.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rework = (dim.checks as any[]).find((c: any) =>
      Array.isArray(c.code) ? c.code.includes(1401) : c.code === 1401
    );
    assert.ok(rework, 'DF-06 (code 1401) must exist in delivery-flow');
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

import { compute as i1WorkMix } from './metrics/work_mix_allocation.ts';

test('enrich re-scores a connector metric from a populated collected/ dir without clobbering it', async () => {
  const { repoPath, outDir, base } = buildBareRepo();
  try {
    const registry = { work_mix_allocation: i1WorkMix };
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
  const dir = tmpDir('awos-agg-clamp-');
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
    writeStampedAudit(dir);
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
  const dir = tmpDir('awos-agg-reconcile-');
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
    writeStampedAudit(dir);
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
  const dir = tmpDir('awos-agg-fail-');
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
    writeStampedAudit(dir);
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
// patchJudgments: all verdicts in one call, self-aggregating
// ---------------------------------------------------------------------------

import { patchJudgments, type JudgmentPatch } from './audit_patch.ts';
import { tmpDir } from './tests/helpers.ts';

/** patchJudgments refuses a dir without an engine-stamped audit.json (provenance circuit-breaker) — stamp the fixture dir. */
function writeStampedAudit(dir: string): void {
  writeFileSync(
    join(dir, 'audit.json'),
    JSON.stringify({
      date: '2026-01-01',
      project: 'fixture',
      audit_total: 0,
      coverage: 0,
      dimensions: [],
      engine: { generated_by: 'audit-core' },
    })
  );
}

test('patchJudgments applies all verdicts in one call and re-aggregates audit.json', () => {
  const dir = tmpDir('awos-patchj-');
  try {
    const dim = {
      dimension: 'ai-development-tooling',
      date: '2026-01-01',
      score: 0,
      coverage: 0,
      checks: [
        makePatchableCheck({
          check_id: 'AI-01',
          status: 'PENDING_JUDGMENT',
          weight_max: 8,
        }),
        makePatchableCheck({
          check_id: 'AI-06',
          status: 'PENDING_JUDGMENT',
          weight_max: 4,
        }),
        makePatchableCheck({
          check_id: 'AI-02',
          method: 'detected',
          status: 'PASS',
          score: 1,
          weight_awarded: 5,
          weight_max: 5,
        }),
      ],
    };
    writeFileSync(
      join(dir, 'ai-development-tooling.json'),
      JSON.stringify(dim)
    );
    writeStampedAudit(dir);

    const summary = patchJudgments(dir, [
      {
        check_id: 'AI-01',
        status: 'PASS',
        score: 1,
        value: 'CLAUDE.md is strong',
        evidence: ['CLAUDE.md covers commands, architecture, conventions'],
      },
      { check_id: 'AI-06', status: 'WARN', score: 0.5 },
      { check_id: 'AI-02', status: 'FAIL' }, // detected — must be refused
      { check_id: 'NOPE-99', status: 'PASS' }, // unknown — must be reported
    ]);

    assert.deepEqual(
      summary.patched.sort(),
      ['AI-01', 'AI-06'],
      'exactly the judgment checks must be patched'
    );
    assert.ok(
      summary.warnings.some((w) => w.includes('AI-02')),
      'patching a non-judgment check must be refused with a warning'
    );
    assert.ok(
      summary.warnings.some((w) => w.includes('NOPE-99')),
      'an unknown check_id must be reported'
    );

    const updated = JSON.parse(
      readFileSync(join(dir, 'ai-development-tooling.json'), 'utf8')
    );
    const ai01 = updated.checks.find(
      (c: { check_id: string }) => c.check_id === 'AI-01'
    );
    assert.equal(ai01.status, 'PASS');
    assert.equal(ai01.weight_awarded, 8, 'PASS at score 1 awards full weight');
    assert.deepEqual(ai01.evidence, [
      'CLAUDE.md covers commands, architecture, conventions',
    ]);
    const ai02 = updated.checks.find(
      (c: { check_id: string }) => c.check_id === 'AI-02'
    );
    assert.equal(
      ai02.status,
      'PASS',
      'refused patch must leave the check untouched'
    );

    const audit = JSON.parse(readFileSync(join(dir, 'audit.json'), 'utf8'));
    assert.equal(
      audit.audit_total,
      15,
      'audit.json must be re-aggregated in the same call (8 + 2 + 5)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchJudgments rejects an invalid status with a warning — only PASS/WARN/FAIL/SKIP are legal verdicts', () => {
  const dir = tmpDir('awos-patchj-badstatus-');
  try {
    const dim = {
      dimension: 'ai-development-tooling',
      date: '2026-01-01',
      score: 0,
      coverage: 0,
      checks: [
        makePatchableCheck({
          check_id: 'AI-01',
          status: 'PENDING_JUDGMENT',
          weight_max: 8,
        }),
      ],
    };
    writeFileSync(
      join(dir, 'ai-development-tooling.json'),
      JSON.stringify(dim)
    );
    writeStampedAudit(dir);
    const summary = patchJudgments(dir, [
      { check_id: 'AI-01', status: 'PARTIAL' },
    ] as unknown as JudgmentPatch[]);
    assert.deepEqual(
      summary.patched,
      [],
      'a patch with an invalid status must not be applied'
    );
    assert.ok(
      summary.warnings.some(
        (w) => w.includes('AI-01') && w.includes('invalid status')
      ),
      `an invalid status must produce a warning naming the check and the problem, got ${JSON.stringify(summary.warnings)}`
    );
    const updated = JSON.parse(
      readFileSync(join(dir, 'ai-development-tooling.json'), 'utf8')
    );
    assert.equal(
      updated.checks[0].status,
      'PENDING_JUDGMENT',
      'the check must be left untouched when its patch carries an invalid status'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchJudgments clamps a weight passed as score', () => {
  const dir = tmpDir('awos-patchj-clamp-');
  try {
    const dim = {
      dimension: 'ai-development-tooling',
      date: '2026-01-01',
      score: 0,
      coverage: 0,
      checks: [
        makePatchableCheck({
          check_id: 'AI-01',
          status: 'PENDING_JUDGMENT',
          weight_max: 8,
        }),
      ],
    };
    writeFileSync(
      join(dir, 'ai-development-tooling.json'),
      JSON.stringify(dim)
    );
    writeStampedAudit(dir);
    const summary = patchJudgments(dir, [
      { check_id: 'AI-01', status: 'PASS', score: 8 },
    ]);
    assert.ok(
      summary.warnings.some((w) => w.includes('clamped')),
      'an out-of-range score must warn'
    );
    const updated = JSON.parse(
      readFileSync(join(dir, 'ai-development-tooling.json'), 'utf8')
    );
    assert.equal(
      updated.checks[0].weight_awarded,
      8,
      'weight_awarded must be capped at weight_max'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// aggregate: an explicit finite score is the score — a stored 0 stays 0
// ---------------------------------------------------------------------------

test('aggregate keeps an explicit score 0 on a WARN — a stored 0 is a measurement, not a missing score to re-inflate from the status default', () => {
  const dir = tmpDir('awos-agg-warn0-');
  try {
    // A legal judgment patch: {status: WARN, score: 0} (patchJudgments also
    // zeroes weight_awarded). The old `score > 0` guard treated the 0 as
    // absent and re-inflated to the WARN default (0.5 → weight 4).
    const dim = {
      dimension: 'ai-development-tooling',
      date: '2026-01-01',
      score: 0,
      coverage: 0,
      checks: [
        makePatchableCheck({ status: 'WARN', score: 0, weight_awarded: 0 }),
      ],
    };
    writeFileSync(
      join(dir, 'ai-development-tooling.json'),
      JSON.stringify(dim)
    );
    writeStampedAudit(dir);
    aggregate(dir);
    const check = JSON.parse(
      readFileSync(join(dir, 'ai-development-tooling.json'), 'utf8')
    ).checks[0];
    assert.equal(
      check.score,
      0,
      `an explicit score 0 must survive aggregate, got ${check.score}`
    );
    assert.equal(
      check.weight_awarded,
      0,
      `a WARN with explicit score 0 must award 0 weight, not the 0.5 status default — got ${check.weight_awarded}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Metric errors: a metric that can't run must SKIP its categories, not FAIL
// them. FAIL means "measured, absent"; SKIP means "couldn't measure".
// ---------------------------------------------------------------------------

function makeCustomStandardsFixture(categoryLines: string[]): {
  base: string;
  repoPath: string;
  outDir: string;
  standardsPath: string;
} {
  const base = tmpDir('awos-custom-std-');
  const repoPath = join(base, 'repo');
  mkdirSync(repoPath, { recursive: true });
  execSync('git init', { cwd: repoPath, stdio: 'ignore' });
  const outDir = join(base, 'out');
  mkdirSync(outDir, { recursive: true });
  const standardsPath = join(base, 'standards.toml');
  writeFileSync(
    standardsPath,
    ['[meta]', 'max_lookback_days = 90', '', ...categoryLines].join('\n')
  );
  return { base, repoPath, outDir, standardsPath };
}

const THROWING_CATEGORY = [
  '[category.throwing_cat]',
  'code = 998',
  'metric = "boom_metric"',
  'dimension = "ai-sdlc-adoption"',
  'weight = 5',
  'method = "computed"',
  'definition = "Backed by a broken metric"',
  'applies_when = "always"',
  'sources = ["git"]',
];

test('a metric that throws must SKIP its categories with a metric-error reason and confidence 0 — never a silent FAIL', async () => {
  const fx = makeCustomStandardsFixture(THROWING_CATEGORY);
  try {
    const boom = async (): Promise<never> => {
      throw new Error('artifact schema mismatch');
    };
    await auditCore(
      fx.repoPath,
      fx.outDir,
      {},
      { boom_metric: boom },
      fx.standardsPath
    );
    const dim = JSON.parse(
      readFileSync(join(fx.outDir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const check = (dim.checks as any[]).find((c: any) => c.code.includes(998));
    assert.equal(
      check.status,
      'SKIP',
      `a throwing metric means "couldn't measure" — its category must SKIP, got ${check.status}`
    );
    assert.equal(
      check.confidence,
      0,
      `a check the engine could not measure must carry confidence 0, got ${check.confidence}`
    );
    assert.equal(
      check.weight_awarded,
      0,
      'an unmeasured check must award no weight'
    );
    assert.match(
      String(check.evidence[0]),
      /^metric-error: .*artifact schema mismatch/,
      `the SKIP evidence must carry the metric-error reason, got ${JSON.stringify(check.evidence)}`
    );
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('a metric id that resolves to no function must SKIP its categories with an "unknown metric" reason — the old path was 100% silent and FAILed them', async () => {
  const fx = makeCustomStandardsFixture(THROWING_CATEGORY);
  try {
    // Empty registry: boom_metric is declared in standards.toml but unknown.
    await auditCore(fx.repoPath, fx.outDir, {}, {}, fx.standardsPath);
    const dim = JSON.parse(
      readFileSync(join(fx.outDir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const check = (dim.checks as any[]).find((c: any) => c.code.includes(998));
    assert.equal(
      check.status,
      'SKIP',
      `an unknown metric id must SKIP its category (couldn't measure), got ${check.status}`
    );
    assert.equal(
      check.confidence,
      0,
      `an unmeasured check must carry confidence 0, got ${check.confidence}`
    );
    assert.deepEqual(
      check.evidence,
      ['unknown metric: boom_metric'],
      `the SKIP evidence must name the unresolvable metric id, got ${JSON.stringify(check.evidence)}`
    );
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Coverage null: "no measurable surface" (applicable = 0) must render as null,
// not as 0% coverage.
// ---------------------------------------------------------------------------

test('audit-core emits coverage null (not 0) when a dimension has no applicable weight — at the dimension and audit level', async () => {
  const fx = makeCustomStandardsFixture([
    '[category.gated_cat]',
    'code = 997',
    'metric = "gated_metric"',
    'dimension = "ai-sdlc-adoption"',
    'weight = 5',
    'method = "computed"',
    'definition = "Needs a tracker"',
    'applies_when = "topology.has_tracker"',
    'sources = ["tracker"]',
  ]);
  try {
    // Bare repo, no tracker connector → the only category is gated off (SKIP)
    // → applicable weight is 0.
    await auditCore(fx.repoPath, fx.outDir, {}, {}, fx.standardsPath);
    const dim = JSON.parse(
      readFileSync(join(fx.outDir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    assert.strictEqual(
      dim.coverage,
      null,
      `dimension coverage must be null when nothing is applicable, got ${JSON.stringify(dim.coverage)}`
    );
    const audit = JSON.parse(
      readFileSync(join(fx.outDir, 'audit.json'), 'utf8')
    );
    assert.strictEqual(
      audit.coverage,
      null,
      `audit coverage must be null when nothing is applicable, got ${JSON.stringify(audit.coverage)}`
    );
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Reliability confidence vocabulary: audit-core must write the same
// 'HIGH'|'MED'|'LOW' tokens the metrics write (metrics/_base.ts Reliability),
// never lowercase 'medium'/'high'.
// ---------------------------------------------------------------------------

test("audit-core writes reliability confidence as 'MED' for judgment checks and 'HIGH' otherwise — the metrics' vocabulary, not lowercase variants", async () => {
  const fx = makeCustomStandardsFixture([
    '[category.judgment_cat]',
    'code = 996',
    'dimension = "ai-development-tooling"',
    'weight = 8',
    'method = "judgment"',
    'definition = "Needs the LLM"',
    'applies_when = "always"',
    'sources = ["audit"]',
    '',
    ...THROWING_CATEGORY,
  ]);
  try {
    await auditCore(fx.repoPath, fx.outDir, {}, {}, fx.standardsPath);
    const tooling = JSON.parse(
      readFileSync(join(fx.outDir, 'ai-development-tooling.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const judgment = (tooling.checks as any[]).find((c: any) =>
      c.code.includes(996)
    );
    assert.equal(
      judgment.reliability.confidence,
      'MED',
      `judgment checks must carry confidence 'MED' (metrics vocabulary), got ${JSON.stringify(judgment.reliability.confidence)}`
    );
    const adoption = JSON.parse(
      readFileSync(join(fx.outDir, 'ai-sdlc-adoption.json'), 'utf8')
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nonJudgment = (adoption.checks as any[]).find((c: any) =>
      c.code.includes(998)
    );
    assert.equal(
      nonJudgment.reliability.confidence,
      'HIGH',
      `non-judgment checks must carry confidence 'HIGH' (metrics vocabulary), got ${JSON.stringify(nonJudgment.reliability.confidence)}`
    );
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});
