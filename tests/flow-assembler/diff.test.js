import test from 'node:test';
import assert from 'node:assert/strict';
import { diffStages } from '../../plugins/awos/scripts/lib/diff.mjs';

const gen = (firstBody, secondBody = 'two') => `---
description: d
---

Preamble prose.

<!-- awos:flow:stage=first -->

### Step 1: First

${firstBody}

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=second -->

### Step 2: Second

${secondBody}

<!-- /awos:flow:stage -->
`;

test('a missing baseline is reported as a state, not an error', () => {
  assert.deepEqual(
    diffStages(gen('one'), null),
    { baseline: 'absent' },
    'the first re-run after upgrading has no baseline — Step 6 falls back to the decision-record comparison, so this must not throw'
  );
});

test('an unedited command reports every stage unchanged', () => {
  const report = diffStages(gen('one'), gen('one'));
  assert.equal(
    report.preamble,
    'unchanged',
    'identical generated and baseline text must not be reported as a preamble edit'
  );
  assert.deepEqual(
    report.stages.map((s) => s.status),
    ['unchanged', 'unchanged'],
    'a byte-identical re-run must not flag any stage as edited or absent'
  );
});

test('a hand-edited stage is reported edited, and only that stage', () => {
  const report = diffStages(gen('one, plus a local tweak'), gen('one'));
  assert.deepEqual(
    report.stages.map((s) => [s.id, s.status]),
    [
      ['first', 'edited'],
      ['second', 'unchanged'],
    ],
    'attribution must be exact — this replaces the inference that dropped a manual edit in #182'
  );
});

test('a stage deleted by hand is reported absent', () => {
  const generated = gen('one').replace(
    /<!-- awos:flow:stage=second -->[\s\S]*?<!-- \/awos:flow:stage -->\n/,
    ''
  );
  const report = diffStages(generated, gen('one'));
  assert.deepEqual(
    report.stages.find((s) => s.id === 'second'),
    { id: 'second', status: 'absent' },
    'a stage present in the baseline but missing from the generated file was deleted by hand, not merely edited — it must be reported "absent"'
  );
});

test('an edit to prose outside the stage markers is reported on the preamble', () => {
  const report = diffStages(
    gen('one').replace('Preamble prose.', 'Preamble prose, edited.'),
    gen('one')
  );
  assert.equal(
    report.preamble,
    'edited',
    'prose outside the markers is generator-owned, so an edit there must be surfaced rather than silently rewritten'
  );
});

test('a repeated stage attributes each #label instance independently', () => {
  const repeated = (stagingBody, prodBody) => `---
description: d
---

Preamble prose.

<!-- awos:flow:stage=delivery#staging -->

### Step 1: Deploy staging

${stagingBody}

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=delivery#prod -->

### Step 2: Deploy prod

${prodBody}

<!-- /awos:flow:stage -->
`;

  const report = diffStages(
    repeated('deploy to staging, with a local tweak', 'deploy to prod'),
    repeated('deploy to staging', 'deploy to prod')
  );
  assert.deepEqual(
    report.stages.map((s) => [s.id, s.status]),
    [
      ['delivery#staging', 'edited'],
      ['delivery#prod', 'unchanged'],
    ],
    'each repeated instance is its own stage id — editing one must not mark the other'
  );
});
