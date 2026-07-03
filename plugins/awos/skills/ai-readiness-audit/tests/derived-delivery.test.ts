/**
 * derived-delivery.test.ts — the engine-computed connector-gated headline
 * rows (Cycle time, MTTR) and the source-probe transparency lines.
 *
 * Regression anchor: barley 2026-07-02 — Jira WAS connected (994 tickets)
 * but no changelogs were fetched, and the report simultaneously said
 * "Connected: Jira via Atlassian MCP" and "Cycle time — (needs ticketing
 * connector)". Both the value and the gated note are now derived by the
 * engine from the tracker artifact, so the two sections cannot disagree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { computeDerivedDelivery } from '../audit_core.ts';
import { patchReportBlocks } from '../audit_patch.ts';
import { renderMarkdown } from '../render.ts';
import type { AuditJson } from '../render.ts';

function writeTracker(dir: string, artifact: Record<string, unknown>): string {
  const collected = join(dir, 'collected');
  mkdirSync(collected, { recursive: true });
  writeFileSync(join(collected, 'tracker.json'), JSON.stringify(artifact));
  return collected;
}

const DAY = 86_400_000;
const t0 = Date.parse('2026-06-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

test('computeDerivedDelivery: median cycle time from tickets with status history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-dd-median-'));
  try {
    const tickets = [1, 2, 10].map((days, i) => ({
      key: `T-${i}`,
      in_progress_at: iso(t0),
      resolved_at: iso(t0 + days * DAY),
    }));
    const collected = writeTracker(dir, {
      source: 'tracker',
      available: true,
      period: { source_label: 'Jira via Atlassian MCP' },
      raw: { tickets, incident_source: null },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(
      dd.cycle_time.display_value,
      '2 d',
      'median of [1, 2, 10] days must be 2 d'
    );
    assert.equal(dd.cycle_time.tickets_used, 3, 'all 3 spans must be used');
    assert.equal(
      dd.mttr.note,
      undefined,
      'no incident_source → MTTR stays at the renderer default'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: connected tracker without changelogs yields the honest note (barley 2026-07-02)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-dd-nohist-'));
  try {
    const collected = writeTracker(dir, {
      source: 'tracker',
      available: true,
      period: { source_label: 'Jira via Atlassian MCP' },
      raw: {
        tickets: [{ key: 'T-1', resolved_at: iso(t0 + DAY) }],
        incident_source: 'pagerduty',
      },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(dd.cycle_time.display_value, undefined);
    assert.equal(
      dd.cycle_time.note,
      'Jira via Atlassian MCP connected — per-ticket status history not fetched',
      'the note must name the connected system, never "needs ticketing connector"'
    );
    assert.ok(
      dd.mttr.note?.includes('pagerduty'),
      'declared incident_source must surface in the MTTR note'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: absent tracker artifact leaves both rows empty (renderer default applies)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-dd-absent-'));
  try {
    mkdirSync(join(dir, 'collected'), { recursive: true });
    const dd = computeDerivedDelivery(join(dir, 'collected'));
    assert.deepEqual(dd, { cycle_time: {}, mttr: {} });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderMarkdown: engine-derived cycle time overrides an authored gated row', () => {
  const audit: AuditJson = {
    date: '2026-07-03',
    project: 'x',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    headline: {
      delivery: [
        { label: 'Merges', display_value: '1.5 / week' },
        // Stale authored row — the model claims no connector.
        { label: 'Cycle time (In-Progress→Done)', gated: 'tracker' },
      ],
    },
    derived_delivery: {
      cycle_time: {
        display_value: '3.2 d',
        median_days: 3.2,
        tickets_used: 50,
      },
      mttr: {},
    },
    engine: { generated_by: 'audit-core' },
  };
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('3.2 d'),
    'the engine-computed median must render as the Cycle time value'
  );
  assert.ok(
    !md.includes('needs ticketing connector'),
    'the authored gated row must be replaced, not rendered alongside'
  );
});

test('renderMarkdown: Missed/limited lines carry the source-probe log', () => {
  const audit: AuditJson = {
    date: '2026-07-03',
    project: 'x',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    sources: [
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        history_available_days: 365,
      },
      {
        source: 'tracker',
        available: false,
        reason_if_absent: 'no tracker connector provided',
        history_available_days: null,
      },
    ],
    source_probes: [
      {
        source: 'tracker',
        searched: ['.mcp.json (no tracker server)', 'acli (not installed)'],
        outcome: 'unreachable',
      },
      { source: 'incident', searched: ['no incident source declared'] },
    ],
    engine: { generated_by: 'audit-core' },
  };
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes(
      'searched: .mcp.json (no tracker server); acli (not installed)'
    ),
    'the tracker Missed line must say what was probed'
  );
  assert.ok(
    md.includes('no incident source declared'),
    'a probe for a source with no sources[] row (incident) must still render'
  );
});

test('patchReportBlocks: accepts the source_probes block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-dd-probes-'));
  try {
    writeFileSync(
      join(dir, 'audit.json'),
      JSON.stringify({
        date: '2026-07-03',
        project: 'x',
        audit_total: 0,
        coverage: 0,
        dimensions: [],
        engine: { generated_by: 'audit-core' },
      })
    );
    const r = patchReportBlocks(dir, {
      source_probes: [{ source: 'tracker', searched: ['.mcp.json'] }],
    });
    assert.ok(
      r.patched.includes('source_probes'),
      'source_probes must be an accepted patch-report block'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
