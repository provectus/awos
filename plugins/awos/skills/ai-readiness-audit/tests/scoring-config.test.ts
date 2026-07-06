// scoring-config.test.ts — the score curve of every banded metric is
// reviewable standards.toml configuration, not code.
//
// Contract: a metric whose score is not simply the measured 0..1 fraction
// must declare its curve in `[category.<key>.scoring]` (scale, anchors,
// basis, basis_note). `scoringFor` throws on a missing/malformed table, so a
// metric with made-up numbers cannot ship silently: adding a banded metric
// forces the author to either transcribe published values (and deep-link
// them via the category `url`) or mark the anchors as an AWOS heuristic.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoringFor,
  scoreFromConfig,
  type ScoringConfig,
} from '../metrics/_score.ts';
import { loadStandards } from './helpers.ts';

const standards = loadStandards();
const categories = standards['category'] as Record<
  string,
  Record<string, unknown>
>;

/** Category keys whose metric scores through a declared curve. */
const BANDED_CATEGORIES = [
  'merge_frequency',
  'lead_time_for_change',
  'pr_cycle_time',
  'change_failure_rate',
  'review_rework',
  'rework_rate',
  'mttr',
  'ci_pass_rate',
  'pipeline_duration_trend',
  'work_mix_allocation',
  'issue_throughput',
  'ticket_subtask_split',
  'ticket_description_quality',
  'onboarding_ease',
  'cyclomatic_complexity',
  'code_churn',
] as const;

test('every banded category declares a well-formed [.scoring] table', () => {
  for (const key of BANDED_CATEGORIES) {
    assert.ok(
      categories[key],
      `[category.${key}] must exist in standards.toml`
    );
    let cfg: ScoringConfig;
    try {
      cfg = scoringFor(standards, key);
    } catch (err) {
      assert.fail(
        `[category.${key}.scoring] must parse via scoringFor: ${(err as Error).message}`
      );
    }
    assert.ok(
      cfg!.anchors.length >= 2,
      `[category.${key}.scoring] needs at least two anchors`
    );
    for (const a of cfg!.anchors) {
      assert.ok(
        a.y >= 0 && a.y <= 1,
        `[category.${key}.scoring] anchor scores must be within [0, 1], got y=${a.y}`
      );
    }
    if (cfg!.basis !== 'published') {
      assert.ok(
        typeof categories[key]['scoring'] === 'object' &&
          typeof (categories[key]['scoring'] as Record<string, unknown>)[
            'basis_note'
          ] === 'string',
        `[category.${key}.scoring] basis="${cfg!.basis}" must carry a basis_note saying which values are sourced and which are AWOS judgment`
      );
    }
    assert.ok(
      typeof categories[key]['url'] === 'string' &&
        (categories[key]['url'] as string).startsWith('http'),
      `[category.${key}] must cite a url for its scoring basis`
    );
  }
});

test('scoringFor names the category and the fix when config is missing', () => {
  assert.throws(
    () => scoringFor(standards, 'no_such_category'),
    (err: Error) =>
      err.message.includes('[category.no_such_category.scoring]') &&
      err.message.includes('basis'),
    'the error must name the missing table and tell the author what to add'
  );
});

test('scoringFor rejects malformed anchors', () => {
  const bad = {
    category: {
      x: { scoring: { scale: 'log', basis: 'heuristic', anchors: [[1, 0.5]] } },
    },
  } as unknown as Record<string, unknown>;
  assert.throws(
    () => scoringFor(bad, 'x'),
    /at least two/,
    'a single-anchor curve must be rejected'
  );
  const unsorted = {
    category: {
      x: {
        scoring: {
          scale: 'linear',
          basis: 'heuristic',
          anchors: [
            [2, 1],
            [1, 0],
          ],
        },
      },
    },
  } as unknown as Record<string, unknown>;
  assert.throws(
    () => scoringFor(unsorted, 'x'),
    /strictly increasing/,
    'anchors out of x order must be rejected'
  );
});

test('pipeline_duration curve reproduces the documented example: 1186 s → ≈ 0.81', () => {
  // Regression pin for the report question "why is avg pipeline duration
  // 1186 s across 455 decided runs ≈ 80%": log-interp between the 600 s
  // (score 1.0) and 1800 s (score 0.7) anchors declared in standards.toml.
  const cfg = scoringFor(standards, 'pipeline_duration_trend');
  const score = scoreFromConfig(1186, cfg);
  assert.ok(
    Math.abs(score - 0.81) < 0.01,
    `1186 s must score ≈ 0.81 via the declared log curve, got ${score}`
  );
});

test('DORA-derived curves transcribe the published band boundaries', () => {
  // lead time: elite < 1 day (24 h), high < 1 week (168 h), medium < 1 month
  // (720 h) — the anchor x values must stay on those boundaries.
  const lead = scoringFor(standards, 'lead_time_for_change');
  assert.deepEqual(
    lead.anchors.map((a) => a.x),
    [1, 24, 168, 720, 2160],
    'lead_time_for_change anchors must sit on the DORA band boundaries (hours)'
  );
  const cfr = scoringFor(standards, 'change_failure_rate');
  assert.equal(
    cfr.anchors[cfr.anchors.length - 1].x,
    0.15,
    'change_failure_rate zero-score point must be the DORA medium/low boundary (15%)'
  );
});
