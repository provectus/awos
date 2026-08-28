import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTemplate } from '../../plugins/awos/scripts/lib/template.mjs';
import { validateFills } from '../../plugins/awos/scripts/lib/validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const parsed = parseTemplate(
  fs.readFileSync(path.join(here, 'fixtures', 'mini.md'), 'utf8')
);

const VALID = {
  slots: {
    'intro.source': 'a Jira ticket',
    'notifications.body': 'Post to #team.',
    'first.body': 'Run it.',
    'first.extra': 'Then this.',
    'second.body': 'Close it.',
  },
};

const only = (fills) => validateFills(parsed, fills).join(' | ');

test('valid fills produce no errors', () => {
  assert.deepEqual(validateFills(parsed, VALID), []);
});

test('an unknown slot id is rejected', () => {
  assert.match(
    only({ slots: { ...VALID.slots, 'first.nope': 'x' } }),
    /first\.nope/,
    'an unknown slot id usually means the generator invented a slot — silently ignoring it would drop the prose it meant to write'
  );
});

test('a missing fill for a live slot is rejected', () => {
  const slots = { ...VALID.slots };
  delete slots['first.body'];
  assert.match(
    only({ slots }),
    /no fill for slot "first\.body"/,
    'pinned to the dedicated "no fill" message, not just any message that happens to mention the slot id — the string/null type-check fallback also mentions the id for an undefined value, which would let this test pass even with the presence check removed'
  );
});

test('a null fill for a non-optional slot is rejected', () => {
  assert.match(
    only({ slots: { ...VALID.slots, 'first.body': null } }),
    /not optional/i,
    'only a slot the template marks optional can be excised — otherwise the excision would tear fixed prose'
  );
});

test('a fill containing an HTML comment delimiter is rejected', () => {
  assert.match(
    only({
      slots: { ...VALID.slots, 'first.body': 'see <!-- note --> here' },
    }),
    /comment/i,
    'a comment delimiter inside a fill closes the surrounding stage marker early and breaks the rest of the file'
  );
});

test('a fill containing a stage marker is rejected', () => {
  assert.match(
    only({
      slots: { ...VALID.slots, 'first.body': 'x awos:flow:stage=fake y' },
    }),
    /stage marker/i,
    'a fill must never fabricate a stage marker — markers are the assembler’s to emit'
  );
});

test('omitting a stage the template does not mark optional is rejected', () => {
  assert.match(
    only({ ...VALID, omitStages: ['first'] }),
    /not optional/i,
    'a required stage carries contracts; omitting it must be an error, not a judgment call'
  );
});

test('omitting a section the template does not mark optional is rejected', () => {
  const p = parseTemplate(
    fs
      .readFileSync(path.join(here, 'fixtures', 'mini.md'), 'utf8')
      .replace('section=notifications optional', 'section=notifications')
  );
  assert.match(
    validateFills(p, { ...VALID, omitSections: ['notifications'] }).join(' '),
    /not optional/i,
    'a required section carries contracts; omitting it must be an error, not a judgment call'
  );
});

test('a stageOrder that is not a permutation of the kept stages is rejected', () => {
  assert.match(
    only({ ...VALID, stageOrder: ['first'] }),
    /permutation/i,
    'a partial stageOrder would silently drop stages — reordering and omitting are separate operations'
  );
});

test('an insert anchored at a stage that does not exist is rejected', () => {
  assert.match(
    only({
      ...VALID,
      insert: [{ after: 'ghost', stage: 'x', title: 'X', body: 'y' }],
    }),
    /ghost/,
    'an insert anchored at a stage the template will never emit has nowhere to splice its block'
  );
});

test('a custom override without a reason is rejected', () => {
  assert.match(
    only({ ...VALID, custom: { second: { title: 'Second', body: 'z' } } }),
    /reason/i,
    'an override is a declared deviation — an undeclared one is the silent rewrite this design removes'
  );
});

test('a stage named by more than one of omit/repeat/custom is rejected', () => {
  assert.match(
    only({
      ...VALID,
      omitStages: ['second'],
      custom: { second: { title: 'Second', body: 'z', reason: 'r' } },
    }),
    /more than one/i,
    'a stage claimed by two escape hatches at once is an ambiguous instruction, not a valid combination'
  );
});

test('a step reference to a stage that is not emitted is rejected', () => {
  const slots = { ...VALID.slots };
  delete slots['second.body'];
  assert.match(
    only({ slots, omitStages: ['second'] }),
    /step-ref|second/i,
    'omitting a stage that fixed prose points at would leave a dangling cross-reference'
  );
});

test('a fill containing the excision sentinel is rejected', () => {
  assert.match(
    only({ slots: { ...VALID.slots, 'first.body': 'x\uE000y' } }),
    /first\.body/,
    'the excision sentinel is a private-use codepoint assemble.mjs uses to mark null fills — a fill that contains it would be excised as if it were that marker, silently damaging output'
  );
});

test('an insert.stage id that collides with an existing stage is rejected', () => {
  assert.match(
    only({
      ...VALID,
      insert: [{ after: 'first', stage: 'second', title: 'X', body: 'y' }],
    }),
    /second/,
    'an insert stage id that collides with a template stage produces two stages sharing one marker id, misattributing re-run diffs'
  );
});

test('two inserts claiming the same stage id are rejected', () => {
  assert.match(
    only({
      ...VALID,
      insert: [
        { after: 'first', stage: 'extra', title: 'X', body: 'y' },
        { after: 'second', stage: 'extra', title: 'Y', body: 'z' },
      ],
    }),
    /extra/,
    'two inserts sharing one stage id collide the same way a template collision would'
  );
});

test('a repeated stage whose instances all supply a slot needs no base fill', () => {
  const slots = { ...VALID.slots };
  delete slots['second.body'];
  assert.deepEqual(
    validateFills(parsed, {
      slots,
      repeat: {
        second: [
          { label: 'staging', slots: { 'second.body': 'Close staging.' } },
        ],
      },
    }),
    [],
    'assemble.mjs merges {...fills.slots, ...instance.slots} per instance, so an instance-supplied fill is a complete substitute for a base one'
  );
});

test('a repeated stage where only some instances supply a slot, and there is no base fill, is rejected', () => {
  const slots = { ...VALID.slots };
  delete slots['second.body'];
  assert.match(
    only({
      slots,
      repeat: {
        second: [
          { label: 'staging', slots: { 'second.body': 'Close staging.' } },
          { label: 'prod', slots: {} },
        ],
      },
    }),
    /no fill for slot "second\.body"/,
    'the prod instance has neither its own fill nor a base fill to fall back on and would reach assemble with nothing to substitute'
  );
});

test('omitting an optional section drops its slot requirement entirely', () => {
  const slots = { ...VALID.slots };
  delete slots['notifications.body'];
  assert.deepEqual(
    validateFills(parsed, { slots, omitSections: ['notifications'] }),
    [],
    'a slot inside an omitted-and-optional section is not live, so it needs no fill and produces no error'
  );
});

test('an unknown slot id inside a repeat instance is rejected', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [{ label: 'staging', slots: { 'second.bdoy': 'x' } }],
      },
    }),
    /repeat instance "second#staging" names slot "second\.bdoy"/,
    "a typo in an instance override is not applied anywhere in the assembled output — assemble.mjs only substitutes keys that stage's own body actually references — so it must be rejected the same way an unknown base slot id is"
  );
});

test('a repeat instance naming a real slot that belongs to a different stage is rejected', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [{ label: 'staging', slots: { 'first.body': 'x' } }],
      },
    }),
    /repeat instance "second#staging" names slot "first\.body", which belongs to stage "first"/,
    "the instance meant to override its own stage's slot; naming a real slot from a different stage silently does nothing there either"
  );
});
