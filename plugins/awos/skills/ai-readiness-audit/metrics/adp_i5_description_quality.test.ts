/**
 * Tests for adp_i5_description_quality — ticket description quality/richness.
 *
 * TDD: written before the implementation exists.
 * Each test names the contract it is asserting so failure messages are self-describing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compute } from './adp_i5_description_quality.ts';
import { loadStandards } from './_base.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

type TicketFixture = Record<string, unknown>;

function makeTrackerArtifact(
  tickets: TicketFixture[],
  available = true
): string {
  return JSON.stringify({ available, raw: { tickets } });
}

// ---------------------------------------------------------------------------
// SKIP cases
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: SKIP when tracker.json absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-nofile-'));
  try {
    const res = compute(dir, {}, {});
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

test('adp_i5_description_quality: SKIP when tracker.json available=false', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-unavail-'));
  try {
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact([], false));
    const res = compute(dir, {}, {});
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

test('adp_i5_description_quality: SKIP when no ticket has description_length', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-nodata-'));
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', type: 'story', status: 'Done' },
      { id: 'PROJ-2', type: 'bug', status: 'Done' },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'SKIP',
      'status must be SKIP when no ticket carries a numeric description_length'
    );
    assert.deepEqual(
      res.categories_awarded,
      [],
      'no categories may be awarded when description_length data is absent'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: SKIP when raw.tickets is absent from artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-notickets-'));
  try {
    writeFileSync(
      join(dir, 'tracker.json'),
      JSON.stringify({ available: true, raw: {} })
    );
    const res = compute(dir, {}, {});
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
// Computation — good band (share ≥ 0.7)
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: share=1.0 (all well-described) → band=good, score=1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-good-'));
  try {
    // All 3 tickets have description_length ≥ 50 → share = 1.0
    // ANCHORS last segment (0.7,0.8)→(1,1): at x=1 → y=1
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 200 },
      { id: 'PROJ-2', description_length: 100 },
      { id: 'PROJ-3', description_length: 50 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'status must be OK with description_length data'
    );
    assert.equal(res.band, 'good', 'band must be "good" for share ≥ 0.7');
    assert.ok(
      Math.abs((res.score ?? 0) - 1) < 1e-6,
      `score must be 1.0 at share=1.0, got ${res.score}`
    );
    assert.ok(
      Math.abs((res.value as number) - 1) < 1e-9,
      `value must equal share (1.0), got ${res.value}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: share=0.7 → band=good, score=0.8', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-good2-'));
  try {
    // 7 of 10 tickets ≥ 50 chars → share = 0.7
    // ANCHORS: (0.4,0.4)→(0.7,0.8): at x=0.7 → y=0.8
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 60 },
      { id: 'PROJ-2', description_length: 80 },
      { id: 'PROJ-3', description_length: 100 },
      { id: 'PROJ-4', description_length: 150 },
      { id: 'PROJ-5', description_length: 200 },
      { id: 'PROJ-6', description_length: 55 },
      { id: 'PROJ-7', description_length: 70 },
      { id: 'PROJ-8', description_length: 10 }, // < 50
      { id: 'PROJ-9', description_length: 20 }, // < 50
      { id: 'PROJ-10', description_length: 30 }, // < 50
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'status must be OK with description_length data'
    );
    assert.equal(
      res.band,
      'good',
      'band must be "good" for share = 0.7 (boundary)'
    );
    assert.ok(
      Math.abs((res.score ?? 0) - 0.8) < 1e-6,
      `score must be 0.8 at share=0.7 (ANCHOR boundary), got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Computation — medium band (0.4 ≤ share < 0.7)
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: share=0.55 → band=medium, score≈0.6', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-medium-'));
  try {
    // 11 of 20 tickets ≥ 50 chars → share = 0.55
    // ANCHORS: (0.4,0.4)→(0.7,0.8): at x=0.55 → 0.4 + (0.8-0.4)*(0.15/0.3) = 0.4 + 0.2 = 0.6
    const good = Array.from({ length: 11 }, (_, i) => ({
      id: `PROJ-${i + 1}`,
      description_length: 60,
    }));
    const thin = Array.from({ length: 9 }, (_, i) => ({
      id: `PROJ-${i + 12}`,
      description_length: 20,
    }));
    const tickets: TicketFixture[] = [...good, ...thin];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'status must be OK with description_length data'
    );
    assert.equal(
      res.band,
      'medium',
      'band must be "medium" for 0.4 ≤ share < 0.7'
    );
    const expected = 0.4 + (0.8 - 0.4) * ((0.55 - 0.4) / (0.7 - 0.4));
    assert.ok(
      Math.abs((res.score ?? 0) - expected) < 1e-4,
      `score must be ≈${expected.toFixed(4)} at share=0.55 (linear ANCHOR interpolation), got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Computation — low band (share < 0.4)
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: share=0.2 → band=low, score=0.2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-low-'));
  try {
    // 2 of 10 tickets ≥ 50 chars → share = 0.2
    // ANCHORS: (0,0)→(0.4,0.4): at x=0.2 → 0 + 0.4*(0.2/0.4) = 0.2
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 60 },
      { id: 'PROJ-2', description_length: 100 },
      { id: 'PROJ-3', description_length: 10 },
      { id: 'PROJ-4', description_length: 20 },
      { id: 'PROJ-5', description_length: 5 },
      { id: 'PROJ-6', description_length: 15 },
      { id: 'PROJ-7', description_length: 30 },
      { id: 'PROJ-8', description_length: 40 },
      { id: 'PROJ-9', description_length: 0 },
      { id: 'PROJ-10', description_length: 1 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'status must be OK with description_length data'
    );
    assert.equal(res.band, 'low', 'band must be "low" for share < 0.4');
    assert.ok(
      Math.abs((res.score ?? 0) - 0.2) < 1e-6,
      `score must be 0.2 at share=0.2 (linear ANCHOR interpolation), got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: tickets without description_length excluded from total', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-mixed-'));
  try {
    // 2 tickets have description_length: 1 ≥ 50, 1 < 50. 3 tickets have no description_length (excluded).
    // Eligible total = 2, wellDescribed = 1, share = 0.5
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100 }, // ≥ 50 → counts
      { id: 'PROJ-2', description_length: 10 }, // < 50 → excluded from well-described
      { id: 'PROJ-3' }, // no description_length → excluded from total
      { id: 'PROJ-4' }, // no description_length → excluded from total
      { id: 'PROJ-5' }, // no description_length → excluded from total
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'status must be OK when at least one ticket has description_length'
    );
    // share = 1/2 = 0.5 → medium band
    assert.equal(res.band, 'medium', 'band must be "medium" for share=0.5');
    assert.ok(
      Math.abs((res.value as number) - 0.5) < 1e-9,
      `value must equal share among eligible tickets (0.5), got ${res.value}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Category and reliability
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: awards category 1105 when topology.has_tracker=true', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-cat-'));
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const mockStandards = {
      category: {
        ticket_description_quality: {
          code: 1105,
          metric: 'adp_i5_description_quality',
          applies_when: 'topology.has_tracker',
          weight: 3,
        },
      },
    };
    const res = compute(dir, mockStandards, { has_tracker: true });
    assert.ok(
      (res.categories_awarded as number[]).includes(1105),
      `category 1105 must be awarded when topology.has_tracker=true, got ${JSON.stringify(res.categories_awarded)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: does not award 1105 when topology.has_tracker=false', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-notopol-'));
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const mockStandards = {
      category: {
        ticket_description_quality: {
          code: 1105,
          metric: 'adp_i5_description_quality',
          applies_when: 'topology.has_tracker',
          weight: 3,
        },
      },
    };
    const res = compute(dir, mockStandards, { has_tracker: false });
    assert.ok(
      !(res.categories_awarded as number[]).includes(1105),
      `category 1105 must NOT be awarded when topology.has_tracker=false, got ${JSON.stringify(res.categories_awarded)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: reliability.tag is "minimal"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-rel-'));
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.reliability.tag,
      'minimal',
      'reliability.tag must be "minimal" (AWOS heuristic threshold, no published numeric standard)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: expression describes the computation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-expr-'));
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100 },
      { id: 'PROJ-2', description_length: 10 },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
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

test('adp_i5_description_quality: standards.toml [category.ticket_description_quality].weight === 3', () => {
  const thisFile = fileURLToPath(import.meta.url);
  const skillRoot = dirname(dirname(thisFile)); // metrics/ → skill root
  const standardsPath = join(skillRoot, 'references', 'standards.toml');
  const standards = loadStandards(standardsPath);
  const cat = (
    standards['category'] as Record<string, Record<string, unknown>>
  )['ticket_description_quality'];
  assert.ok(
    cat !== undefined,
    '[category.ticket_description_quality] must exist in standards.toml'
  );
  assert.equal(
    cat['weight'],
    3,
    '[category.ticket_description_quality].weight must be 3 (AWOS definition)'
  );
  assert.equal(
    cat['code'],
    1105,
    '[category.ticket_description_quality].code must be 1105'
  );
  assert.equal(
    cat['method'],
    'computed',
    '[category.ticket_description_quality].method must be "computed"'
  );
});
