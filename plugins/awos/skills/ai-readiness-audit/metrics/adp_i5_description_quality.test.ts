/**
 * Tests for adp_i5_description_quality — ticket description quality/richness.
 *
 * TDD: written before the implementation exists.
 * Each test names the contract it is asserting so failure messages are self-describing.
 *
 * A ticket is "well-described" iff BOTH hold: description_length ≥ 50 chars AND
 * has_acceptance_criteria === true. Eligibility (the SKIP guard) depends only on a
 * numeric description_length — the AC flag never affects eligibility.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compute } from './adp_i5_description_quality.ts';
import { loadStandards } from './_base.ts';
import { trackerArtifact } from '../tests/helpers.ts';

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
    // All 3 tickets have description_length ≥ 50 AND has_acceptance_criteria → share = 1.0
    // ANCHORS last segment (0.7,0.8)→(1,1): at x=1 → y=1
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 200, has_acceptance_criteria: true },
      { id: 'PROJ-2', description_length: 100, has_acceptance_criteria: true },
      { id: 'PROJ-3', description_length: 50, has_acceptance_criteria: true },
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

test('adp_i5_description_quality: 3 of 4 well-described (long desc w/o AC excluded) → share=0.75, band=good', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-and-'));
  try {
    // 4 eligible tickets (all carry description_length). Only 3 are well-described:
    // PROJ-4 has a LONG description but has_acceptance_criteria=false → NOT well-described.
    // This proves the AND condition: a long description alone does not count.
    // share = 3/4 = 0.75 → ANCHORS (0.7,0.8)→(1,1): 0.8 + 0.2*((0.75-0.7)/0.3) ≈ 0.8333
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 200, has_acceptance_criteria: true },
      { id: 'PROJ-2', description_length: 100, has_acceptance_criteria: true },
      { id: 'PROJ-3', description_length: 60, has_acceptance_criteria: true },
      { id: 'PROJ-4', description_length: 500, has_acceptance_criteria: false }, // long but NO AC
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'status must be OK with description_length data'
    );
    assert.equal(res.band, 'good', 'band must be "good" for share = 0.75');
    assert.ok(
      Math.abs((res.value as number) - 0.75) < 1e-9,
      `value must equal share (0.75) — a long description with has_acceptance_criteria=false is NOT well-described, got ${res.value}`
    );
    const expected = 0.8 + (1 - 0.8) * ((0.75 - 0.7) / (1 - 0.7));
    assert.ok(
      Math.abs((res.score ?? 0) - expected) < 1e-4,
      `score must be ≈${expected.toFixed(4)} at share=0.75 (linear ANCHOR interpolation), got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: share=0.7 → band=good, score=0.8', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-good2-'));
  try {
    // 7 of 10 eligible tickets well-described (≥50 chars AND AC) → share = 0.7
    // ANCHORS: (0.4,0.4)→(0.7,0.8): at x=0.7 → y=0.8
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 60, has_acceptance_criteria: true },
      { id: 'PROJ-2', description_length: 80, has_acceptance_criteria: true },
      { id: 'PROJ-3', description_length: 100, has_acceptance_criteria: true },
      { id: 'PROJ-4', description_length: 150, has_acceptance_criteria: true },
      { id: 'PROJ-5', description_length: 200, has_acceptance_criteria: true },
      { id: 'PROJ-6', description_length: 55, has_acceptance_criteria: true },
      { id: 'PROJ-7', description_length: 70, has_acceptance_criteria: true },
      { id: 'PROJ-8', description_length: 10, has_acceptance_criteria: true }, // desc too short
      { id: 'PROJ-9', description_length: 90, has_acceptance_criteria: false }, // no AC
      { id: 'PROJ-10', description_length: 30, has_acceptance_criteria: false }, // both fail
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
// Computation — watch band (0.4 ≤ share < 0.7)
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: share=0.55 → band=watch, score≈0.6', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-watch-'));
  try {
    // 11 of 20 eligible tickets well-described → share = 0.55
    // ANCHORS: (0.4,0.4)→(0.7,0.8): at x=0.55 → 0.4 + (0.8-0.4)*(0.15/0.3) = 0.4 + 0.2 = 0.6
    const good = Array.from({ length: 11 }, (_, i) => ({
      id: `PROJ-${i + 1}`,
      description_length: 60,
      has_acceptance_criteria: true,
    }));
    const thin = Array.from({ length: 9 }, (_, i) => ({
      id: `PROJ-${i + 12}`,
      description_length: 20,
      has_acceptance_criteria: false,
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
      'watch',
      'band must be "watch" for 0.4 ≤ share < 0.7'
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
// Computation — concerning band (share < 0.4)
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: share=0.2 → band=concerning, score=0.2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-concern-'));
  try {
    // 2 of 10 eligible tickets well-described → share = 0.2
    // ANCHORS: (0,0)→(0.4,0.4): at x=0.2 → 0 + 0.4*(0.2/0.4) = 0.2
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 60, has_acceptance_criteria: true },
      { id: 'PROJ-2', description_length: 100, has_acceptance_criteria: true },
      { id: 'PROJ-3', description_length: 10, has_acceptance_criteria: false },
      { id: 'PROJ-4', description_length: 20, has_acceptance_criteria: false },
      { id: 'PROJ-5', description_length: 5, has_acceptance_criteria: false },
      { id: 'PROJ-6', description_length: 15, has_acceptance_criteria: false },
      { id: 'PROJ-7', description_length: 30, has_acceptance_criteria: false },
      { id: 'PROJ-8', description_length: 40, has_acceptance_criteria: false },
      { id: 'PROJ-9', description_length: 0, has_acceptance_criteria: false },
      { id: 'PROJ-10', description_length: 1, has_acceptance_criteria: false },
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
      'concerning',
      'band must be "concerning" for share < 0.4'
    );
    assert.ok(
      Math.abs((res.score ?? 0) - 0.2) < 1e-6,
      `score must be 0.2 at share=0.2 (linear ANCHOR interpolation), got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: long description without acceptance criteria is NOT well-described', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-noac-'));
  try {
    // 3 eligible tickets, only 1 well-described:
    //   PROJ-1: long desc + AC          → well-described
    //   PROJ-2: very long desc, AC false → NOT well-described (AC missing)
    //   PROJ-3: long desc, AC absent     → NOT well-described (AC missing)
    // share = 1/3 ≈ 0.333 → concerning
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100, has_acceptance_criteria: true },
      { id: 'PROJ-2', description_length: 500, has_acceptance_criteria: false },
      { id: 'PROJ-3', description_length: 80 }, // AC flag absent → treated as not present
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'status must be OK — all three carry description_length'
    );
    assert.ok(
      Math.abs((res.value as number) - 1 / 3) < 1e-9,
      `value must equal 1/3 — only the ticket with BOTH a long description AND acceptance criteria counts, got ${res.value}`
    );
    assert.equal(
      res.band,
      'concerning',
      'band must be "concerning" for share ≈ 0.333'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i5_description_quality: tickets without description_length excluded from total', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-mixed-'));
  try {
    // 2 tickets carry description_length: 1 well-described, 1 not.
    // 3 tickets have no description_length → excluded from eligible total.
    // eligible = 2, wellDescribed = 1, share = 0.5 → watch
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100, has_acceptance_criteria: true }, // well-described
      { id: 'PROJ-2', description_length: 10, has_acceptance_criteria: true }, // desc too short
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
    assert.equal(res.band, 'watch', 'band must be "watch" for share=0.5');
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
      { id: 'PROJ-1', description_length: 100, has_acceptance_criteria: true },
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
      { id: 'PROJ-1', description_length: 100, has_acceptance_criteria: true },
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
      { id: 'PROJ-1', description_length: 100, has_acceptance_criteria: true },
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

test('adp_i5_description_quality: expression mentions both description size and acceptance criteria', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-expr-'));
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', description_length: 100, has_acceptance_criteria: true },
      { id: 'PROJ-2', description_length: 10, has_acceptance_criteria: false },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.ok(
      typeof res.expression === 'string' && res.expression.length > 0,
      `expression must be a non-empty string describing the computation, got ${JSON.stringify(res.expression)}`
    );
    assert.ok(
      /acceptance criteria/i.test(res.expression as string),
      `expression must mention acceptance criteria (both signals), got ${JSON.stringify(res.expression)}`
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

// ---------------------------------------------------------------------------
// Field-gap SKIP note (regression: a connected tracker whose fetch never
// mapped description_length SKIPped with the generic "missing sources:
// tracker" — misreporting a field-mapping gap as a missing connector).
// ---------------------------------------------------------------------------

test('adp_i5_description_quality: field-gap SKIP names the unmapped field, not a missing connector', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i5-fieldgap-'));
  try {
    const tickets: TicketFixture[] = [
      { id: 'PROJ-1', type: 'story', status: 'Done' },
      { id: 'PROJ-2', type: 'bug', status: 'Done' },
    ];
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact(tickets));
    const res = compute(dir, {}, {});
    assert.equal(res.status, 'SKIP', 'must still SKIP without the field');
    const note = res.reliability?.note ?? '';
    assert.ok(
      note.includes('tracker connected') && note.includes('description_length'),
      `SKIP note must say the tracker IS connected and name the unmapped field so the reader fixes the fetch, not the connector; got "${note}"`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
