/**
 * audit_core.test.ts — tests that audit-core writes a sources[] block into audit.json
 * and that aggregate() preserves an existing sources block when collected/ is absent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
