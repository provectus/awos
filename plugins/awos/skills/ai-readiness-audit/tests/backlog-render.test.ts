import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTicketMd, renderBacklogHtml } from '../backlog_render.ts';
import { REPORT_CSS } from '../render.ts';
import type { BacklogJson } from '../backlog.ts';

const backlog: BacklogJson = {
  date: '2026-07-15',
  project: 'demo',
  audit_total: 6,
  coverage: 0.32,
  total_applicable_weight: 19,
  total_missing_weight: 13,
  parallelizable_share: 0.8,
  engine: { generated_by: 'audit-core' },
  tickets: [
    {
      slug: 'A001-adopt-ci',
      seq: 1,
      temp_id: 'a',
      title: 'Adopt CI',
      goal: 'Faster, safer delivery',
      description: 'Add CI with test and lint gates',
      effort_dev_days: 3,
      definition_of_done: ['CI runs on every PR'],
      depends_on: [],
      checks: [
        {
          check_id: 'DF-01',
          dimension: 'delivery-flow',
          share: 0.6,
          missing_weight: 8,
          contribution: 4.8,
        },
      ],
      missing_weight_recovered: 4.8,
      coverage_delta: 4.8 / 19,
    },
    {
      slug: 'A002-harden-ci',
      seq: 2,
      temp_id: 'b',
      title: 'Harden CI',
      goal: 'Robust pipelines',
      description: 'Add flaky-test quarantine',
      effort_dev_days: 2,
      definition_of_done: ['Quarantine list wired'],
      depends_on: ['A001-adopt-ci'],
      checks: [
        {
          check_id: 'DF-01',
          dimension: 'delivery-flow',
          share: 0.4,
          missing_weight: 8,
          contribution: 3.2,
        },
      ],
      missing_weight_recovered: 3.2,
      coverage_delta: 3.2 / 19,
    },
  ],
};

test('ticket md carries all Jira-style fields', () => {
  const md = renderTicketMd(backlog, backlog.tickets[1]);
  assert.match(md, /^# A002-harden-ci — Harden CI/m, 'H1 must be slug — title');
  assert.match(md, /2 d\/dev/, 'effort in d/dev');
  assert.match(md, /\+16\.8%/, 'coverage delta as +X.X% (3.2/19)');
  assert.match(
    md,
    /\[A001-adopt-ci\]\(A001-adopt-ci\.md\)/,
    'dependency links to sibling ticket file'
  );
  assert.match(md, /DF-01 \(40%\)/, 'covered checks show share');
  assert.match(md, /## Goal\n+Robust pipelines/, 'Goal section');
  assert.match(
    md,
    /## Definition of Done\n+- \[ \] Quarantine list wired/,
    'DoD as checkboxes'
  );
  assert.match(
    md,
    /\/awos:spec/,
    'footer names the /awos:spec conversion path'
  );
});

test('ticket without dependencies renders an em dash', () => {
  const md = renderTicketMd(backlog, backlog.tickets[0]);
  assert.match(md, /Depends on.*—/, 'no-deps row shows —');
});

test('backlog.html is a self-contained interactive page', () => {
  const html = renderBacklogHtml(backlog);
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<title>Improvement Backlog — demo — 2026-07-15<\/title>/);
  assert.ok(
    html.includes(REPORT_CSS.slice(0, 200)),
    'must embed the shared Provectus stylesheet'
  );
  assert.match(html, /id="backlog-data"/, 'embeds the backlog JSON');
  assert.match(html, /id="devs"/, 'ribbon has the developers input');
  assert.match(html, /id="rb-effort"/, 'ribbon shows effort');
  assert.match(html, /id="rb-duration"/, 'ribbon shows duration');
  assert.match(html, /id="rb-coverage"/, 'ribbon shows coverage gain');
  assert.match(html, /id="enable-all"/, 'ribbon has enable-all');
  assert.match(
    html,
    /class="ribbon-warning"/,
    'always-visible scaling warning row'
  );
  assert.match(html, /Amdahl/, 'warning names the scaling model');
  assert.match(html, /<details class="legend"/, 'collapsible legend');
  assert.match(html, /data-slug="A001-adopt-ci"/, 'graph node per ticket');
  assert.match(html, /data-slug="A002-harden-ci"/);
  assert.match(
    html,
    /1\/\(\(1−0\.8\)\+0\.8\/n\)|1\/\(\(1-P\)\+P\/n\)/,
    'duration tooltip carries the formula'
  );
  assert.doesNotMatch(html, /src="http/, 'no external scripts');
});

test('graph layers follow topological depth', () => {
  // Scope to the graph region: both slugs also appear earlier in the embedded
  // JSON island, so comparing whole-document indices would pass on JSON array
  // order alone and stay green even if the layer computation were broken.
  const html = renderBacklogHtml(backlog);
  const graph = html.slice(html.indexOf('<div id="graph">'));
  const l1 = graph.indexOf('id="node-A001-adopt-ci"');
  const l2 = graph.indexOf('id="node-A002-harden-ci"');
  assert.ok(
    l1 !== -1 && l2 !== -1 && l1 < l2,
    'dependency-free ticket renders in an earlier graph layer than its dependent'
  );
});

test('embedded JSON escapes </script>', () => {
  const evil = structuredClone(backlog);
  evil.tickets[0].description = 'x</script><script>alert(1)</script>';
  const html = renderBacklogHtml(evil);
  assert.doesNotMatch(html, /x<\/script><script>alert/, 'JSON must escape </');
});
