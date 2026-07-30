/**
 * Tests for the connector-passed incidents collector (collectors/incidents.ts).
 * Mirrors the tracker collector contract: no connector → SKIP artifact; a
 * connector → resolved-span durations and their median.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect } from '../collectors/incidents.ts';

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
