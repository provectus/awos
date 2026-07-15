import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTicketMd } from '../backlog_render.ts';
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
