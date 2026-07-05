/**
 * Tests for the code-host connector path of the delivery metrics.
 *
 * Contracts verified:
 * - collected/code_host.json (merged-PR records) is PREFERRED over the git
 *   proxy by adp_g4_lead_time, adp_g5_pr_cycle_time, and adp_g8_review_rework
 * - on a squash-merge repo (where the git path SKIPs), PR data produces a
 *   scored result — the whole point of the connector
 * - each metric uses its own PR fields (first_commit_at→merged_at for g4,
 *   created_at→merged_at for g5, commit_count for g8) and falls back to the
 *   git path when its fields are absent
 * - sources_used names 'code_host' so provenance survives into the report
 * - an unavailable/malformed artifact falls through to the git path
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute as g4 } from '../metrics/adp_g4_lead_time.ts';
import { compute as g5 } from '../metrics/adp_g5_pr_cycle_time.ts';
import { compute as g8 } from '../metrics/adp_g8_review_rework.ts';
import { gitRaw, tmpDir, writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

const HOUR = 3_600_000;
const BASE = new Date('2025-03-01T12:00:00Z').getTime();

/** A merged-PR record: opened at BASE, first commit N hours before open,
 * merged M hours after open. */
function pr(
  firstCommitHoursBeforeOpen: number,
  mergeHoursAfterOpen: number,
  commitCount?: number
): Record<string, unknown> {
  return {
    number: 1,
    created_at: new Date(BASE).toISOString(),
    first_commit_at: new Date(
      BASE - firstCommitHoursBeforeOpen * HOUR
    ).toISOString(),
    merged_at: new Date(BASE + mergeHoursAfterOpen * HOUR).toISOString(),
    ...(commitCount !== undefined ? { commit_count: commitCount } : {}),
  };
}

/** git.json for a squash-merge repo — the git path SKIPs on all three metrics. */
function squashGitRaw(): Record<string, unknown> {
  return gitRaw({
    merge_records: [
      {
        merged_at: '2025-03-01T00:00:00Z',
        branch_first_commit_at: '2025-02-28T00:00:00Z',
      },
    ],
    total_commits: 100,
    window_stats: { merge_strategy: 'squash', window_start: null },
  });
}

test('adp_g4: code-host PR data scores a squash repo the git path must SKIP', () => {
  const tmp = tmpDir('ch-g4-');
  const collectedDir = writeCollected(tmp, 'git', squashGitRaw());
  // 2 PRs: first-commit→merge = 10h+2h and 10h+4h → median 13h → elite.
  writeCollected(tmp, 'code_host', {
    prs: [pr(10, 2), pr(10, 4)],
  });

  const result = g4(collectedDir, standards, {});
  assert.equal(
    result.status,
    'OK',
    'PR data must score where the git proxy admits defeat'
  );
  assert.equal(result.band, 'elite', '12h/14h lead times → median 13h → elite');
  assert.deepEqual(
    result.sources_used,
    ['code_host'],
    'provenance must name the code host'
  );
  assert.ok(
    result.categories_awarded.includes(401),
    'code 401 must be awarded from PR data'
  );
});

test('adp_g4: PRs without first_commit_at fall back to the git path', () => {
  const tmp = tmpDir('ch-g4-fb-');
  const collectedDir = writeCollected(tmp, 'git', squashGitRaw());
  writeCollected(tmp, 'code_host', {
    prs: [
      {
        created_at: new Date(BASE).toISOString(),
        merged_at: new Date(BASE + HOUR).toISOString(),
      },
    ],
  });

  const result = g4(collectedDir, standards, {});
  assert.equal(
    result.value,
    null,
    'without first_commit_at the PR record cannot yield a lead time — the squash git path must still be the (null) answer'
  );
});

test('adp_g5: PR open→merge from the code host outranks tracker and git', () => {
  const tmp = tmpDir('ch-g5-');
  const collectedDir = writeCollected(tmp, 'git', squashGitRaw());
  // Tracker WITH workflow history — previously the top source.
  writeCollected(tmp, 'tracker', {
    tickets: [
      {
        id: 'T-1',
        in_progress_at: new Date(BASE).toISOString(),
        resolved_at: new Date(BASE + 500 * HOUR).toISOString(),
      },
    ],
  });
  // PRs: open→merge 12h and 36h → median 24h → high band boundary (>=24 → high).
  writeCollected(tmp, 'code_host', { prs: [pr(0, 12), pr(0, 36)] });

  const result = g5(collectedDir, standards, {});
  assert.equal(result.status, 'OK');
  assert.equal(
    result.value,
    24,
    'median PR open→merge must be 24h from the code host — not the 500h tracker duration'
  );
  assert.deepEqual(
    result.sources_used,
    ['code_host'],
    'the code host is the literal source for PR cycle time and must win'
  );
  assert.equal(
    result.reliability.tag,
    'maximal',
    'created_at→merged_at is exact, not a proxy — reliability must be maximal'
  );
});

test('adp_g8: per-PR commit counts from the code host score a squash repo', () => {
  const tmp = tmpDir('ch-g8-');
  const collectedDir = writeCollected(tmp, 'git', squashGitRaw());
  // 3 PRs with 2, 4, 6 commits → avg 4 → rework proxy 3.
  writeCollected(tmp, 'code_host', {
    prs: [pr(1, 1, 2), pr(1, 1, 4), pr(1, 1, 6)],
  });

  const result = g8(collectedDir, standards, {});
  assert.equal(result.status, 'OK');
  assert.equal(
    result.value,
    3,
    'avg 4 commits/PR → 3 estimated rework commits'
  );
  assert.deepEqual(
    result.sources_used,
    ['code_host'],
    'provenance must name the code host'
  );
});

test('adp_g8: PRs without commit_count fall back to the git path', () => {
  const tmp = tmpDir('ch-g8-fb-');
  const collectedDir = writeCollected(tmp, 'git', squashGitRaw());
  writeCollected(tmp, 'code_host', { prs: [pr(1, 1), pr(1, 2)] });

  const result = g8(collectedDir, standards, {});
  assert.equal(
    result.value,
    null,
    'without commit_count the PR records carry no rework signal — the squash git path must still be the (null) answer'
  );
});

test('unavailable code_host artifact falls through to the git path on all three metrics', () => {
  const tmp = tmpDir('ch-unavail-');
  const collectedDir = writeCollected(tmp, 'git', squashGitRaw());
  writeCollected(tmp, 'code_host', { prs: [pr(10, 10, 5)] }, false);

  for (const [name, fn] of [
    ['g4', g4],
    ['g5', g5],
    ['g8', g8],
  ] as const) {
    const result = fn(collectedDir, standards, {});
    assert.notDeepEqual(
      result.sources_used,
      ['code_host'],
      `${name}: an available:false code_host artifact must never be scored`
    );
  }
});
