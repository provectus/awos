import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTemplate } from '../../plugins/awos/scripts/lib/template.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mini = fs.readFileSync(path.join(here, 'fixtures', 'mini.md'), 'utf8');

test('parseTemplate separates frontmatter from the body', () => {
  const parsed = parseTemplate(mini);
  assert.match(
    parsed.frontmatter,
    /description: Mini fixture\./,
    'frontmatter must be captured verbatim between the --- fences'
  );
  assert.ok(
    !parsed.preamble.includes('description: Mini fixture.'),
    'frontmatter must not leak into the preamble'
  );
});

test('parseTemplate captures the generator header comment and keeps it out of the preamble', () => {
  const parsed = parseTemplate(mini);
  assert.match(
    parsed.headerComment,
    /Generator instructions/,
    'the top-of-file comment must be captured so assembly can strip it'
  );
  assert.ok(
    !parsed.preamble.includes('Generator instructions'),
    'the header comment is instructions to the generator and must never reach the generated command'
  );
});

test('parseTemplate lists stages in document order with their optional flag and title', () => {
  const parsed = parseTemplate(mini);
  assert.deepEqual(
    parsed.stages.map((s) => [s.id, s.optional, s.title]),
    [
      ['first', false, 'First'],
      ['second', true, 'Second'],
    ],
    'stages must be ordered, and `optional` must come from the marker attribute — it is what gates omission'
  );
});

test('parseTemplate lists sections with their optional flag', () => {
  const parsed = parseTemplate(mini);
  assert.deepEqual(
    parsed.sections.map((s) => [s.id, s.optional]),
    [['notifications', true]],
    'section regions are the omittable unit for pre-stage prose'
  );
});

test('parseTemplate attributes every slot to its stage or section, never both', () => {
  const parsed = parseTemplate(mini);
  const byId = Object.fromEntries(parsed.slots.map((s) => [s.id, s]));
  assert.equal(byId['intro.source'].section, 'intro');
  assert.equal(byId['intro.source'].stage, null);
  assert.equal(byId['first.body'].stage, 'first');
  assert.equal(byId['first.body'].section, null);
  for (const slot of parsed.slots) {
    assert.ok(
      (slot.stage === null) !== (slot.section === null),
      `slot ${slot.id} must belong to exactly one of stage/section — the generator needs an unambiguous owner`
    );
  }
});

test('parseTemplate marks a slot inline when it shares a line with other text', () => {
  const parsed = parseTemplate(mini);
  const byId = Object.fromEntries(parsed.slots.map((s) => [s.id, s]));
  assert.equal(
    byId['intro.source'].inline,
    true,
    'a slot with prose on the same line is inline — excision must collapse whitespace, not delete the line'
  );
  assert.equal(
    byId['first.extra'].inline,
    false,
    'a slot alone on its line is a block — excision deletes the line and one adjacent blank line'
  );
});

test('parseTemplate carries each slot instruction and its surrounding context', () => {
  const parsed = parseTemplate(mini);
  const slot = parsed.slots.find((s) => s.id === 'first.body');
  assert.equal(slot.instruction, 'Per §2: what to do.');
  assert.equal(
    slot.context,
    'Fixed opening. ⟦slot⟧',
    'context is the containing paragraph with the slot marked — it is how the generator knows what it is completing without reading the template'
  );
});

test('parseTemplate reports the containing paragraph, not a truncated first line, as context for a multi-line slot', () => {
  const src = `---
description: d
argument-hint: '[a]'
---

<!--
Generator instructions.
-->

<!-- awos:flow:stage=first -->

### <awos-step/>: First

Before the slot, in its own paragraph.

<awos-slot id="first.multi">Per §1, one of two shapes:

- first shape
- second shape</awos-slot>

<!-- /awos:flow:stage -->

<!-- awos:flow:generated date=[x] version=[x] source=x -->
`;
  const parsed = parseTemplate(src);
  const slot = parsed.slots.find((s) => s.id === 'first.multi');
  assert.equal(
    slot.context,
    '⟦slot⟧',
    'the slot sits alone in its own blank-line-delimited paragraph, so the whole multi-line match must be replaced by the marker — the previous implementation matched `full` (the whole slot span) against `line.text` (only its first physical line), which never contains it once the slot spans lines, leaving context as the unreplaced original text'
  );
  assert.ok(
    !slot.context.includes('<awos-slot'),
    'context must never retain the raw opening tag — that is exactly what an unmatched replace leaves behind'
  );
});

test('parseTemplate resolves every sibling slot sharing a paragraph, not just the one being described', () => {
  // Three single-line list items with no blank line between them form one
  // paragraph. Fixing the multi-line case above by string-replacing only
  // `full` (this slot's own match) leaves every *other* slot in that
  // paragraph as raw markup — the regression this test pins down.
  const src = `---
description: d
argument-hint: '[a]'
---

<!-- awos:flow:stage=first -->

### <awos-step/>: First

1. one — <awos-slot id="first.a">fill a</awos-slot>
2. two — <awos-slot id="first.b">fill b</awos-slot>
3. three — <awos-slot id="first.c">fill c</awos-slot>

<!-- /awos:flow:stage -->

<!-- awos:flow:generated date=[x] version=[x] source=x -->
`;
  const parsed = parseTemplate(src);
  const byId = Object.fromEntries(parsed.slots.map((s) => [s.id, s]));
  assert.equal(
    byId['first.a'].context,
    '1. one — ⟦slot⟧\n2. two — ⟦other-slot⟧\n3. three — ⟦other-slot⟧',
    'the slot being described gets ⟦slot⟧; every sibling in the same paragraph gets a distinct marker, never its raw <awos-slot> tag'
  );
  assert.equal(
    byId['first.b'].context,
    '1. one — ⟦other-slot⟧\n2. two — ⟦slot⟧\n3. three — ⟦other-slot⟧'
  );
  assert.equal(
    byId['first.c'].context,
    '1. one — ⟦other-slot⟧\n2. two — ⟦other-slot⟧\n3. three — ⟦slot⟧'
  );
  for (const slot of parsed.slots) {
    assert.ok(
      !slot.context.includes('<awos-slot'),
      `slot "${slot.id}" must never see a sibling's raw markup`
    );
  }
});

test('parseTemplate collects step-ref targets', () => {
  const parsed = parseTemplate(mini);
  assert.deepEqual(
    parsed.stepRefs,
    ['second'],
    'step refs must be collected so an unresolvable one can be rejected before anything is written'
  );
});

test('parseTemplate captures the footer marker block', () => {
  const parsed = parseTemplate(mini);
  assert.match(
    parsed.footer,
    /awos:flow:generated date=/,
    'the footer marker is stamped mechanically, so the parser must isolate it'
  );
});

// parseTemplate used to take the first HTML comment ANYWHERE in the body as
// the generator header comment, and strip it from the preamble. CLAUDE.md's
// contract is positional — the leading comment, the block right after the
// frontmatter — so a template whose generator comment is absent lost the
// first fixed comment in its prose instead.
const NO_LEADING_COMMENT = `---
description: No leading comment.
---

# Title

Prose that comes before any comment at all.

<!-- a fixed comment meant to ship -->

<!-- awos:flow:stage=only -->

### <awos-step/>: Only

<awos-slot id="only.body">Per §1: the body.</awos-slot>

<!-- /awos:flow:stage -->

---

<!-- awos:flow:generated date=[YYYY-MM-DD] version=[v] source=s -->
`;

test('parseTemplate treats only a comment leading the body as the generator header comment', () => {
  const parsed = parseTemplate(NO_LEADING_COMMENT);
  assert.equal(
    parsed.headerComment,
    null,
    'a template with no comment right after the frontmatter has no header comment — a later comment in the prose is content, not generator instructions'
  );
  assert.ok(
    parsed.preamble.includes('<!-- a fixed comment meant to ship -->'),
    'a non-leading comment is fixed template content and must survive in the preamble, not be stripped as a header comment'
  );
});
