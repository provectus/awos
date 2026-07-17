import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePrevention, annotateCoveredChecks } from '../prevention.ts';
import type { Check } from '../artifact_types.ts';
import { makeCheck, makeDim } from './helpers.ts';

// ---------------------------------------------------------------------------
// Fixture builders: one PRV pair + covered checks in a source dimension.
// ---------------------------------------------------------------------------

function enforcementCheck(overrides: Partial<Check> = {}): Check {
  return makeCheck({
    check_id: 'PRV-01',
    code: [3100],
    method: 'detected',
    cluster: 'secrets-hygiene',
    covers_checks: ['AS-05', 'AS-12'],
    prevention_kind: 'enforcement',
    weight_max: 3,
    ...overrides,
  });
}

function instructionCheck(overrides: Partial<Check> = {}): Check {
  return makeCheck({
    check_id: 'PRV-11',
    code: [3110],
    method: 'judgment',
    cluster: 'secrets-hygiene',
    prevention_kind: 'instruction',
    weight_max: 2,
    ...overrides,
  });
}

function dims(
  e: Check,
  i: Check,
  coveredOverrides: Array<Partial<Check>> = [
    { check_id: 'AS-05', status: 'PASS' },
    { check_id: 'AS-12', status: 'FAIL', weight_awarded: 0 },
  ]
) {
  return [
    makeDim(
      'application-security',
      coveredOverrides.map((o) => makeCheck({ weight_max: 3, ...o }))
    ),
    makeDim('prevention-coverage', [e, i]),
  ];
}

// ---------------------------------------------------------------------------
// Tier state machine
// ---------------------------------------------------------------------------

test('tier is enforced when the enforcement check awards weight, regardless of instruction', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'PASS', weight_awarded: 3 }),
      instructionCheck({ status: 'FAIL', weight_awarded: 0 })
    )
  )!;
  assert.equal(block.clusters.length, 1);
  assert.equal(block.clusters[0].tier, 'enforced');
  assert.equal(block.clusters[0].partial, false);
  assert.equal(block.summary.enforced, 1);
});

test('a WARN enforcement check is enforced with partial=true — a half-gate is not oversold', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'WARN', weight_awarded: 1.5 }),
      instructionCheck({ status: 'FAIL', weight_awarded: 0 })
    )
  )!;
  assert.equal(block.clusters[0].tier, 'enforced');
  assert.equal(block.clusters[0].partial, true);
});

test('tier is pending when enforcement fails and instruction is PENDING_JUDGMENT — even before verdicts', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'FAIL', weight_awarded: 0 }),
      instructionCheck({ status: 'PENDING_JUDGMENT', weight_awarded: 0 })
    )
  )!;
  assert.equal(block.clusters[0].tier, 'pending');
  assert.equal(
    block.clusters[0].unguarded_passes.length,
    0,
    'unguarded_passes is deferred while pending — the cluster may still turn out instructed'
  );
});

test('tier is instructed when only the instruction check awards weight', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'FAIL', weight_awarded: 0 }),
      instructionCheck({ status: 'PASS', weight_awarded: 2 })
    )
  )!;
  assert.equal(block.clusters[0].tier, 'instructed');
});

test('tier is absent when both halves fail; covered PASSes become unguarded_passes', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'FAIL', weight_awarded: 0 }),
      instructionCheck({ status: 'FAIL', weight_awarded: 0 })
    )
  )!;
  const cl = block.clusters[0];
  assert.equal(cl.tier, 'absent');
  assert.deepEqual(
    cl.unguarded_passes,
    ['AS-05'],
    'the passing covered check holds by convention only'
  );
  assert.equal(block.summary.unguarded_pass_count, 1);
});

// ---------------------------------------------------------------------------
// Covered-check classification
// ---------------------------------------------------------------------------

test('covered FAIL/WARN checks land in at_risk with dimension and status', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'PASS', weight_awarded: 3 }),
      instructionCheck({ status: 'PASS', weight_awarded: 2 })
    )
  )!;
  assert.deepEqual(block.clusters[0].at_risk, [
    { check_id: 'AS-12', dimension: 'application-security', status: 'FAIL' },
  ]);
  assert.equal(block.summary.at_risk_count, 1);
});

test('covered SKIP checks are ignored entirely', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'FAIL', weight_awarded: 0 }),
      instructionCheck({ status: 'FAIL', weight_awarded: 0 }),
      [
        {
          check_id: 'AS-05',
          status: 'SKIP',
          weight_awarded: 0,
          applies: false,
        },
        {
          check_id: 'AS-12',
          status: 'SKIP',
          weight_awarded: 0,
          applies: false,
        },
      ]
    )
  )!;
  assert.deepEqual(block.clusters[0].at_risk, []);
  assert.deepEqual(block.clusters[0].unguarded_passes, []);
});

test('a covers_checks entry matching no check anywhere is dropped silently', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({
        status: 'FAIL',
        weight_awarded: 0,
        covers_checks: ['AS-05', 'NOPE-99'],
      }),
      instructionCheck({ status: 'FAIL', weight_awarded: 0 }),
      [{ check_id: 'AS-05', status: 'PASS' }]
    )
  )!;
  assert.deepEqual(block.clusters[0].unguarded_passes, ['AS-05']);
});

// ---------------------------------------------------------------------------
// Degenerate inputs
// ---------------------------------------------------------------------------

test('returns null when no PRV checks exist (pre-feature audit)', () => {
  const block = computePrevention([
    makeDim('application-security', [makeCheck({ check_id: 'AS-05' })]),
  ]);
  assert.equal(
    block,
    null,
    'a pre-feature audit must carry no fabricated block'
  );
});

test('a cluster with both halves SKIP is omitted (applies_when gated off)', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'SKIP', weight_awarded: 0, applies: false }),
      instructionCheck({ status: 'SKIP', weight_awarded: 0, applies: false })
    )
  );
  assert.equal(
    block,
    null,
    'the only cluster is gated off, so the whole block is null'
  );
});

test('cluster title derives from the slug', () => {
  const block = computePrevention(
    dims(
      enforcementCheck({ status: 'PASS', weight_awarded: 3 }),
      instructionCheck({ status: 'PASS', weight_awarded: 2 })
    )
  )!;
  assert.equal(block.clusters[0].title, 'Secrets hygiene');
});

// ---------------------------------------------------------------------------
// annotateCoveredChecks
// ---------------------------------------------------------------------------

test('annotateCoveredChecks stamps prevention on covered non-SKIP checks and nothing else', () => {
  const dimensions = dims(
    enforcementCheck({ status: 'FAIL', weight_awarded: 0 }),
    instructionCheck({ status: 'FAIL', weight_awarded: 0 }),
    [
      { check_id: 'AS-05', status: 'PASS' },
      { check_id: 'AS-12', status: 'FAIL', weight_awarded: 0 },
      { check_id: 'AS-99', status: 'FAIL', weight_awarded: 0 }, // not covered
    ]
  );
  const block = computePrevention(dimensions)!;
  annotateCoveredChecks(dimensions, block);
  const appsec = dimensions[0].checks;
  assert.deepEqual(appsec[0].prevention, {
    cluster: 'secrets-hygiene',
    tier: 'absent',
  });
  assert.deepEqual(appsec[1].prevention, {
    cluster: 'secrets-hygiene',
    tier: 'absent',
  });
  assert.equal(
    appsec[2].prevention,
    undefined,
    'uncovered checks carry no annotation'
  );
  const prv = dimensions[1].checks;
  assert.equal(
    prv[0].prevention,
    undefined,
    'PRV checks themselves are never annotated'
  );
});
