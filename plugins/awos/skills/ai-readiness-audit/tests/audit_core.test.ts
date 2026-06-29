/**
 * audit_core.test.ts — tests that audit-core writes a sources[] block into audit.json
 * and that aggregate() preserves an existing sources block when collected/ is absent.
 * Also verifies the Phase 3a Correction 3 weight_awarded re-derivation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditCore, aggregate } from '../audit_core.ts';

const SKILL_ROOT = new URL('..', import.meta.url).pathname;
const STANDARDS_PATH = join(SKILL_ROOT, 'references', 'standards.toml');

test('audit-core output audit.json contains sources array', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'audit-core-test-'));
  const repoPath = SKILL_ROOT; // audit the skill itself — git is always available

  await auditCore(repoPath, outDir, {}, {}, STANDARDS_PATH);

  const auditJson = JSON.parse(
    readFileSync(join(outDir, 'audit.json'), 'utf8')
  );
  assert.ok(
    Array.isArray(auditJson.sources),
    'audit.json must have a sources array'
  );

  const gitSource = auditJson.sources.find(
    (s: { source: string }) => s.source === 'git'
  );
  assert.ok(gitSource, 'sources must include a git entry');
  assert.strictEqual(gitSource.available, true, 'git source must be available');

  const ciSource = auditJson.sources.find(
    (s: { source: string }) => s.source === 'ci'
  );
  assert.ok(ciSource, 'sources must include a ci entry');
  assert.ok(
    typeof ciSource.available === 'boolean',
    'ci.available must be boolean'
  );
  if (!ciSource.available) {
    assert.ok(
      typeof ciSource.reason_if_absent === 'string',
      'reason_if_absent must be string when unavailable'
    );
  }
});

test('aggregate preserves existing sources block when collected/ is absent', () => {
  // Regression test for: aggregate silently dropped sources when collected/ was missing.
  // The fix: if derivedSources is empty, fall back to existing.sources.
  const outDir = mkdtempSync(join(tmpdir(), 'aggregate-sources-test-'));

  // Write a minimal dimension JSON so aggregate has something to process.
  const dimJson = {
    dimension: 'code-quality',
    date: '2025-01-01',
    score: 2,
    coverage: 0.5,
    checks: [
      {
        code: 1,
        applies: true,
        status: 'PASS',
        weight_max: 4,
        weight_awarded: 2,
        check_id: 'CQ-01',
        label: 'dummy',
        method: 'detected',
        sources_reachable: ['git'],
        has_ai_tooling: false,
      },
    ],
  };
  writeFileSync(
    join(outDir, 'code-quality.json'),
    JSON.stringify(dimJson, null, 2)
  );

  // Write a prior audit.json that already has sources + authored report blocks.
  const priorSources = [
    {
      source: 'git',
      available: true,
      reason_if_absent: null,
      history_available_days: 365,
    },
    {
      source: 'ci',
      available: false,
      reason_if_absent: 'no CI config found',
      history_available_days: null,
    },
  ];
  const priorAudit = {
    date: '2025-01-01',
    project: 'test-repo',
    audit_total: 2,
    coverage: 0.5,
    dimensions: [],
    sources: priorSources,
    headline: { summary: 'test headline' },
    insights: [{ id: 1, text: 'insight' }],
    recommendations: [{ id: 1, title: 'fix this' }],
  };
  writeFileSync(
    join(outDir, 'audit.json'),
    JSON.stringify(priorAudit, null, 2)
  );

  // NOTE: no collected/ directory — this is the trigger for the bug.
  // Before the fix, aggregate returned an audit.json with no sources key.
  aggregate(outDir);

  const result = JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf8'));

  assert.ok(
    Array.isArray(result.sources),
    'aggregate must preserve the existing sources block when collected/ is absent'
  );
  assert.equal(
    result.sources.length,
    priorSources.length,
    'preserved sources must have the same length as the prior value'
  );
  assert.equal(
    result.sources[0].source,
    'git',
    'first preserved source must be git'
  );

  // Authored report blocks must also be preserved (pre-existing contract).
  assert.ok(
    result.headline !== undefined,
    'aggregate must preserve headline block'
  );
  assert.ok(
    Array.isArray(result.insights),
    'aggregate must preserve insights block'
  );
  assert.ok(
    Array.isArray(result.recommendations),
    'aggregate must preserve recommendations block'
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: weight-leak guard — FAIL code's weight_awarded must be 0 even when
// the metric ran and an awarded code carries a continuous score.
// ---------------------------------------------------------------------------

test('aggregate: two-code metric — awarded code gets weight_max×score, non-awarded code gets 0', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'aggregate-leak-test-'));

  // Simulates adp_g13_doc_coverage: two codes (2204, 2205) in the same metric.
  // Code 2204 awarded (PARTIAL, score=0.7 → weight_awarded = round(2×0.7,1) = 1.4)
  // Code 2205 NOT awarded (FAIL, score=0 → weight_awarded = 0), even though the metric ran.
  const dimJson = {
    dimension: 'documentation',
    date: '2025-01-01',
    score: 0,
    coverage: 0,
    checks: [
      {
        check_id: 'DOC-05',
        code: [2204],
        method: 'computed',
        status: 'PARTIAL',
        value: 0.7,
        evidence: [],
        weight_awarded: 0,
        weight_max: 2,
        score: 0.7,
        confidence: 0.9,
        applies: true,
        reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
      },
      {
        check_id: 'DOC-06',
        code: [2205],
        method: 'computed',
        status: 'FAIL',
        value: 0.4,
        evidence: [],
        weight_awarded: 99,
        weight_max: 1,
        score: 0,
        confidence: 0.9,
        applies: true,
        reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
      },
    ],
  };
  writeFileSync(
    join(outDir, 'documentation.json'),
    JSON.stringify(dimJson, null, 2)
  );

  aggregate(outDir);

  const updated = JSON.parse(
    readFileSync(join(outDir, 'documentation.json'), 'utf8')
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checks = updated.checks as any[];
  const awarded = checks.find((c: any) => c.check_id === 'DOC-05');
  const notAwarded = checks.find((c: any) => c.check_id === 'DOC-06');

  assert.equal(
    awarded.weight_awarded,
    1.4,
    `awarded code (score=0.7, weight_max=2) must yield weight_awarded=1.4, got ${awarded.weight_awarded}`
  );
  assert.equal(
    notAwarded.weight_awarded,
    0,
    `non-awarded code (score=0, weight_max=1) must yield weight_awarded=0, not ${notAwarded.weight_awarded} — weight-leak must be closed`
  );

  // Dimension total = 1.4 + 0 = 1.4
  assert.equal(
    updated.score,
    1.4,
    `dimension score must be 1.4 (only awarded code contributes), got ${updated.score}`
  );
});

// ---------------------------------------------------------------------------
// Phase 3a / Correction 3: aggregate re-derives weight_awarded from score
// ---------------------------------------------------------------------------

test('aggregate re-derives weight_awarded = round(weight_max × score, 1) for score=1, score=0.5, score=0', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'aggregate-weight-test-'));

  // Three checks with explicit score values covering the three cases.
  const dimJson = {
    dimension: 'code-quality',
    date: '2025-01-01',
    score: 0,
    coverage: 0,
    checks: [
      {
        // FULL: explicit score=1 on a PASS check → weight_awarded must be weight_max
        check_id: 'CQ-01',
        code: [1],
        method: 'detected',
        status: 'PASS',
        value: true,
        evidence: [],
        weight_awarded: 0, // wrong initial value — aggregate must fix it
        weight_max: 6,
        score: 1,
        confidence: 1,
        applies: true,
        reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
      },
      {
        // HALF: explicit score=0.5 on a PARTIAL check → weight_awarded = round(6×0.5,1) = 3.0
        check_id: 'CQ-02',
        code: [2],
        method: 'computed',
        status: 'PARTIAL',
        value: 0.5,
        evidence: [],
        weight_awarded: 0, // wrong — must become 3.0
        weight_max: 6,
        score: 0.5,
        confidence: 1,
        applies: true,
        reliability: { tag: 'not-reliable', confidence: 'LOW', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
      },
      {
        // ZERO: explicit score=0 on a FAIL check → weight_awarded = 0
        check_id: 'CQ-03',
        code: [3],
        method: 'detected',
        status: 'FAIL',
        value: false,
        evidence: [],
        weight_awarded: 99, // wrong — must become 0
        weight_max: 4,
        score: 0,
        confidence: 1,
        applies: true,
        reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
      },
    ],
  };
  writeFileSync(
    join(outDir, 'code-quality.json'),
    JSON.stringify(dimJson, null, 2)
  );

  aggregate(outDir);

  const updated = JSON.parse(
    readFileSync(join(outDir, 'code-quality.json'), 'utf8')
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checks = updated.checks as any[];

  const full = checks.find((c: any) => c.check_id === 'CQ-01');
  const half = checks.find((c: any) => c.check_id === 'CQ-02');
  const zero = checks.find((c: any) => c.check_id === 'CQ-03');

  assert.equal(
    full.weight_awarded,
    6,
    `score=1 × weight_max=6 must yield weight_awarded=6, got ${full.weight_awarded}`
  );
  assert.equal(
    half.weight_awarded,
    3,
    `score=0.5 × weight_max=6 must yield weight_awarded=3.0, got ${half.weight_awarded}`
  );
  assert.equal(
    zero.weight_awarded,
    0,
    `score=0 × weight_max=4 must yield weight_awarded=0, got ${zero.weight_awarded}`
  );

  // Dimension score must also reflect re-derived values: 6 + 3 + 0 = 9
  assert.equal(
    updated.score,
    9,
    `dimension score must be sum of re-derived weight_awarded (6+3+0=9), got ${updated.score}`
  );
});

// ---------------------------------------------------------------------------
// Phase 5: sources_used per dimension + source_windows in audit.json
// ---------------------------------------------------------------------------

test("aggregate: sources_used is the sorted union of applicable checks' sources per dimension, and audit.source_windows is built from collected/ period blocks", () => {
  const outDir = mkdtempSync(join(tmpdir(), 'aggregate-sources-used-test-'));
  const collectedDir = join(outDir, 'collected');

  // Dimension A: git + tracker checks (one SKIP check with scale should be excluded)
  const dimA = {
    dimension: 'ai-sdlc-adoption',
    date: '2025-01-01',
    score: 0,
    coverage: 0,
    checks: [
      {
        check_id: 'AI-01',
        code: [101],
        method: 'detected',
        status: 'PASS',
        value: true,
        evidence: [],
        weight_awarded: 5,
        weight_max: 5,
        score: 1,
        confidence: 1,
        applies: true,
        sources: ['git'],
        reliability: { tag: 'maximal', confidence: 'high', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
        source_date: null,
        source_url: null,
      },
      {
        check_id: 'AI-02',
        code: [210],
        method: 'computed',
        status: 'PASS',
        value: 3,
        evidence: [],
        weight_awarded: 3,
        weight_max: 3,
        score: 1,
        confidence: 1,
        applies: true,
        sources: ['tracker'],
        reliability: { tag: 'maximal', confidence: 'high', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
        source_date: null,
        source_url: null,
      },
      {
        check_id: 'AI-03',
        code: [150],
        method: 'computed',
        status: 'SKIP',
        value: null,
        evidence: [],
        weight_awarded: 0,
        weight_max: 2,
        score: 0,
        confidence: 0,
        applies: false,
        sources: ['scale'],
        reliability: { tag: 'maximal', confidence: 'high', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
        source_date: null,
        source_url: null,
      },
    ],
  };

  // Dimension B: ci only
  const dimB = {
    dimension: 'quality-assurance',
    date: '2025-01-01',
    score: 0,
    coverage: 0,
    checks: [
      {
        check_id: 'QA-01',
        code: [501],
        method: 'detected',
        status: 'FAIL',
        value: false,
        evidence: [],
        weight_awarded: 0,
        weight_max: 4,
        score: 0,
        confidence: 1,
        applies: true,
        sources: ['ci'],
        reliability: { tag: 'maximal', confidence: 'high', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
        source_date: null,
        source_url: null,
      },
    ],
  };

  writeFileSync(
    join(outDir, 'ai-sdlc-adoption.json'),
    JSON.stringify(dimA, null, 2)
  );
  writeFileSync(
    join(outDir, 'quality-assurance.json'),
    JSON.stringify(dimB, null, 2)
  );

  // Write collected artifacts with period blocks (as the orchestrator would after connector fetch).
  mkdirSync(collectedDir, { recursive: true });
  writeFileSync(
    join(collectedDir, 'git.json'),
    JSON.stringify(
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        period: {
          bucket_days: 30,
          lookback_days: 540,
          history_available_days: 540,
          source_label: 'git history',
        },
        raw: {},
      },
      null,
      2
    )
  );
  writeFileSync(
    join(collectedDir, 'tracker.json'),
    JSON.stringify(
      {
        source: 'tracker',
        available: true,
        reason_if_absent: null,
        period: {
          bucket_days: 30,
          lookback_days: 180,
          history_available_days: 180,
          source_label: 'Jira via Atlassian MCP',
        },
        raw: {},
      },
      null,
      2
    )
  );
  writeFileSync(
    join(collectedDir, 'ci.json'),
    JSON.stringify(
      {
        source: 'ci',
        available: true,
        reason_if_absent: null,
        period: {
          bucket_days: 30,
          lookback_days: 90,
          history_available_days: 90,
        },
        raw: {},
      },
      null,
      2
    )
  );
  writeFileSync(
    join(collectedDir, 'docs.json'),
    JSON.stringify(
      {
        source: 'docs',
        available: false,
        reason_if_absent: 'no docs connector',
        period: {
          bucket_days: 30,
          lookback_days: 0,
          history_available_days: 0,
        },
        raw: {},
      },
      null,
      2
    )
  );

  aggregate(outDir);

  // Check per-dimension sources_used
  const updatedA = JSON.parse(
    readFileSync(join(outDir, 'ai-sdlc-adoption.json'), 'utf8')
  );
  assert.deepEqual(
    updatedA.sources_used,
    ['git', 'tracker'],
    'ai-sdlc-adoption sources_used must be ["git", "tracker"] (scale is SKIP → excluded)'
  );

  const updatedB = JSON.parse(
    readFileSync(join(outDir, 'quality-assurance.json'), 'utf8')
  );
  assert.deepEqual(
    updatedB.sources_used,
    ['ci'],
    'quality-assurance sources_used must be ["ci"]'
  );

  // Check audit.json source_windows
  const auditJson = JSON.parse(
    readFileSync(join(outDir, 'audit.json'), 'utf8')
  );
  assert.ok(
    auditJson.source_windows !== undefined,
    'audit.json must have a source_windows map after aggregate'
  );
  assert.equal(
    auditJson.source_windows.git?.days,
    540,
    'source_windows.git.days must be 540 (from period.lookback_days)'
  );
  assert.equal(
    auditJson.source_windows.git?.label,
    'git history',
    'source_windows.git.label must be "git history" (from period.source_label)'
  );
  assert.equal(
    auditJson.source_windows.tracker?.days,
    180,
    'source_windows.tracker.days must be 180 (from period.lookback_days)'
  );
  assert.equal(
    auditJson.source_windows.tracker?.label,
    'Jira via Atlassian MCP',
    'source_windows.tracker.label must be "Jira via Atlassian MCP" (from period.source_label)'
  );
  assert.equal(
    auditJson.source_windows.ci?.days,
    90,
    'source_windows.ci.days must be 90 (fallback to period.lookback_days when source_label absent)'
  );
  assert.equal(
    auditJson.source_windows.ci?.label,
    'CI runs',
    'source_windows.ci.label must be "CI runs" (SOURCE_LABEL_DEFAULTS fallback when source_label absent)'
  );
});
