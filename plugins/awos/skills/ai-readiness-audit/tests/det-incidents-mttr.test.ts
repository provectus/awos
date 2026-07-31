/**
 * End-to-end: the incidents connector drives DF-07 (MTTR) through audit-core +
 * enrich. Builds a git repo, runs the real bundled engine with no incident
 * source (DF-07 SKIP), then writes a connector-shaped collected/incidents.json
 * (as the orchestrator would after fetching PagerDuty/etc.) and re-runs enrich —
 * DF-07 must become a measured, awarded, maximal-reliability result.
 *
 * Shells to dist/cli.js so it exercises the shipped binary; run
 * `npm run build:audit-engine` first (the suite's standard prerequisite).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitAs, tmpDir } from './helpers.ts';

const ENGINE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'cli.js'
);
const WHO = ['Dev', 'dev@example.com'] as const;

function df07(outDir: string): Record<string, unknown> | null {
  for (const f of readdirSync(outDir)) {
    if (!f.endsWith('.json')) continue;
    let d: { checks?: Array<Record<string, unknown>> };
    try {
      d = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
    } catch {
      continue;
    }
    const hit = (d.checks ?? []).find((c) => c.check_id === 'DF-07');
    if (hit) return hit;
  }
  return null;
}

test('incidents connector drives DF-07 from SKIP to a measured MTTR via enrich', () => {
  const repo = tmpDir('inc-e2e-');
  gitAs(repo, ['init', '-q', '-b', 'main'], '2026-07-01T00:00:00', ...WHO);
  for (let i = 1; i <= 4; i++) {
    writeFileSync(join(repo, `f${i}.txt`), `v${i}`);
    gitAs(repo, ['add', '.'], `2026-07-0${i}T00:00:00`, ...WHO);
    gitAs(
      repo,
      ['commit', '-qm', `feat: change ${i}`],
      `2026-07-0${i}T00:00:00`,
      ...WHO
    );
  }
  const out = join(repo, 'out');

  // Baseline: no incident source connected → DF-07 SKIP.
  execFileSync('node', [ENGINE, 'audit-core', repo, out], { stdio: 'ignore' });
  const base = df07(out);
  assert.ok(base, 'DF-07 must be present in the baseline audit');
  assert.equal(base!.status, 'SKIP', 'no incident source → DF-07 SKIP');

  // Orchestrator writes the normalized incidents artifact (as if from PagerDuty),
  // then enrich re-scores. Resolved spans: 0.5h, 2h, 6h → median 2h.
  writeFileSync(
    join(out, 'collected', 'incidents.json'),
    JSON.stringify({
      source: 'incidents',
      available: true,
      reason_if_absent: null,
      period: {
        bucket_days: 30,
        lookback_days: 90,
        history_available_days: 90,
      },
      raw: {
        incidents: [
          {
            id: 'INC-1',
            started_at: '2026-07-02T09:00:00Z',
            resolved_at: '2026-07-02T09:30:00Z',
          },
          {
            id: 'INC-2',
            started_at: '2026-07-03T14:00:00Z',
            resolved_at: '2026-07-03T16:00:00Z',
          },
          {
            id: 'INC-3',
            started_at: '2026-07-04T01:00:00Z',
            resolved_at: '2026-07-04T07:00:00Z',
          },
          {
            id: 'INC-4',
            started_at: '2026-07-05T22:00:00Z',
            resolved_at: null,
          },
        ],
        count: 4,
        resolved_count: 3,
        median_duration_hours: 2,
        source_label: 'PagerDuty',
      },
    })
  );
  execFileSync('node', [ENGINE, 'enrich', repo, out], { stdio: 'ignore' });

  const after = df07(out);
  assert.ok(after, 'DF-07 must be present after enrich');
  assert.notEqual(
    after!.status,
    'SKIP',
    'a connected incident source must un-SKIP DF-07'
  );
  assert.equal(
    after!.value,
    2,
    'MTTR value is the median of the resolved spans (2h)'
  );
  assert.equal(
    (after!.reliability as { tag?: string } | undefined)?.tag,
    'maximal',
    'real incident data upgrades reliability to maximal'
  );
  assert.ok(
    (after!.weight_awarded as number) > 0,
    'DF-07 must award weight once a real incident source is present'
  );
});
