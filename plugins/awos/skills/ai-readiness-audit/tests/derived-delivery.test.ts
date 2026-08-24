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
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { computeDerivedDelivery } from '../audit_core.ts';
import { patchReportBlocks, reportContext } from '../audit_patch.ts';
import { renderMarkdown } from '../render.ts';
import type { AuditJson } from '../render.ts';
import { tmpDir } from './helpers.ts';

function writeTracker(dir: string, artifact: Record<string, unknown>): string {
  const collected = join(dir, 'collected');
  mkdirSync(collected, { recursive: true });
  writeFileSync(join(collected, 'tracker.json'), JSON.stringify(artifact));
  return collected;
}

function writeIncidents(
  dir: string,
  artifact: Record<string, unknown>
): string {
  const collected = join(dir, 'collected');
  mkdirSync(collected, { recursive: true });
  writeFileSync(join(collected, 'incidents.json'), JSON.stringify(artifact));
  return collected;
}

const DAY = 86_400_000;
const t0 = Date.parse('2026-06-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

test('computeDerivedDelivery: median cycle time from tickets with status history', () => {
  const dir = tmpDir('awos-dd-median-');
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
  const dir = tmpDir('awos-dd-nohist-');
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
    assert.equal(
      dd.mttr.note,
      undefined,
      'a tracker that merely names an incident_source is not incident data — the MTTR headline stays at the renderer default; only a real incidents artifact fills it'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: a real incidents artifact fills the MTTR headline value', () => {
  const dir = tmpDir('awos-dd-mttr-');
  try {
    const collected = writeIncidents(dir, {
      source: 'incidents',
      available: true,
      period: { lookback_days: 90 },
      raw: {
        // Records only — the engine derives the median (spans 1h, 3h → 2h).
        incidents: [
          { id: 'A', started_at: iso(t0), resolved_at: iso(t0 + 3_600_000) },
          {
            id: 'B',
            started_at: iso(t0 + DAY),
            resolved_at: iso(t0 + DAY + 3 * 3_600_000),
          },
        ],
        source_label: 'PagerDuty',
      },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(
      dd.mttr.measured?.display_value,
      '2 h',
      'the headline shows the engine-derived median recovery time'
    );
    assert.equal(dd.mttr.measured?.incidents_used, 2);
    assert.equal(
      dd.mttr.measured?.band,
      'high',
      'the measured MTTR carries its DORA band like every sibling delivery row'
    );
    assert.equal(
      dd.mttr.measured?.check_id,
      'DF-07',
      'the measured MTTR carries its check_id so the rendered row resolves a definition tooltip'
    );
    assert.equal(
      dd.mttr.note,
      undefined,
      'a measured value carries no gated note'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: absent tracker artifact leaves both rows empty (renderer default applies)', () => {
  const dir = tmpDir('awos-dd-absent-');
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
  const dir = tmpDir('awos-dd-probes-');
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

test('computeDerivedDelivery: an unusable part of the sample shows in the MTTR value', () => {
  const dir = tmpDir('awos-dd-mttr-partial-');
  try {
    // Both renderers print `note` only when the VALUE is absent, so a median
    // over a partly-unusable sample would otherwise print a bare "1 h" with
    // the "(of N resolved; M lacked a parseable span)" caveat unreachable.
    const collected = writeIncidents(dir, {
      source: 'incidents',
      available: true,
      period: { lookback_days: 90 },
      raw: {
        incidents: [
          { id: 'A', started_at: iso(t0), resolved_at: iso(t0 + 3_600_000) },
          // Reversed span — resolved, but not measurable.
          { id: 'B', started_at: iso(t0 + DAY), resolved_at: iso(t0) },
          // Zero-length span — an auto-resolved flap.
          { id: 'C', started_at: iso(t0 + DAY), resolved_at: iso(t0 + DAY) },
        ],
        source_label: 'PagerDuty',
      },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(
      dd.mttr.measured?.display_value,
      '1 h (1 of 3)',
      'the headline value must carry the sample size when part of the sample was unusable'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderMarkdown: the measured MTTR row renders with its band', () => {
  // The only derived_delivery fixture in the tree had `mttr: {}`, so deleting
  // the display_value spread left every suite green. This pins the row end to
  // end — value AND band, the cell that was blank in a "vs DORA bands" block.
  const audit: AuditJson = {
    date: '2026-07-03',
    project: 'x',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    headline: {
      delivery: [{ label: 'Merges', display_value: '1.5 / week' }],
    },
    derived_delivery: {
      cycle_time: {},
      mttr: {
        measured: {
          display_value: '2 h',
          median_hours: 2,
          incidents_used: 2,
          band: 'high',
          check_id: 'DF-07',
        },
      },
    },
    engine: { generated_by: 'audit-core' },
  };
  const md = renderMarkdown(audit);
  const row = md
    .split('\n')
    .find((l) => l.includes('| MTTR') || l.startsWith('| MTTR'));
  assert.ok(row, 'the delivery table must carry an MTTR row');
  assert.match(
    row!,
    /2 h/,
    'the measured MTTR value must reach the rendered row'
  );
  assert.match(
    row!,
    /high/,
    'the measured MTTR row must carry its DORA band, like every sibling row'
  );
});

test('computeDerivedDelivery: a corrupt incidents artifact is reported as unreadable, not absent', () => {
  // A truncated write used to land in the same catch as a missing file and
  // render "— (needs incident connector)", sending the reader to re-run
  // connector setup — while audit.sources in the same audit.json already said
  // the artifact was unreadable. enrich never rewrites the file, so the wrong
  // diagnosis persists across re-runs.
  const dir = tmpDir('awos-dd-mttr-corrupt-');
  try {
    const collected = join(dir, 'collected');
    mkdirSync(collected, { recursive: true });
    writeFileSync(
      join(collected, 'incidents.json'),
      '{"source":"incidents","available":true,"raw":{"incidents":[{"id"'
    );
    const dd = computeDerivedDelivery(collected);
    assert.match(
      dd.mttr.note ?? '',
      /unreadable/,
      'a present-but-unparseable incidents artifact must be named as unreadable'
    );
    assert.equal(
      dd.mttr.measured?.display_value,
      undefined,
      'no value can be derived from an unreadable artifact'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: a genuinely absent incidents artifact leaves the row empty', () => {
  // The gated fallback is the honest state here — no connector, no note.
  const dir = tmpDir('awos-dd-mttr-absent-');
  try {
    const collected = join(dir, 'collected');
    mkdirSync(collected, { recursive: true });
    const dd = computeDerivedDelivery(collected);
    assert.deepEqual(
      dd.mttr,
      {},
      'an absent artifact must leave the MTTR row empty for the renderer gated fallback'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reportContext: the incident label comes from the incidents artifact, not the tracker', () => {
  // reportContext only ever opened git and tracker, so it read the label off
  // tracker.raw.incident_source. Post-DF-07 that inverts the signal: a real
  // connector with no tracker declaration handed the narrative author null
  // while MTTR scored maximal, and a tracker merely naming a system handed
  // over that name while 1103 stayed SKIP.
  const dir = tmpDir('awos-report-ctx-label-');
  try {
    const collected = join(dir, 'collected');
    mkdirSync(collected, { recursive: true });
    writeFileSync(
      join(collected, 'incidents.json'),
      JSON.stringify({
        source: 'incidents',
        available: true,
        raw: { incidents: [], source_label: 'PagerDuty' },
      })
    );
    // Tracker declares a DIFFERENT system, and no incident data behind it.
    writeFileSync(
      join(collected, 'tracker.json'),
      JSON.stringify({
        source: 'tracker',
        available: true,
        raw: { tickets: [], incident_source: 'opsgenie' },
      })
    );
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
    const ctx = reportContext(dir) as Record<string, unknown>;
    assert.equal(
      ctx.incident_source_label,
      'PagerDuty',
      'the label must come from the incidents artifact, which is what actually produces the MTTR value'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: all-open incidents get the no-resolved-span note', () => {
  // Neither MTTR honest-state string was asserted anywhere: both could be
  // swapped or emptied with the suite green, while the cycle_time twin a few
  // lines up has had a named regression test since the mechanism was built.
  const dir = tmpDir('awos-dd-mttr-open-');
  try {
    const collected = writeIncidents(dir, {
      source: 'incidents',
      available: true,
      period: { lookback_days: 90 },
      raw: {
        incidents: [
          { id: 'A', started_at: iso(t0) },
          { id: 'B', started_at: iso(t0 + DAY) },
        ],
        source_label: 'PagerDuty',
      },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(
      dd.mttr.note,
      'PagerDuty connected — all 2 in-window incidents are still open (no resolved recovery span); if unexpected, resolved_at is likely mapped from the wrong field',
      'an all-open batch is a likely resolved_at mapping miss and must say so — "no incident with a resolved recovery span" asserted every incident is open without naming why'
    );
    assert.equal(
      dd.mttr.measured,
      undefined,
      'no measured block when nothing is measurable'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: an empty incidents batch gets the no-incidents note', () => {
  const dir = tmpDir('awos-dd-mttr-empty-');
  try {
    const collected = writeIncidents(dir, {
      source: 'incidents',
      available: true,
      period: { lookback_days: 90 },
      raw: { incidents: [], source_label: 'PagerDuty' },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(
      dd.mttr.note,
      'PagerDuty connected — no incidents in window',
      'a connected source with no incidents at all is a different state from one with unmeasurable incidents'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: resolved-but-unparseable spans get the unparseable note', () => {
  // Third arm of the shared note builder: every record HAS a resolved_at but
  // no span parses (end <= start is rejected). Distinct diagnosis from the
  // all-open batch — here the mapping is right and the timestamps are wrong.
  const dir = tmpDir('awos-dd-mttr-invalid-');
  try {
    const collected = writeIncidents(dir, {
      source: 'incidents',
      available: true,
      period: { lookback_days: 90 },
      raw: {
        incidents: [
          { id: 'A', started_at: iso(t0), resolved_at: iso(t0) },
          { id: 'B', started_at: iso(t0 + DAY), resolved_at: iso(t0) },
        ],
        source_label: 'PagerDuty',
      },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(
      dd.mttr.note,
      'PagerDuty connected — 2 incidents but none had a parseable recovery span (2 unparseable)',
      'a batch of resolved-but-unmeasurable incidents must be reported as unparseable spans, not as still-open incidents'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeDerivedDelivery: period.source_label alone names the source in the MTTR note', () => {
  // The recipe's one canonical write site is period.source_label, like every
  // sibling connector; the dual raw.source_label write is back-compat only.
  // An artifact written per the recipe must not degrade to "incident source".
  const dir = tmpDir('awos-dd-mttr-label-');
  try {
    const collected = writeIncidents(dir, {
      source: 'incidents',
      available: true,
      period: { lookback_days: 90, source_label: 'PagerDuty' },
      raw: { incidents: [] },
    });
    const dd = computeDerivedDelivery(collected);
    assert.equal(
      dd.mttr.note,
      'PagerDuty connected — no incidents in window',
      'period.source_label must reach the MTTR note without a duplicate raw.source_label write'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
