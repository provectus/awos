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

const only = (fills, context) =>
  validateFills(parsed, fills, context).join(' | ');

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

// The check used to reject ANY occurrence of "<!--"/"-->" in a fill, which
// false-positived on a fill legitimately mentioning an existing marker
// convention (the `<!-- skip-tests: true -->` opt-out both templates
// document). It now rejects only an UNBALANCED delimiter count — a stray,
// unclosed comment actually breaks the file — plus the stage/section
// marker shapes below, which are checked separately and are stricter.
test('a fill containing an unbalanced HTML comment delimiter is rejected', () => {
  assert.match(
    only({
      slots: { ...VALID.slots, 'first.body': 'see <!-- note here' },
    }),
    /unbalanced/i,
    'a stray, unclosed "<!--" breaks the comment structure of everything that follows it in the assembled file'
  );
});

test('a fill mentioning an existing marker convention in a complete, balanced comment is accepted', () => {
  assert.deepEqual(
    validateFills(parsed, {
      slots: {
        ...VALID.slots,
        'first.body': 'Honor the `<!-- skip-tests: true -->` marker.',
      },
    }),
    [],
    'both templates document this exact marker in their own fixed prose — a fill quoting it is not a hazard, only a fill fabricating an awos:flow:stage/section marker or leaving a delimiter unbalanced is'
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

test('a fill containing a section marker is rejected', () => {
  assert.match(
    only({
      slots: { ...VALID.slots, 'first.body': 'x awos:flow:section=fake y' },
    }),
    /section marker/i,
    'a fill must never fabricate a section marker either — the same hazard as a stage marker, just the other construct'
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

// Content checks used to be run only against slot fills — assemble.mjs
// writes insert.body/insert.title and custom.body/custom.title into the
// output with no check of its own, so either hatch was a way to smuggle a
// fabricated stage marker or an unbalanced comment past validateFills
// entirely.

test('an insert body containing a stage marker is rejected', () => {
  assert.match(
    only({
      ...VALID,
      insert: [
        {
          after: 'first',
          stage: 'canary',
          title: 'Canary Watch',
          body: 'Watch the canary.\n<!-- /awos:flow:stage -->\nThen promote.',
        },
      ],
    }),
    /stage marker/i,
    "an embedded stage-close marker inside an insert body corrupts every later diff's stage count exactly as it would coming from a slot fill"
  );
});

test('an insert title containing the excision sentinel is rejected', () => {
  assert.match(
    only({
      ...VALID,
      insert: [{ after: 'first', stage: 'canary', title: 'xy', body: 'ok' }],
    }),
    /sentinel/i,
    'the sentinel check must cover an insert title too, not just its body or a slot fill'
  );
});

test('a custom override body containing a stage marker is rejected', () => {
  assert.match(
    only({
      ...VALID,
      custom: {
        second: {
          title: 'Deliver',
          body: 'Ship it. <!-- awos:flow:stage=evil --> done.',
          reason: 'r',
        },
      },
    }),
    /stage marker/i,
    'a fabricated stage-open marker inside a custom override body would look like a real one to diff.mjs, the same hazard a slot fill or an insert body carries'
  );
});

test('an insert.stage id that is not lowercase kebab-case is rejected', () => {
  assert.match(
    only({
      ...VALID,
      insert: [
        { after: 'first', stage: 'Canary Watch', title: 'X', body: 'y' },
      ],
    }),
    /kebab-case/,
    "diff.mjs's STAGE_RE only matches [a-z0-9#-]+ — an insert stage id outside that shape makes the stage vanish from every future diff report, and a hand-edit inside it is silently overwritten on the next re-run"
  );
});

test('an insert.stage id shaped like a repeat-instance marker id is rejected', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [
          { label: 'staging', slots: {} },
          { label: 'prod', slots: {} },
        ],
      },
      insert: [{ after: 'first', stage: 'second#prod', title: 'X', body: 'y' }],
    }),
    /kebab-case/,
    'assemble.mjs would otherwise write the marker id "second#prod" verbatim — identical to the real repeat instance\'s own marker id — and diffStages\'s Map.set on that id keeps only the last, silently dropping one of them; forbidding "#" in the kebab shape makes this collision impossible to construct'
  );
});

test('an insert.stage id may reuse a template stage id that is fully repeated away, since that bare id is never emitted', () => {
  assert.deepEqual(
    validateFills(parsed, {
      ...VALID,
      repeat: { second: [{ label: 'staging', slots: {} }] },
      insert: [{ after: 'first', stage: 'second', title: 'X', body: 'y' }],
    }),
    [],
    'assemble.mjs emits a repeated stage as "${id}#${label}" instances only — it never emits the bare id "second" once repeat claims it — so checking against the ids assemble will actually emit (not the template\'s full stage list, which the old `stageById[ins.stage]` check used) lets an insert safely reuse that now-unused bare id'
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

test('a repeat instance label that is not lowercase kebab-case is rejected', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [{ label: 'Prod EU', slots: {} }],
      },
    }),
    /repeat instance #1 of stage "second" has label "Prod EU", which must be lowercase kebab-case/,
    'assemble.mjs builds the marker id as `${stage.id}#${inst.label}` verbatim — a space or another "#" in the label either breaks diff.mjs\'s STAGE_RE outright (the stage silently vanishes from the diff report) or manufactures a colliding marker id, so this must be caught before the fill ever reaches assemble.mjs'
  );
});

test('two repeat instances on the same stage sharing a label are rejected', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [
          { label: 'prod', slots: {} },
          { label: 'prod', slots: {} },
        ],
      },
    }),
    /stage "second" has more than one repeat instance labelled "prod"/,
    'assemble.mjs would emit two markers with the identical id "second#prod", and diffStages\'s Map.set on that id keeps only the last — the first instance, and any hand-edit inside it, would silently disappear from the diff report'
  );
});

// The next four tests all use VALID as-is (which already fills
// second.body at the base level) and add a repeat instance that ALSO
// overrides second.body — the shape that let bad content slip through
// content checks were only ever run against the base value.

test('an unbalanced comment delimiter in a repeat instance override is rejected even when a base fill exists', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [
          {
            label: 'staging',
            slots: { 'second.body': 'see <!-- note here' },
          },
        ],
      },
    }),
    /unbalanced/i,
    "assemble.mjs uses the instance's own value for the staging block, not the base fill — the base being clean does not make the instance's value clean"
  );
});

test('a stage marker in a repeat instance override is rejected even when a base fill exists', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [
          {
            label: 'staging',
            slots: { 'second.body': 'x awos:flow:stage=fake y' },
          },
        ],
      },
    }),
    /stage marker/i,
    'an instance override is just as capable of fabricating a stage marker as a base fill is'
  );
});

test('the excision sentinel in a repeat instance override is rejected even when a base fill exists', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [{ label: 'staging', slots: { 'second.body': 'x\uE000y' } }],
      },
    }),
    /second\.body/,
    "an instance override carrying the sentinel would be excised in that instance's block the same way a base fill carrying it would be"
  );
});

test('a null override for a non-optional slot in a repeat instance is rejected even when a base fill exists', () => {
  assert.match(
    only({
      ...VALID,
      repeat: {
        second: [{ label: 'staging', slots: { 'second.body': null } }],
      },
    }),
    /not optional/i,
    'second.body is not optional in the template; an instance cannot excise it any more than the base fill could'
  );
});

test('a repeat with zero instances on a stage the template does not mark optional is rejected', () => {
  assert.match(
    only({ ...VALID, repeat: { first: [] } }),
    /has zero repeat instances/i,
    'assemble.mjs emits the stage zero times for zero instances — the same silent omission omitStages rejects, just reached through a different fill shape'
  );
});

test('a repeat with zero instances on an optional stage is caught as a dangling step-ref, not left to assemble', () => {
  const slots = { ...VALID.slots };
  delete slots['second.body'];
  assert.match(
    only({ slots, repeat: { second: [] } }),
    /step-ref|second/i,
    'stage "second" is optional so the zero-instance omission itself is not an error, but the fixed prose that step-refs it now dangles — validation must catch this before assemble throws on it'
  );
});

// A newline in a frontmatter value cannot be quoted around in YAML — no
// quoting style keeps a multi-line value on the field's one physical line.
// assemble.mjs's quoting had no defense against this at all; the check has
// to live in validateFills, before assemble ever runs.

test('a frontmatter description containing a newline is rejected', () => {
  assert.match(
    only({ ...VALID, frontmatter: { description: 'line one\nline two' } }),
    /frontmatter\.description.*newline/i,
    "a newline in the description breaks the YAML frontmatter block's parse — or worse, reads as an injected second key on the next line"
  );
});

test('a frontmatter argument-hint containing a newline is rejected', () => {
  assert.match(
    only({
      ...VALID,
      frontmatter: { 'argument-hint': '[a]\nmalicious: true' },
    }),
    /frontmatter\.argument-hint.*newline/i,
    'the same hazard applies to argument-hint — both frontmatter fields need the same guard'
  );
});

test('a frontmatter value containing a colon-space is accepted by validation (assemble is what quotes it)', () => {
  assert.deepEqual(
    validateFills(parsed, {
      ...VALID,
      frontmatter: {
        description:
          'Deliver one Linear issue end to end: spec, implement, verify, review, merge, close.',
      },
    }),
    [],
    'a colon-space is a YAML quoting hazard, not a rejected value — assemble.mjs quotes it, validateFills only rejects what quoting cannot fix (a newline)'
  );
});

// The migration gate: the caller sets context.migrationGate when --out
// already names a file with no baseline to diff against (an install that
// predates the assembler). flow.md Step 6 item 2's on-disk-read fallback
// used to be satisfiable by doing nothing — a model could see
// {"baseline":"absent"} and go straight to writing fills without ever
// opening the existing file. fills.migrationReview forces that fallback to
// leave a trace: one non-empty entry per kept stage (mini.md's template
// keeps "first" and "second" here, since VALID omits neither).

test('the migration gate is off by default, even with no migrationReview fill', () => {
  assert.deepEqual(
    validateFills(parsed, VALID, { migrationGate: false }),
    [],
    'a fresh install or a normal re-run (baseline present) must never require this fill — only the caller setting migrationGate turns the requirement on'
  );
});

test('the migration gate rejects a run with no migrationReview fill at all', () => {
  assert.match(
    only({ ...VALID }, { migrationGate: true }),
    /migrationReview/,
    'an omitted fills.migrationReview is not an acknowledgement — the gate must name the missing fill'
  );
});

test('the migration gate rejects an empty migrationReview object', () => {
  const errors = validateFills(
    parsed,
    { ...VALID, migrationReview: {} },
    { migrationGate: true }
  );
  assert.match(errors.join(' | '), /"first"/);
  assert.match(errors.join(' | '), /"second"/);
  errors.forEach((e) => assert.match(e, /no acknowledgement/));
});

test('the migration gate rejects an empty-string acknowledgement for one stage while accepting the other', () => {
  const errors = validateFills(
    parsed,
    { ...VALID, migrationReview: { first: '  ', second: 'none' } },
    { migrationGate: true }
  );
  assert.equal(
    errors.length,
    1,
    'only "first" is missing a real acknowledgement'
  );
  assert.match(
    errors[0],
    /"first"/,
    'an all-whitespace value is not an acknowledgement, so it is rejected the same as an empty string'
  );
});

test('the migration gate rejects migrationReview naming a stage this run does not keep', () => {
  assert.match(
    only(
      {
        ...VALID,
        migrationReview: { first: 'none', second: 'none', ghost: 'none' },
      },
      { migrationGate: true }
    ),
    /"ghost".*not a stage this run keeps/,
    'a made-up stage id must not silently pass as an acknowledgement'
  );
});

test('the migration gate rejects a non-object migrationReview', () => {
  assert.match(
    only({ ...VALID, migrationReview: 'none' }, { migrationGate: true }),
    /migrationReview/,
    'a bare string cannot name which stage it acknowledges'
  );
});

test('the migration gate is satisfied by a non-empty entry for every kept stage, including the literal "none"', () => {
  assert.deepEqual(
    validateFills(
      parsed,
      {
        ...VALID,
        migrationReview: {
          first: 'carried forward a retry flag from the old stage',
          second: 'none',
        },
      },
      { migrationGate: true }
    ),
    [],
    'a deliberate "none" is as valid an acknowledgement as a real finding — the gate checks that the fallback ran, not what it found'
  );
});

// fills.json is model-authored, so a container can arrive with the wrong
// type entirely. validateFills' job is to hand back a readable list of
// what is wrong with the fills; a TypeError out of the middle of the pass
// is neither readable nor a list. Each malformed container is reported and
// normalized to an empty one, so the rest of the pass still runs.

test('a repeat entry that is not an array is reported, not thrown', () => {
  let errors;
  assert.doesNotThrow(() => {
    errors = validateFills(parsed, { ...VALID, repeat: { first: {} } });
  }, 'a non-array repeat entry used to throw "(instances || []).forEach is not a function" out of validateFills');
  assert.match(
    errors.join(' | '),
    /repeat.*"first".*array/i,
    'the error must name the container and the type it needed, so the model can fix the fill it authored'
  );
});

test('a custom entry that is null is reported, not thrown', () => {
  let errors;
  assert.doesNotThrow(() => {
    errors = validateFills(parsed, { ...VALID, custom: { first: null } });
  }, 'a null custom entry used to throw "Cannot read properties of null (reading \'reason\')"');
  assert.match(
    errors.join(' | '),
    /custom.*"first".*object/i,
    'the error must name the offending override and the shape it needed'
  );
});

test('an insert that is not an array is reported, not thrown', () => {
  let errors;
  assert.doesNotThrow(() => {
    errors = validateFills(parsed, { ...VALID, insert: {} });
  }, 'a non-array insert used to throw "(fills.insert || []).forEach is not a function"');
  assert.match(
    errors.join(' | '),
    /insert.*array/i,
    'insert is a list of stages to splice in — the error must say so'
  );
});

test('an omitStages that is not an array is reported, not thrown', () => {
  let errors;
  assert.doesNotThrow(() => {
    errors = validateFills(parsed, { ...VALID, omitStages: 5 });
  }, 'a non-iterable omitStages used to throw "number 5 is not iterable" from the Set constructor on the first line of the pass');
  assert.match(
    errors.join(' | '),
    /omitStages.*array/i,
    'the error must name the container and the type it needed'
  );
});

test('a malformed container does not stop the pass — every problem in the fills is reported at once', () => {
  const slots = { ...VALID.slots };
  delete slots['intro.source'];
  const errors = validateFills(parsed, {
    slots,
    omitStages: 5,
    insert: {},
    custom: { first: null },
    repeat: { second: {} },
  });
  const joined = errors.join(' | ');
  for (const expected of ['omitStages', 'insert', 'custom', 'repeat']) {
    assert.match(
      joined,
      new RegExp(expected),
      `every malformed container must be reported in one pass, not just the first one — "${expected}" is missing`
    );
  }
  assert.match(
    joined,
    /no fill for slot "intro\.source"/,
    'the checks after the malformed containers must still run — normalizing to an empty container is what keeps the model from fixing one shape error at a time'
  );
});

test('a repeat instance that is not an object is reported, not thrown', () => {
  let errors;
  assert.doesNotThrow(() => {
    errors = validateFills(parsed, {
      ...VALID,
      repeat: { first: ['dev'] },
    });
  }, 'a non-object repeat instance must not throw out of the label or slots checks');
  assert.match(
    errors.join(' | '),
    /repeat instance #1 of stage "first" must be a JSON object/,
    'the error must name the shape the instance needed and locate it by stage and position, since a malformed instance has no label to name it by'
  );
});

test('a repeat instance whose own "slots" is not an object is reported, not thrown', () => {
  let errors;
  assert.doesNotThrow(() => {
    errors = validateFills(parsed, {
      ...VALID,
      repeat: { first: [{ label: 'dev', slots: 'first.body' }] },
    });
  }, 'a non-object instance "slots" used to throw "Cannot use \'in\' operator to search for ..." from the per-instance coverage check');
  assert.match(
    errors.join(' | '),
    /repeat instance #1 of stage "first" has "slots"/,
    'the per-instance slot overrides are a map of slot id to fill — the error must say which instance carries the wrong shape'
  );
});

test('a stageOrder that is not an array is reported, not thrown', () => {
  let errors;
  assert.doesNotThrow(() => {
    errors = validateFills(parsed, { ...VALID, stageOrder: 5 });
  }, 'a non-iterable stageOrder used to throw "number 5 is not iterable" from its spread');
  assert.match(
    errors.join(' | '),
    /stageOrder.*array/i,
    'stageOrder is a permutation of stage ids — the error must say what shape was expected'
  );
});
