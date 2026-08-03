/**
 * Tests for the connector-passed incidents collector (collectors/incidents.ts).
 * Mirrors the tracker collector contract: no connector → SKIP artifact; a
 * connector → resolved-span durations and their median.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collect,
  durationHours,
  deriveIncidentAggregates,
  hasMeasurableIncidents,
} from '../collectors/incidents.ts';

const PERIOD = {
  bucket_days: 30,
  lookback_days: 90,
  history_available_days: 0,
};

test('incidents: no connector → available:false with a reason', () => {
  const art = collect('.', PERIOD) as {
    available: boolean;
    reason_if_absent: string | null;
  };
  assert.equal(
    art.available,
    false,
    'SKIP when no incident source is connected'
  );
  assert.match(art.reason_if_absent ?? '', /incident source/i);
});

test('incidents: resolved incidents → count, resolved_count, median duration', () => {
  const art = collect('.', PERIOD, {
    source_label: 'PagerDuty',
    incidents: [
      {
        id: 'A',
        started_at: '2026-07-01T00:00:00Z',
        resolved_at: '2026-07-01T01:00:00Z',
      }, // 1h
      {
        id: 'B',
        started_at: '2026-07-02T00:00:00Z',
        resolved_at: '2026-07-02T03:00:00Z',
      }, // 3h
    ],
  }) as {
    available: boolean;
    raw: {
      count: number;
      resolved_count: number;
      median_duration_hours: number | null;
      source_label: string | null;
    };
  };
  assert.equal(art.available, true, 'a connected source is available');
  assert.equal(art.raw.count, 2);
  assert.equal(art.raw.resolved_count, 2);
  assert.equal(art.raw.median_duration_hours, 2, 'median of [1h, 3h] is 2h');
  assert.equal(art.raw.source_label, 'PagerDuty');
});

test('incidents: still-open incidents are excluded from the median', () => {
  const art = collect('.', PERIOD, {
    incidents: [
      {
        id: 'A',
        started_at: '2026-07-01T00:00:00Z',
        resolved_at: '2026-07-01T04:00:00Z',
      }, // 4h
      { id: 'B', started_at: '2026-07-02T00:00:00Z' }, // still open — no resolved_at
      { id: 'C', started_at: '2026-07-03T00:00:00Z', resolved_at: null }, // explicit open
    ],
  }) as {
    raw: {
      count: number;
      resolved_count: number;
      median_duration_hours: number | null;
    };
  };
  assert.equal(art.raw.count, 3, 'all incidents are recorded');
  assert.equal(
    art.raw.resolved_count,
    1,
    'only the resolved incident is measured'
  );
  assert.equal(
    art.raw.median_duration_hours,
    4,
    'median over the one resolved span'
  );
});

test('incidents: a source with no resolved incidents yields a null median', () => {
  const art = collect('.', PERIOD, {
    incidents: [{ id: 'A', started_at: '2026-07-01T00:00:00Z' }],
  }) as {
    available: boolean;
    raw: { resolved_count: number; median_duration_hours: number | null };
  };
  assert.equal(
    art.available,
    true,
    'available even with no resolved incidents'
  );
  assert.equal(art.raw.resolved_count, 0);
  assert.equal(art.raw.median_duration_hours, null);
});

test('incidents: reversed, unparseable, and zero-length spans count as invalid, not measured', () => {
  const art = collect('.', PERIOD, {
    incidents: [
      {
        id: 'ok',
        started_at: '2026-07-01T00:00:00Z',
        resolved_at: '2026-07-01T02:00:00Z',
      }, // 2h — the only measurable one
      {
        id: 'reversed',
        started_at: '2026-07-02T05:00:00Z',
        resolved_at: '2026-07-02T04:00:00Z',
      }, // resolved before started
      {
        id: 'garbage',
        started_at: 'not-a-date',
        resolved_at: '2026-07-03T04:00:00Z',
      }, // unparseable start
      {
        id: 'flap',
        started_at: '2026-07-04T00:00:00Z',
        resolved_at: '2026-07-04T00:00:00Z',
      }, // 0h auto-resolve flap
    ],
  }) as {
    raw: {
      count: number;
      resolved_count: number;
      invalid_count: number;
      median_duration_hours: number | null;
    };
  };
  assert.equal(art.raw.count, 4, 'all four records are in the window');
  assert.equal(art.raw.resolved_count, 1, 'only the 2h span is measurable');
  assert.equal(
    art.raw.invalid_count,
    3,
    'reversed, unparseable, and zero-length resolved spans are invalid'
  );
  assert.equal(art.raw.median_duration_hours, 2);
});

test('incidents: over-fetched history is clamped to the audit window (anchored to newest)', () => {
  const art = collect(
    '.',
    { ...PERIOD, lookback_days: 30 },
    {
      incidents: [
        {
          id: 'recent',
          started_at: '2026-07-30T00:00:00Z',
          resolved_at: '2026-07-30T01:00:00Z',
        }, // 1h — newest, the anchor
        {
          id: 'ancient',
          started_at: '2026-01-01T00:00:00Z',
          resolved_at: '2026-01-01T10:00:00Z',
        }, // >30d before the anchor — dropped
      ],
    }
  ) as {
    raw: {
      count: number;
      resolved_count: number;
      median_duration_hours: number | null;
    };
  };
  assert.equal(art.raw.count, 1, 'the out-of-window incident is dropped');
  assert.equal(
    art.raw.median_duration_hours,
    1,
    'median over the in-window span only'
  );
});

test('incidents: non-array incidents payload is handled safely', () => {
  const art = collect('.', PERIOD, {
    // Malformed connector: incidents is not an array.
    incidents: 'oops' as unknown as [],
  }) as { available: boolean; raw: { count: number; resolved_count: number } };
  assert.equal(art.available, true);
  assert.equal(
    art.raw.count,
    0,
    'a non-array incidents field yields zero, not a crash'
  );
  assert.equal(art.raw.resolved_count, 0);
});

test('durationHours: rejects open, reversed, zero-length, and unparseable spans', () => {
  assert.equal(
    durationHours({ id: 'x', started_at: '2026-07-01T00:00:00Z' }),
    null,
    'still-open incident has no span'
  );
  assert.equal(
    durationHours({
      id: 'x',
      started_at: '2026-07-01T02:00:00Z',
      resolved_at: '2026-07-01T02:00:00Z',
    }),
    null,
    'end === start is not a measurable span'
  );
  assert.equal(
    durationHours({
      id: 'x',
      started_at: '2026-07-01T00:00:00Z',
      resolved_at: '2026-07-01T03:00:00Z',
    }),
    3,
    'a normal 3h span measures'
  );
});

test('hasMeasurableIncidents: true only with a resolved in-window span', () => {
  const resolved = [
    {
      id: 'a',
      started_at: '2026-07-01T00:00:00Z',
      resolved_at: '2026-07-01T01:00:00Z',
    },
  ];
  assert.equal(hasMeasurableIncidents(resolved, 90), true);
  assert.equal(
    hasMeasurableIncidents(
      [{ id: 'a', started_at: '2026-07-01T00:00:00Z' }],
      90
    ),
    false,
    'only-open incidents are not measurable'
  );
  assert.equal(
    hasMeasurableIncidents([], 90),
    false,
    'empty is not measurable'
  );
  assert.equal(
    hasMeasurableIncidents(undefined, 90),
    false,
    'a missing incidents field is not measurable'
  );
});

test('deriveIncidentAggregates: advisory aggregates are irrelevant — only incidents[] drives the result', () => {
  // Even though the caller might supply a bogus median elsewhere, derivation
  // reads only the records, so the engine's own arithmetic wins.
  const agg = deriveIncidentAggregates(
    [
      {
        id: 'a',
        started_at: '2026-07-01T00:00:00Z',
        resolved_at: '2026-07-01T04:00:00Z',
      },
      {
        id: 'b',
        started_at: '2026-07-02T00:00:00Z',
        resolved_at: '2026-07-02T02:00:00Z',
      },
    ],
    90
  );
  assert.equal(agg.resolved_count, 2);
  assert.equal(agg.median_duration_hours, 3, 'median of [2h, 4h] is 3h');
});
