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
