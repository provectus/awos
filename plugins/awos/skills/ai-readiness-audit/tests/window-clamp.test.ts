/**
 * window-clamp.test.ts — every windowed metric measures the last
 * [meta].max_lookback_days (90), never the whole fetched history.
 *
 * Connectors over-fetch (e.g. `gh run list --limit 500` reaching months
 * back); the engine clamps CI runs and tracker tickets to the audit window,
 * anchored to the newest record (mirroring the git collector's newest-commit
 * anchor). Records with no parseable timestamp are kept — they cannot be
 * judged against the window.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { clampToWindow } from '../metrics/_base.ts';
import { compute as ciPassRate } from '../metrics/ci_pass_rate.ts';
import { compute as pipelineDuration } from '../metrics/pipeline_duration.ts';
import { compute as subtaskSplit } from '../metrics/ticket_subtask_split.ts';
import { compute as mttr } from '../metrics/mttr.ts';
import { writeCollected, loadStandards } from './helpers.ts';
import { tmpDir } from './helpers.ts';

const standards = loadStandards();

const ANCHOR = Date.parse('2026-07-01T00:00:00Z');
const day = 86_400_000;
const iso = (daysBeforeAnchor: number) =>
  new Date(ANCHOR - daysBeforeAnchor * day).toISOString();

test('clampToWindow drops records older than the window, anchored to the newest record', () => {
  const records = [
    { ts: iso(0) },
    { ts: iso(89) },
    { ts: iso(91) },
    { ts: iso(400) },
  ];
  const { kept, dropped } = clampToWindow(records, 90, (r) => r.ts);
  assert.deepEqual(
    kept.map((r) => r.ts),
    [iso(0), iso(89)],
    'records within 90 days of the newest record must be kept'
  );
  assert.equal(dropped, 2, 'records older than the window must be dropped');
});

test('clampToWindow keeps records with no parseable timestamp', () => {
  const records = [{ ts: iso(0) }, { ts: undefined }, { ts: 'not-a-date' }];
  const { kept, dropped } = clampToWindow(records, 90, (r) => r.ts);
  assert.equal(
    kept.length,
    3,
    'unparseable timestamps cannot be judged against the window and must be kept'
  );
  assert.equal(dropped, 0);
});

test('clampToWindow with no parseable timestamps at all keeps everything', () => {
  const records = [{ a: 1 }, { a: 2 }];
  const { kept, dropped } = clampToWindow(records, 90, () => undefined);
  assert.equal(kept.length, 2);
  assert.equal(dropped, 0);
});

test('ci_pass_rate ignores runs older than the 90-day window', () => {
  const tmp = tmpDir('win-c1-');
  // 3 recent passes + 2 ancient failures: an unwindowed rate would be 3/5.
  const runs = [
    { conclusion: 'success', createdAt: iso(1) },
    { conclusion: 'success', createdAt: iso(10) },
    { conclusion: 'success', createdAt: iso(60) },
    { conclusion: 'failure', createdAt: iso(200) },
    { conclusion: 'failure', createdAt: iso(300) },
  ];
  const collectedDir = writeCollected(tmp, 'ci', {
    config_detected: true,
    config_path: '.github/workflows',
    runs,
  });
  const result = ciPassRate(collectedDir, standards, { has_ci: true });
  assert.equal(
    result.value,
    1,
    'pass rate must be computed over in-window runs only (3/3, not 3/5)'
  );
  assert.match(
    String(result.expression),
    /2 runs older than the 90-day window dropped/,
    'the expression must disclose how many fetched runs fell outside the window'
  );
});

test('pipeline_duration averages in-window runs only', () => {
  const tmp = tmpDir('win-c2-');
  // Recent runs at 600 s; an ancient 7200 s run must not drag the average.
  const runs = [
    { conclusion: 'success', duration_seconds: 600, createdAt: iso(5) },
    { conclusion: 'success', duration_seconds: 600, createdAt: iso(30) },
    { conclusion: 'success', duration_seconds: 7200, createdAt: iso(250) },
  ];
  const collectedDir = writeCollected(tmp, 'ci', {
    config_detected: true,
    config_path: '.github/workflows',
    runs,
  });
  const result = pipelineDuration(collectedDir, standards, { has_ci: true });
  assert.equal(
    result.value,
    600,
    'average duration must be computed over in-window runs only'
  );
});

test('ticket_subtask_split ignores tickets resolved before the window', () => {
  const tmp = tmpDir('win-i4-');
  // One recent parent with 2 sub-tasks; one ancient parent with 40 sub-tasks
  // that would tank the score if history leaked in.
  const tickets = [
    { id: 'T-1', subtask_count: 2, resolved_at: iso(3) },
    { id: 'T-2', subtask_count: 40, resolved_at: iso(300) },
  ];
  const collectedDir = writeCollected(tmp, 'tracker', { tickets });
  const result = subtaskSplit(collectedDir, standards, { has_tracker: true });
  assert.equal(
    result.value,
    2,
    'average sub-task split must be computed over in-window tickets only'
  );
});

test('mttr measures incidents inside the standards window, not the artifact period', () => {
  const tmp = tmpDir('win-i5-');
  // Two recent 2h incidents, plus three ancient 200h ones that take over the
  // median if the whole fetched history leaks in ([2,2,200,200,200] → 200,
  // against [2,2] → 2). The envelope helpers.ts writes carries
  // lookback_days: 730 — wide enough to keep the ancient records — so this
  // passes only when the window comes from standards
  // ([meta].max_lookback_days = 90) rather than the artifact's period.
  const incidents = [
    { id: 'INC-1', started_at: iso(3), resolved_at: iso(3 - 2 / 24) },
    { id: 'INC-2', started_at: iso(5), resolved_at: iso(5 - 2 / 24) },
    { id: 'INC-O1', started_at: iso(300), resolved_at: iso(300 - 200 / 24) },
    { id: 'INC-O2', started_at: iso(320), resolved_at: iso(320 - 200 / 24) },
    { id: 'INC-O3', started_at: iso(340), resolved_at: iso(340 - 200 / 24) },
  ];
  const collectedDir = writeCollected(tmp, 'incidents', { incidents });
  const result = mttr(collectedDir, standards, { has_incident_source: true });
  assert.equal(
    result.value,
    2,
    'MTTR median must be computed over in-window incidents only — the 300-day-old incident must not reach it'
  );
});

test('an incidents envelope with no period still gets the standards window', () => {
  const tmp = tmpDir('win-i6-');
  // The clamp short-circuits on a falsy lookback, so reading the window off the
  // artifact meant a period-less envelope got NO clamp at all and an all-time
  // export became the "audit-window" median. Standards must supply the window.
  const incidents = [
    { id: 'INC-1', started_at: iso(3), resolved_at: iso(3 - 2 / 24) },
    { id: 'INC-OLD', started_at: iso(300), resolved_at: iso(300 - 200 / 24) },
  ];
  const d = join(tmp, 'collected');
  mkdirSync(d, { recursive: true });
  writeFileSync(
    join(d, 'incidents.json'),
    JSON.stringify({
      source: 'incidents',
      available: true,
      reason_if_absent: null,
      raw: { incidents },
    })
  );
  const result = mttr(d, standards, { has_incident_source: true });
  assert.equal(
    result.value,
    2,
    'a period-less incidents envelope must still be clamped to the standards window'
  );
});

test('the MTTR reliability note reports incidents dropped by the clamp', () => {
  const tmp = tmpDir('win-i7-');
  // dropped_out_of_window had exactly one write and no reads before this: a
  // stream clamping from 4 incidents to 2 read like a source that only ever
  // had 2. The note must say so, in incidents — not "runs".
  const incidents = [
    { id: 'INC-1', started_at: iso(3), resolved_at: iso(3 - 2 / 24) },
    { id: 'INC-2', started_at: iso(5), resolved_at: iso(5 - 2 / 24) },
    { id: 'INC-O1', started_at: iso(300), resolved_at: iso(300 - 5 / 24) },
    { id: 'INC-O2', started_at: iso(320), resolved_at: iso(320 - 5 / 24) },
  ];
  const collectedDir = writeCollected(tmp, 'incidents', { incidents });
  const result = mttr(collectedDir, standards, { has_incident_source: true });
  assert.match(
    result.reliability.note,
    /2 incidents older than the 90-day window dropped/,
    'the reliability note must report how many incidents the window clamp removed, named as incidents'
  );
});
