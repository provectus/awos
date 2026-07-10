/**
 * Tests for ticket_subtask_split — ticket sub-task split ratio.
 *
 * TDD: written before the implementation exists.
 * Each test names the contract it is asserting so failure messages are self-describing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from './ticket_subtask_split.ts';
import { loadStandards } from './_base.ts';
import { trackerArtifact } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

// Real standards.toml — compute() reads its score curve from
// [category.ticket_subtask_split.scoring].
const STANDARDS = loadStandards(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'references',
    'standards.toml'
  )
);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

type TicketFixture = Record<string, unknown>;

function makeTrackerArtifact(
  tickets: TicketFixture[],
  available = true
): string {
  return trackerArtifact({ tickets }, available);
}

// ---------------------------------------------------------------------------
// SKIP cases
// ---------------------------------------------------------------------------

test('ticket_subtask_split: SKIP when tracker.json absent', () => {
  const dir = tmpDir('awos-i4-nofile-');
  try {
    const res = compute(dir, STANDARDS, {});
    assert.equal(
      res.status,
      'SKIP',
      'status must be SKIP when tracker.json does not exist'
    );
    assert.equal(res.score, 0, 'score must be 0 on SKIP');
    assert.equal(res.confidence, 0, 'confidence must be 0 on SKIP');
    assert.deepEqual(
      res.categories_awarded,
      [],
      'no categories may be awarded on SKIP'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: SKIP when tracker.json available=false', () => {
  const dir = tmpDir('awos-i4-unavail-');
  try {
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact([], false));
    const res = compute(dir, STANDARDS, {});
    assert.equal(
      res.status,
      'SKIP',
      'status must be SKIP when tracker connector is unavailable'
    );
    assert.equal(res.score, 0, 'score must be 0 when connector is unavailable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: SKIP when no ticket has subtask_count data', () => {
  const dir = tmpDir('awos-i4-nodata-');
  try {
    // Tickets present but none carry a numeric subtask_count at all —
    // the connector did not map the field, so there is nothing to measure.
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', type: 'story', status: 'Done' },
      { id: 'PROJ-2', type: 'bug', status: 'Done' },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(
      res.status,
      'SKIP',
      'status must be SKIP when no ticket carries a numeric subtask_count (field unmapped)'
    );
    assert.deepEqual(
      res.categories_awarded,
      [],
      'no categories may be awarded when subtask data is absent'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: SKIP when raw.tickets is absent from artifact', () => {
  const dir = tmpDir('awos-i4-notickets-');
  try {
    writeFileSync(
      join(dir, 'tracker.json'),
      JSON.stringify({ available: true, raw: {} })
    );
    const res = compute(dir, STANDARDS, {});
    assert.equal(
      res.status,
      'SKIP',
      'status must be SKIP when raw.tickets is absent from the artifact'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Computation — good band (avg ≤ 3)
// ---------------------------------------------------------------------------

test('ticket_subtask_split: avg=2 subtasks/parent → band=good, score=0.9', () => {
  const dir = tmpDir('awos-i4-good-');
  try {
    // Two parent tickets each with 2 subtasks → avg = 2.0
    // ANCHORS: (1,1)→(3,0.8): at x=2 → 1 + (0.8-1)*((2-1)/2) = 0.9
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', subtask_count: 2 },
      { id: 'PROJ-2', subtask_count: 2 },
      { id: 'PROJ-3', parent: 'PROJ-1' }, // a sub-task itself — excluded from the parent average
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(res.status, 'OK', 'status must be OK with subtask data');
    assert.equal(res.band, 'good', 'band must be "good" for avg subtasks ≤ 3');
    const expected = 1 + (0.8 - 1) * ((2 - 1) / 2);
    assert.ok(
      Math.abs((res.score ?? 0) - expected) < 1e-4,
      `score must be ≈${expected.toFixed(4)} at avg=2.0 (linear ANCHOR interpolation), got ${res.score}`
    );
    assert.ok(
      Math.abs((res.value as number) - 2) < 1e-9,
      `value must equal avg subtasks per parent (2.0), got ${res.value}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Computation — watch band (3 < avg ≤ 6)
// ---------------------------------------------------------------------------

test('ticket_subtask_split: avg=4.5 subtasks/parent → band=watch, score=0.6', () => {
  const dir = tmpDir('awos-i4-watch-');
  try {
    // Parents: 4 and 5 subtasks → avg = 4.5
    // ANCHORS: (3,0.8)→(6,0.4): at x=4.5 → 0.8 + (0.4-0.8)*(1.5/3) = 0.6
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', subtask_count: 4 },
      { id: 'PROJ-2', subtask_count: 5 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(res.status, 'OK', 'status must be OK with subtask data');
    assert.equal(
      res.band,
      'watch',
      'band must be "watch" for 3 < avg subtasks ≤ 6'
    );
    assert.ok(
      Math.abs((res.score ?? 0) - 0.6) < 1e-6,
      `score must be 0.6 at avg=4.5 (linear ANCHOR interpolation), got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Computation — concerning band (avg > 6)
// ---------------------------------------------------------------------------

test('ticket_subtask_split: avg=8 subtasks/parent → band=concerning, score=0.2', () => {
  const dir = tmpDir('awos-i4-concern-');
  try {
    // Both parents with 8 subtasks → avg = 8
    // ANCHORS: (6,0.4)→(10,0): at x=8 → 0.4 + (0-0.4)*(2/4) = 0.2
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', subtask_count: 8 },
      { id: 'PROJ-2', subtask_count: 8 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(res.status, 'OK', 'status must be OK with subtask data');
    assert.equal(
      res.band,
      'concerning',
      'band must be "concerning" for avg subtasks > 6'
    );
    assert.ok(
      Math.abs((res.score ?? 0) - 0.2) < 1e-6,
      `score must be 0.2 at avg=8 (linear ANCHOR interpolation), got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Denominator: ALL parent-eligible tickets, including 0-subtask ones
// ---------------------------------------------------------------------------

test('ticket_subtask_split: 0-subtask parents count in the average (best case reachable)', () => {
  const dir = tmpDir('awos-i4-zeros-');
  try {
    // Every parent-eligible ticket has an explicit 0 → avg = 0 → on the
    // full-score plateau (avg ≤ 1): best case scores exactly 1.0.
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', subtask_count: 0 },
      { id: 'PROJ-2', subtask_count: 0 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(
      res.status,
      'OK',
      'explicit zero subtask data must be scored, not skipped'
    );
    assert.equal(res.value, 0, 'avg must be 0 when no parent has subtasks');
    assert.equal(
      res.score,
      1,
      'score must be 1.0 at avg=0 subtasks/parent (best case — on the plateau)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: one over-split epic cannot dominate many plain tickets', () => {
  const dir = tmpDir('awos-i4-epic-');
  try {
    // 1 epic with 20 subtasks + 9 plain tickets (no subtask_count → 0).
    // Old buggy behaviour averaged only the epic (avg=20 → score 0);
    // correct behaviour averages all 10 parents: avg=2 → band good.
    const tickets: TicketFixture[] = [
      { id: 'EPIC-1', subtask_count: 20 },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `PROJ-${i + 1}` })),
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.ok(
      Math.abs((res.value as number) - 2) < 1e-9,
      `avg must be 2.0 (20 subtasks over 10 parent-eligible tickets), got ${res.value}`
    );
    assert.equal(
      res.band,
      'good',
      'one over-split epic among many plain tickets must not push the band past "good"'
    );
    assert.ok(
      (res.score ?? 0) > 0.8,
      `score must stay high when only 1 of 10 parents is over-split, got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: worst case — every parent ≥10 subtasks scores 0', () => {
  const dir = tmpDir('awos-i4-worst-');
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', subtask_count: 12 },
      { id: 'PROJ-2', subtask_count: 15 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(res.status, 'OK', 'worst-case repo must still be scored (OK)');
    assert.equal(
      res.score,
      0,
      'score must reach 0 when the average is ≥10 subtasks/parent (worst case)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Category and reliability
// ---------------------------------------------------------------------------

test('ticket_subtask_split: awards category 1104 when topology.has_tracker=true', () => {
  const dir = tmpDir('awos-i4-cat-');
  try {
    const tickets: TicketFixture[] = [{ id: 'PROJ-1', subtask_count: 3 }];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    // Pass mock standards that declare 1104 for this metric
    const mockStandards = {
      category: {
        ticket_subtask_split: {
          code: 1104,
          metric: 'ticket_subtask_split',
          applies_when: 'topology.has_tracker',
          weight: 3,
          scoring: {
            scale: 'linear',
            anchors: [
              [1, 1.0],
              [3, 0.8],
              [6, 0.4],
              [10, 0.0],
            ],
            basis: 'heuristic',
            basis_note: 'test fixture mirroring standards.toml',
          },
        },
      },
    };
    const res = compute(dir, mockStandards, { has_tracker: true });
    assert.ok(
      (res.categories_awarded as number[]).includes(1104),
      `category 1104 must be awarded when topology.has_tracker=true, got ${JSON.stringify(res.categories_awarded)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: does not award 1104 when topology.has_tracker=false', () => {
  const dir = tmpDir('awos-i4-notopol-');
  try {
    const tickets: TicketFixture[] = [{ id: 'PROJ-1', subtask_count: 2 }];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const mockStandards = {
      category: {
        ticket_subtask_split: {
          code: 1104,
          metric: 'ticket_subtask_split',
          applies_when: 'topology.has_tracker',
          weight: 3,
          scoring: {
            scale: 'linear',
            anchors: [
              [1, 1.0],
              [3, 0.8],
              [6, 0.4],
              [10, 0.0],
            ],
            basis: 'heuristic',
            basis_note: 'test fixture mirroring standards.toml',
          },
        },
      },
    };
    const res = compute(dir, mockStandards, { has_tracker: false });
    assert.ok(
      !(res.categories_awarded as number[]).includes(1104),
      `category 1104 must NOT be awarded when topology.has_tracker=false, got ${JSON.stringify(res.categories_awarded)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: reliability.tag is "minimal"', () => {
  const dir = tmpDir('awos-i4-rel-');
  try {
    const tickets: TicketFixture[] = [{ id: 'PROJ-1', subtask_count: 2 }];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(
      res.reliability.tag,
      'minimal',
      'reliability.tag must be "minimal" (AWOS heuristic bands, no published numeric threshold)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket_subtask_split: expression describes the computation', () => {
  const dir = tmpDir('awos-i4-expr-');
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', subtask_count: 2 },
      { id: 'PROJ-2', subtask_count: 4 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.ok(
      typeof res.expression === 'string' && res.expression.length > 0,
      `expression must be a non-empty string describing the computation, got ${JSON.stringify(res.expression)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Weight-contract: verify standards.toml declares weight=3 for this category
// ---------------------------------------------------------------------------

test('ticket_subtask_split: standards.toml [category.ticket_subtask_split].weight === 3', () => {
  const thisFile = fileURLToPath(import.meta.url);
  const skillRoot = dirname(dirname(thisFile)); // metrics/ → skill root
  const standardsPath = join(skillRoot, 'references', 'standards.toml');
  const standards = loadStandards(standardsPath);
  const cat = (
    standards['category'] as Record<string, Record<string, unknown>>
  )['ticket_subtask_split'];
  assert.ok(
    cat !== undefined,
    '[category.ticket_subtask_split] must exist in standards.toml'
  );
  assert.equal(
    cat['weight'],
    3,
    '[category.ticket_subtask_split].weight must be 3 (AWOS definition)'
  );
  assert.equal(
    cat['code'],
    1104,
    '[category.ticket_subtask_split].code must be 1104'
  );
  assert.equal(
    cat['method'],
    'computed',
    '[category.ticket_subtask_split].method must be "computed"'
  );
});

// ---------------------------------------------------------------------------
// Full-score plateau (regression: a point-anchor at x=0 made score 1.0
// unreachable — hops averaged 0.06 subtasks/parent, clearly healthy, yet
// scored 0.996 and wore a PARTIAL badge beside a rounded "3/3 (100.0%)").
// ---------------------------------------------------------------------------

test('ticket_subtask_split: tiny nonzero average (0.06) sits on the plateau → score exactly 1.0', () => {
  const dir = tmpDir('awos-i4-plateau-');
  try {
    // 1 subtask across ~17 parents ≈ 0.06 avg — the real-world shape that
    // exposed the unreachable perfect score.
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', subtask_count: 1 },
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `PROJ-${i + 2}`,
        subtask_count: 0,
      })),
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(res.band, 'good', 'band must be "good" for a tiny average');
    assert.equal(
      res.score,
      1,
      `any avg ≤ 1 subtask/parent must score a full 1.0 (plateau) — a healthy tracker must be able to PASS, got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Field-gap SKIP note (same contract as adp_i5: a connected tracker missing
// the field must not claim the tracker source itself is missing).
// ---------------------------------------------------------------------------

test('ticket_subtask_split: field-gap SKIP names the unmapped field, not a missing connector', () => {
  const dir = tmpDir('awos-i4-fieldgap-');
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', type: 'story', status: 'Done' },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, STANDARDS, {});
    assert.equal(res.status, 'SKIP', 'must still SKIP without the field');
    const note = res.reliability?.note ?? '';
    assert.ok(
      note.includes('tracker connected') && note.includes('subtask_count'),
      `SKIP note must say the tracker IS connected and name the unmapped field; got "${note}"`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
