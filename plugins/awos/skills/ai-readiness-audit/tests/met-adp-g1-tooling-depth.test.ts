/**
 * Tests for adp_g1_tooling_depth metric.
 *
 * Contracts verified:
 * - fixture with tooling_paths=["CLAUDE.md"] → categories_awarded contains 101, status==="OK", kind==="coverage"
 * - value is coverage fraction (awarded / total defined)
 * - reliability tag is "maximal", confidence is HIGH
 * - SKIP when git.json is absent
 * - SKIP when tooling_paths is empty (no categories awarded)
 * - all tooling layers present → full coverage
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g1_tooling_depth.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g1-'));
}

test('adp_g1: GEMINI.md + .cursor/commands → codes 101 and 103 awarded (not 0)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: ['GEMINI.md', '.cursor/commands'],
    monthly_buckets: [],
    merge_records: [],
    total_commits: 3,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'OK',
    'status must be OK when git source present'
  );
  assert.ok(
    result.categories_awarded.includes(101),
    `categories_awarded must include 101 for GEMINI.md; got ${result.categories_awarded}`
  );
  assert.ok(
    result.categories_awarded.includes(103),
    `categories_awarded must include 103 for .cursor/commands; got ${result.categories_awarded}`
  );
  assert.ok((result.value as number) > 0, 'Gemini-only repo must not score 0');
});

test('adp_g1: CLAUDE.md present → code 101 awarded, status OK, kind coverage', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: ['CLAUDE.md'],
    monthly_buckets: [],
    merge_records: [],
    total_commits: 2,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when git source present'
  );
  assert.equal(result.kind, 'coverage', 'kind must be "coverage"');
  assert.ok(
    result.categories_awarded.includes(101),
    'categories_awarded must include 101 (ai_tooling_claude_md) when CLAUDE.md present'
  );
  assert.equal(result.metric, 'adp_g1_tooling_depth', 'metric id must match');
});

test('adp_g1: AGENTS.md present → code 101 awarded', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: ['AGENTS.md'],
    monthly_buckets: [],
    merge_records: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    result.categories_awarded.includes(101),
    'AGENTS.md must award code 101'
  );
});

test('adp_g1: value is fraction of present categories', () => {
  const tmp = makeTmpDir();
  // Only CLAUDE.md present → 1 out of 6 categories
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: ['CLAUDE.md'],
    monthly_buckets: [],
    merge_records: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    typeof result.value === 'number' && result.value > 0 && result.value <= 1,
    `value must be a fraction in (0,1], got ${result.value}`
  );
  // 1 of 6 categories present
  assert.ok(
    Math.abs((result.value as number) - 1 / 6) < 0.001,
    `value must be ~1/6 when only CLAUDE.md present, got ${result.value}`
  );
});

test('adp_g1: all tooling layers → full coverage (value === 1)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: [
      'CLAUDE.md',
      '.claude/skills',
      '.claude/commands',
      '.claude/hooks',
      '.mcp.json',
      'context',
    ],
    monthly_buckets: [],
    merge_records: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.value,
    1,
    'all tooling paths present → coverage must be 1'
  );
  assert.equal(
    result.categories_awarded.length,
    6,
    'all 6 category codes must be awarded'
  );
});

test('adp_g1: reliability tag is maximal, confidence HIGH when git present', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: ['CLAUDE.md'],
    monthly_buckets: [],
    merge_records: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'maximal',
    'reliability tag must be "maximal"'
  );
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'confidence must be HIGH when all sources present'
  );
});

test('adp_g1: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  // Write no git.json — only a dummy other file
  const collectedDir = join(tmp, 'collected-missing');

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'status must be SKIP when git.json absent'
  );
  assert.equal(result.value, null, 'value must be null on SKIP');
  assert.deepEqual(
    result.categories_awarded,
    [],
    'categories_awarded must be empty on SKIP'
  );
});

test('adp_g1: empty tooling_paths → no categories awarded, value 0, status OK (git present)', () => {
  const tmp = makeTmpDir();
  // git.json is present but no tooling paths detected
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: [],
    monthly_buckets: [],
    merge_records: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  // git is present, so status is OK (source was used)
  assert.equal(
    result.status,
    'OK',
    'status must be OK when git is present even with empty tooling'
  );
  assert.equal(
    result.value,
    0,
    'value must be 0 when no tooling paths present'
  );
  assert.deepEqual(
    result.categories_awarded,
    [],
    'no categories awarded with empty tooling'
  );
});
