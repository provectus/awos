import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBacklog,
  generateBacklog,
  BacklogValidationError,
  kebab,
  PARALLELIZABLE_SHARE,
  type BacklogDraft,
} from '../backlog.ts';
import { makeAudit, makeDim, makeCheck, tmpDir } from './helpers.ts';

// Audit with two dimensions, three applicable checks:
//   DF-01 missing 8 (max 10, awarded 2), QA-01 missing 5 (max 5, awarded 0),
//   OK-01 missing 0 (max 4, awarded 4 — fully passed),
//   SK-01 applies:false (SKIP) — never referenceable.
function fixtureAudit() {
  return makeAudit({
    audit_total: 6,
    dimensions: [
      makeDim('delivery-flow', [
        makeCheck({ check_id: 'DF-01', weight_max: 10, weight_awarded: 2 }),
        makeCheck({ check_id: 'OK-01', weight_max: 4, weight_awarded: 4 }),
      ]),
      makeDim('quality-assurance', [
        makeCheck({
          check_id: 'QA-01',
          weight_max: 5,
          weight_awarded: 0,
          status: 'FAIL',
        }),
        makeCheck({
          check_id: 'SK-01',
          weight_max: 3,
          weight_awarded: 0,
          status: 'SKIP',
          applies: false,
        }),
      ]),
    ],
    engine: { generated_by: 'audit-core' },
  });
}

function draft(tickets: BacklogDraft['tickets']): BacklogDraft {
  return { tickets };
}

const T = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Adopt CI',
  goal: 'Faster, safer delivery',
  description: 'Add a CI pipeline with test and lint gates',
  effort_dev_days: 3,
  definition_of_done: ['CI runs on every PR'],
  depends_on: [] as string[],
  checks: [{ check_id: 'DF-01', share: 1 }],
  ...over,
});

test('coverage_delta = share × missing_weight ÷ total applicable weight', () => {
  const b = buildBacklog(fixtureAudit(), draft([T()]));
  // total applicable = 10 + 4 + 5 = 19; DF-01 missing = 8
  assert.equal(
    b.total_applicable_weight,
    19,
    'applicable weight must sum weight_max of applies:true checks only'
  );
  assert.equal(
    b.total_missing_weight,
    13,
    'missing weight must be Σ(weight_max − weight_awarded) over applicable checks'
  );
  assert.ok(
    Math.abs(b.tickets[0].coverage_delta - 8 / 19) < 1e-12,
    'coverage_delta must be share×missing ÷ applicable'
  );
  assert.equal(b.tickets[0].missing_weight_recovered, 8);
  assert.equal(b.parallelizable_share, PARALLELIZABLE_SHARE);
  assert.equal(
    b.engine.generated_by,
    'audit-core',
    'backlog must carry the engine provenance stamp'
  );
});

test('partial shares split a check without exceeding it', () => {
  const b = buildBacklog(
    fixtureAudit(),
    draft([
      T({ id: 'a', checks: [{ check_id: 'DF-01', share: 0.6 }] }),
      T({
        id: 'b',
        title: 'Harden CI',
        checks: [{ check_id: 'DF-01', share: 0.4 }],
      }),
    ])
  );
  const sum = b.tickets.reduce((s, t) => s + t.missing_weight_recovered, 0);
  assert.ok(
    Math.abs(sum - 8) < 1e-12,
    'split shares must sum to the check missing weight'
  );
});

test('Σ share > 1 for one check is rejected and names the check', () => {
  assert.throws(
    () =>
      buildBacklog(
        fixtureAudit(),
        draft([
          T({ id: 'a', checks: [{ check_id: 'DF-01', share: 0.7 }] }),
          T({ id: 'b', checks: [{ check_id: 'DF-01', share: 0.7 }] }),
        ])
      ),
    (err: BacklogValidationError) =>
      err instanceof BacklogValidationError &&
      err.violations.some((v) => v.includes('DF-01') && v.includes('1.4')),
    'over-allocated check must be a named violation'
  );
});

test('unknown, non-applicable, and fully-passed checks are violations', () => {
  const bad = draft([
    T({ id: 'a', checks: [{ check_id: 'NOPE-1', share: 1 }] }),
    T({ id: 'b', checks: [{ check_id: 'SK-01', share: 1 }] }),
    T({ id: 'c', checks: [{ check_id: 'OK-01', share: 1 }] }),
  ]);
  assert.throws(
    () => buildBacklog(fixtureAudit(), bad),
    (err: BacklogValidationError) =>
      err.violations.length === 3 &&
      err.violations.some((v) => v.includes('NOPE-1')) &&
      err.violations.some((v) => v.includes('SK-01')) &&
      err.violations.some((v) => v.includes('OK-01')),
    'all violations must be collected, not just the first'
  );
});

test('dependency cycles are rejected by name', () => {
  const cyc = draft([
    T({ id: 'a', depends_on: ['b'] }),
    T({
      id: 'b',
      depends_on: ['a'],
      checks: [{ check_id: 'QA-01', share: 1 }],
    }),
  ]);
  assert.throws(
    () => buildBacklog(fixtureAudit(), cyc),
    (err: BacklogValidationError) =>
      err.violations.some(
        (v) => /cycle/.test(v) && v.includes('a') && v.includes('b')
      )
  );
});

test('slugs are assigned in topological order, tie-broken by draft order', () => {
  const b = buildBacklog(
    fixtureAudit(),
    draft([
      T({
        id: 'late',
        title: 'Depends on both',
        depends_on: ['first', 'second'],
        checks: [{ check_id: 'DF-01', share: 0.2 }],
      }),
      T({
        id: 'first',
        title: 'Adopt CI',
        checks: [{ check_id: 'DF-01', share: 0.5 }],
      }),
      T({
        id: 'second',
        title: 'Add tests',
        checks: [{ check_id: 'QA-01', share: 1 }],
      }),
    ])
  );
  assert.deepEqual(
    b.tickets.map((t) => t.slug),
    ['A001-adopt-ci', 'A002-add-tests', 'A003-depends-on-both'],
    'topo order first, then draft order among ready nodes; slug = A<seq>-<kebab(title)>'
  );
  assert.deepEqual(
    b.tickets[2].depends_on,
    ['A001-adopt-ci', 'A002-add-tests'],
    'depends_on must be resolved to slugs'
  );
});

test('kebab slugs are lowercase, alnum-dash, ≤40 chars', () => {
  assert.equal(kebab('Adopt CI/CD — now!'), 'adopt-ci-cd-now');
  assert.equal(kebab(''), 'ticket');
  assert.ok(kebab('x'.repeat(80)).length <= 40);
});

test('malformed drafts are named violations (dup id, bad effort, empty checks)', () => {
  const bad = draft([
    T({ id: 'dup' }),
    T({ id: 'dup', title: 'Other', checks: [{ check_id: 'QA-01', share: 1 }] }),
    T({ id: 'e', effort_dev_days: 0 }),
    T({ id: 'f', checks: [] }),
  ]);
  assert.throws(
    () => buildBacklog(fixtureAudit(), bad),
    (err: BacklogValidationError) =>
      err.violations.some((v) => v.includes('dup')) &&
      err.violations.some((v) => v.includes('effort_dev_days')) &&
      err.violations.some((v) => v.includes('checks'))
  );
});

function writeAuditDir(audit: unknown): string {
  const dir = tmpDir('backlog-e2e-');
  writeFileSync(join(dir, 'audit.json'), JSON.stringify(audit, null, 2));
  return dir;
}

test('generate-backlog writes stamped backlog.json, tickets, and html', () => {
  const dir = writeAuditDir(fixtureAudit());
  const summary = generateBacklog(dir, draft([T()]));
  const bl = JSON.parse(
    readFileSync(join(dir, 'backlog', 'backlog.json'), 'utf8')
  );
  assert.equal(
    bl.engine.generated_by,
    'audit-core',
    'backlog.json must be provenance-stamped'
  );
  assert.ok(
    existsSync(join(dir, 'backlog', 'tickets', 'A001-adopt-ci.md')),
    'ticket file written'
  );
  assert.ok(
    existsSync(join(dir, 'backlog', 'backlog.html')),
    'backlog.html written'
  );
  assert.deepEqual(summary.tickets_written, ['tickets/A001-adopt-ci.md']);
  assert.ok(
    !existsSync(join(dir, 'audit.json.bak')) &&
      readFileSync(join(dir, 'audit.json'), 'utf8').includes('"audit_total"'),
    'audit.json untouched'
  );
});

test('generate-backlog refuses an unstamped audit', () => {
  const unstamped = fixtureAudit();
  delete (unstamped as unknown as Record<string, unknown>).engine;
  const dir = writeAuditDir(unstamped);
  assert.throws(
    () => generateBacklog(dir, draft([T()])),
    /provenance/,
    'unstamped audit must be refused like patch-judgment does'
  );
});

test('generate-backlog rejects a draft without a tickets array', () => {
  const dir = writeAuditDir(fixtureAudit());
  assert.throws(
    () => generateBacklog(dir, { nope: [] }),
    BacklogValidationError
  );
});
