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
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clampToWindow } from '../metrics/_base.ts';
import { compute as ciPassRate } from '../metrics/ci_pass_rate.ts';
import { compute as pipelineDuration } from '../metrics/pipeline_duration.ts';
import { compute as subtaskSplit } from '../metrics/ticket_subtask_split.ts';
import { writeCollected, loadStandards } from './helpers.ts';

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
  const tmp = mkdtempSync(join(tmpdir(), 'win-c1-'));
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
  const tmp = mkdtempSync(join(tmpdir(), 'win-c2-'));
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
  const tmp = mkdtempSync(join(tmpdir(), 'win-i4-'));
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
