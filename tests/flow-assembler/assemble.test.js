import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../../plugins/awos/scripts/lib/assemble.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mini = fs.readFileSync(path.join(here, 'fixtures', 'mini.md'), 'utf8');
const STAMP = {
  version: '2.5.0',
  date: '2026-08-27',
  source: 'context/product/delivery-flow.md',
};

const FULL = {
  frontmatter: { description: 'Real description.', 'argument-hint': '[real]' },
  slots: {
    'intro.source': 'a Jira ticket',
    'notifications.body': 'Post to #team on merge.',
    'first.body': 'Run the thing.',
    'first.extra': 'And then the other thing.',
    'second.body': 'Close it out.',
  },
};

test('assemble copies fixed prose byte-exact', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    out.includes('This sentence is fixed prose and must survive byte-exact.'),
    'fixed prose is copied, never regenerated — this is the whole point of the assembler (issue #184)'
  );
});

test('assemble strips the generator header comment', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    !out.includes('Generator instructions'),
    'the header comment is instructions to the generator and must never appear in a generated command'
  );
});

test('assemble substitutes slots inline and as blocks', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    out.includes('Intro naming a Jira ticket inline.'),
    'an inline slot must be replaced in place, leaving the surrounding sentence intact'
  );
  assert.ok(
    out.includes('Fixed opening. Run the thing.'),
    'a slot at the end of a fixed sentence must not disturb the fixed part'
  );
  assert.ok(
    !/<awos-slot/.test(out),
    'no slot element may survive into the generated command'
  );
});

test('assemble numbers step headings over the emitted stages', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(out.includes('### Step 1: First'), 'first emitted stage is Step 1');
  assert.ok(
    out.includes('### Step 2: Second'),
    'numbering follows emission order'
  );
  assert.ok(
    !/<awos-step\/>/.test(out),
    'no step token may survive into the generated command'
  );
});

test('assemble resolves step references to the number the stage received', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    out.includes('See Step 2.'),
    'a step reference must resolve to the target stage’s emitted number, so omissions cannot leave a stale cross-reference'
  );
});

test('assemble emits plain stage markers without the optional attribute', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    out.includes('<!-- awos:flow:stage=second -->'),
    'the optional attribute is template-only — generated markers stay plain so re-run attribution is unchanged'
  );
  assert.ok(
    !out.includes('stage=second optional'),
    'the optional attribute must not leak into the generated command'
  );
});

test('assemble strips section markers while keeping the section body', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    out.includes('## Notifications'),
    'a kept section keeps its heading and body'
  );
  assert.ok(
    !out.includes('awos:flow:section'),
    'section markers are template-only and must never reach the generated command'
  );
});

test('assemble substitutes frontmatter so a renamed command gets matching metadata', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    out.startsWith('---\ndescription: Real description.\n'),
    'description comes from fills'
  );
  assert.ok(
    out.includes("argument-hint: '[real]'"),
    'argument-hint comes from fills'
  );
});

test('assemble stamps the footer marker with date, version and source', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    out
      .trimEnd()
      .endsWith(
        '<!-- awos:flow:generated date=2026-08-27 version=2.5.0 source=context/product/delivery-flow.md -->'
      ),
    'provenance is stamped mechanically — a missing or stale version stamp is what makes a re-run skip regeneration'
  );
});

test('assemble leaves no run of blank lines anywhere, with every slot filled', () => {
  const out = assemble(mini, FULL, STAMP);
  assert.ok(
    !/\n{3,}/.test(out),
    'stripping the header comment or a section marker must collapse to a single blank line, never leave a run of them'
  );
  assert.ok(
    out.includes('---\n\n# Mini Flow'),
    'exactly one blank line must separate the frontmatter fence from the preamble, once the header comment is gone'
  );
});

test('a null fill for a block slot leaves no extra blank line before the stage close marker', () => {
  const out = assemble(
    mini,
    { ...FULL, slots: { ...FULL.slots, 'first.extra': null } },
    STAMP
  );
  assert.ok(
    !/\n{3,}/.test(out),
    'excising a block slot must collapse to a single blank line, never leave a run of them'
  );
  assert.ok(
    out.includes('Fixed opening. Run the thing.\n\n<!-- /awos:flow:stage -->'),
    'excising the last slot in a stage body must leave exactly the one blank line that always separates a stage body from its close marker, not an extra one'
  );
});

test('a null fill for an optional block slot removes its paragraph cleanly', () => {
  const out = assemble(
    mini,
    { ...FULL, slots: { ...FULL.slots, 'first.extra': null } },
    STAMP
  );
  assert.ok(
    !out.includes('other thing'),
    'a null fill removes the slot content'
  );
  assert.ok(
    !/\n{3,}/.test(out),
    'excising a block slot must not leave a triple blank line behind'
  );
  assert.ok(
    out.includes('Fixed opening. Run the thing.'),
    'the neighbouring fixed prose is untouched by an excision'
  );
});

test('a null fill for an inline slot collapses whitespace instead of leaving a gap', () => {
  const src = mini.replace(
    '<awos-slot id="intro.source">the source per §1</awos-slot>',
    '<awos-slot id="intro.source" optional>the source per §1</awos-slot>'
  );
  const out = assemble(
    src,
    { ...FULL, slots: { ...FULL.slots, 'intro.source': null } },
    STAMP
  );
  assert.ok(
    out.includes('Intro naming inline.'),
    'an inline excision leaves exactly one space, not two'
  );
  assert.ok(
    !/ {2}/.test(out),
    'no double spaces may be introduced by excision'
  );
});

test('omitting an optional stage removes its markers, heading and body together', () => {
  const fills = {
    ...FULL,
    omitStages: ['second'],
    slots: { ...FULL.slots },
  };
  delete fills.slots['second.body'];
  const src = mini.replace(
    'See <awos-step-ref stage="second"/>.',
    'No ref here.'
  );
  const out = assemble(src, fills, STAMP);
  assert.ok(!out.includes('Close it out.'), 'the omitted stage body is gone');
  assert.ok(
    !out.includes('stage=second'),
    'an omitted stage leaves no marker behind — a stray marker would make re-run attribution nonsense'
  );
  assert.ok(
    out.includes('### Step 1: First'),
    'the surviving stage keeps its number'
  );
});

test('omitting a section strips its heading, body and both markers', () => {
  const fills = {
    ...FULL,
    omitSections: ['notifications'],
    slots: { ...FULL.slots },
  };
  delete fills.slots['notifications.body'];
  const out = assemble(mini, fills, STAMP);
  assert.ok(
    !out.includes('## Notifications'),
    'the omitted section heading is gone'
  );
  assert.ok(!out.includes('Post to #team'), 'the omitted section body is gone');
  assert.ok(
    !out.includes('awos:flow:section'),
    'section markers never reach the generated command, kept or omitted'
  );
});

test('excising a mid-stage block slot welds the fixed prose on either side without residue or a gap', () => {
  // first.extra sits at the very end of its stage in the shared fixture, so
  // excision residue there would be swallowed by the stage-body trim. This
  // variant puts fixed prose after the slot too, so the excised block has
  // fixed prose on both sides — the position that matters for a real
  // template, where an optional slot mid-stage is followed by more prose.
  const src = mini.replace(
    '<awos-slot id="first.extra" optional>Per §3: an omittable paragraph.</awos-slot>\n\n<!-- /awos:flow:stage -->',
    '<awos-slot id="first.extra" optional>Per §3: an omittable paragraph.</awos-slot>\n\nMonitor for the follow-up event.\n\n<!-- /awos:flow:stage -->'
  );
  const out = assemble(
    src,
    { ...FULL, slots: { ...FULL.slots, 'first.extra': null } },
    STAMP
  );
  assert.ok(
    out.includes(
      'Fixed opening. Run the thing.\n\nMonitor for the follow-up event.'
    ),
    'the prose before and after an excised mid-stage block must end up separated by exactly one blank line — no leftover sentinel, and no welding the two paragraphs together'
  );
  assert.ok(
    !/\n{3,}/.test(out),
    'excising a mid-stage block slot must not leave a run of blank lines behind either'
  );
});

test('repeat emits one labelled instance per entry with identical fixed prose', () => {
  const out = assemble(
    mini,
    {
      ...FULL,
      repeat: {
        second: [
          { label: 'staging', slots: { 'second.body': 'Deploy to staging.' } },
          { label: 'prod', slots: { 'second.body': 'Deploy to prod.' } },
        ],
      },
    },
    STAMP
  );
  assert.ok(out.includes('<!-- awos:flow:stage=second#staging -->'));
  assert.ok(out.includes('<!-- awos:flow:stage=second#prod -->'));
  assert.ok(out.includes('### Step 2: Second — staging'));
  assert.ok(out.includes('### Step 3: Second — prod'));
  assert.ok(
    out.includes('Deploy to staging.') && out.includes('Deploy to prod.'),
    'each instance carries its own slot fills — this is what covers multi-environment deploys without retyping the stage'
  );
});

test('insert places a new model-authored stage at its anchor and numbers it', () => {
  const out = assemble(
    mini,
    {
      ...FULL,
      insert: [
        {
          after: 'first',
          stage: 'canary',
          title: 'Canary Watch',
          body: 'Watch the canary.',
        },
      ],
    },
    STAMP
  );
  assert.ok(
    out.includes('### Step 2: Canary Watch'),
    'an inserted stage lands after its anchor'
  );
  assert.ok(
    out.includes('<!-- awos:flow:stage=canary -->'),
    'an inserted stage gets real markers'
  );
  assert.ok(
    out.includes('### Step 3: Second'),
    'stages after the insertion renumber'
  );
});

test('custom replaces a template stage wholesale but keeps its markers', () => {
  const out = assemble(
    mini,
    {
      ...FULL,
      custom: {
        second: {
          title: 'Second',
          body: 'Entirely different.',
          reason: 'skeleton did not fit',
        },
      },
    },
    STAMP
  );
  assert.ok(out.includes('Entirely different.'));
  assert.ok(
    !out.includes('Close it out.'),
    'the template body is replaced, not appended to'
  );
  assert.ok(
    out.includes('<!-- awos:flow:stage=second -->'),
    'an overridden stage keeps its markers so re-run attribution still works on it'
  );
});

test('stageOrder reorders stages and renumbers headings and refs together', () => {
  const out = assemble(
    mini,
    { ...FULL, stageOrder: ['second', 'first'] },
    STAMP
  );
  assert.ok(
    out.includes('### Step 1: Second'),
    'the reordered stage takes the first number'
  );
  assert.ok(out.includes('### Step 2: First'));
  assert.ok(
    out.includes('See Step 1.'),
    'a step reference follows the reorder — this is the change-request-first review move'
  );
  assert.ok(
    out.indexOf('stage=second') < out.indexOf('stage=first'),
    'emission order follows stageOrder'
  );
});
