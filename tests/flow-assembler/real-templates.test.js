import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTemplate } from '../../plugins/awos/scripts/lib/template.mjs';
import { assemble } from '../../plugins/awos/scripts/lib/assemble.mjs';
import { validateFills } from '../../plugins/awos/scripts/lib/validate.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const templatesDir = path.join(repoRoot, 'plugins', 'awos', 'templates');
const STAMP = {
  version: '2.5.0',
  date: '2026-08-27',
  source: 'context/product/delivery-flow.md',
};

const TEMPLATES = ['implement-feature-template.md', 'fix-bug-template.md'];

// Fill every slot with a marker carrying its id, so an assembled command can be
// checked for "did any fixed prose go missing" without hand-writing prose.
function fillAll(parsed) {
  return {
    frontmatter: { description: 'd', 'argument-hint': '[a]' },
    slots: Object.fromEntries(parsed.slots.map((s) => [s.id, `«${s.id}»`])),
  };
}

// Matches one complete <awos-slot ...>...</awos-slot> element or one
// <awos-step-ref .../> element, used to split a line into the fixed-prose
// fragments that sit between them. A step-ref must split too, not just a
// slot: assemble.mjs resolves "<awos-step-ref stage=\"x\"/>" to "Step N" in
// the output, so a fragment that still carries the unresolved tag text can
// never literal-match the assembled output even though nothing was lost.
const INLINE_SLOT_RE =
  /(?:<awos-slot\b[^>]*>[\s\S]*?<\/awos-slot>|<awos-step-ref\b[^>]*\/>)/g;

// Non-global twin of INLINE_SLOT_RE for boolean .test() checks — a global
// regex is stateful (lastIndex), which makes repeated .test() calls on the
// same object unsafe across a loop.
const INLINE_SLOT_TEST_RE =
  /(?:<awos-slot\b[^>]*>[\s\S]*?<\/awos-slot>|<awos-step-ref\b[^>]*\/>)/;

// Matches one complete <awos-slot ...>...</awos-slot> element only (no
// step-ref), including a body that spans multiple physical lines — a real
// multi-paragraph or bulleted instruction. Used to cut whole slot spans out
// before splitting the template into "fixed prose" lines: a multi-line
// slot's interior lines (e.g. a bulleted sub-list) are instruction text the
// generator replaces wholesale, and must be removed as one unit rather than
// surviving as separate lines that line-by-line filtering would mistake
// for fixed prose.
const SLOT_ELEMENT_RE = /<awos-slot\b[^>]*>[\s\S]*?<\/awos-slot>/g;

for (const name of TEMPLATES) {
  const src = fs.readFileSync(path.join(templatesDir, name), 'utf8');

  test(`${name} parses with every slot owned and no leftover bracket instructions`, () => {
    const parsed = parseTemplate(src);
    assert.ok(parsed.slots.length > 0, 'the template must define slots');
    for (const slot of parsed.slots) {
      assert.match(
        slot.id,
        /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/,
        `slot id "${slot.id}" must be <owner>.<name> in lowercase kebab`
      );
      assert.ok(
        slot.instruction.length > 0,
        `slot "${slot.id}" must carry an instruction — it is the only thing the generator sees`
      );
    }
    const ids = parsed.slots.map((s) => s.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      'slot ids must be unique within a template'
    );
  });

  test(`${name} assembles with fixed prose byte-exact`, () => {
    const parsed = parseTemplate(src);
    const fills = fillAll(parsed);
    assert.deepEqual(
      validateFills(parsed, fills),
      [],
      'a full fill must validate'
    );
    const out = assemble(src, fills, STAMP);

    // Every fixed-prose line of the template must appear verbatim in the
    // output. Cut whole <awos-slot> elements out first — replacing each
    // with a bare newline, not with nothing — so a multi-line slot's
    // interior lines are removed as one unit (they are instruction text the
    // generator replaces wholesale) and, just as importantly, so fixed
    // prose that shares a line with a *mid-line* slot splits into two
    // separate lines instead of being joined into one line that never
    // appears in the output (the output has the filled slot value sitting
    // between them, not nothing). <awos-step-ref/> is deliberately left
    // un-cut here: it is single-line by construction, the '<awos-step'
    // substring filter below already excludes its line, and the
    // fragment-based check in the next test covers it properly.
    const fixedLines = src
      .replace(SLOT_ELEMENT_RE, '\n')
      .split('\n')
      .filter(
        (l) =>
          l.trim().length > 0 &&
          !l.includes('<awos-slot') &&
          !l.includes('awos:flow:stage') &&
          !l.includes('awos:flow:section') &&
          !l.includes('<awos-step') &&
          !l.includes('awos:flow:generated')
      );
    const headerComment = parseTemplate(src).headerComment || '';
    for (const line of fixedLines) {
      if (headerComment.includes(line.trim())) continue;
      if (/^(description|argument-hint):/.test(line)) continue;
      if (line.trim() === '---') continue;
      assert.ok(
        out.includes(line),
        `${name}: fixed prose line went missing from the assembled command — this is the #184 defect the assembler exists to make impossible:\n  ${line.slice(0, 120)}`
      );
    }
  });

  // C10 strengthening: the test above skips any line spanned by a whole
  // <awos-slot> element, so fixed prose that shares a *single* line with an
  // inline slot was never checked — the intro's source sentence, the specs
  // stage's "Honor the entry point" rule, the verify stage's "the flow's
  // job, not the user's" line, the commit-push staging discipline, and
  // others like them. Split each such line on the slot element(s) and
  // assert every fixed fragment of 12+ characters survives assembly
  // verbatim. The length floor avoids false failures on a stray backtick,
  // dash, or bullet marker left over at a split boundary.
  //
  // A line only qualifies here when the whole element — open tag through
  // close — sits on that one physical line (tested with INLINE_SLOT_TEST_RE,
  // which can't match across the line boundary since the string it's given
  // has no newline in it). A genuinely multi-line slot's opening, interior,
  // and closing lines do not qualify: their content was already stripped as
  // one unit by the byte-exact test above, and there is no fixed prose
  // sharing those lines left to check.
  test(`${name} fixed prose sharing a line with an inline slot survives assembly`, () => {
    const parsed = parseTemplate(src);
    const fills = fillAll(parsed);
    const out = assemble(src, fills, STAMP);

    // Lines inside the header comment are excluded, same as the byte-exact
    // test above: the header is instructions to the generator, stripped
    // whole at assembly, and its own worked examples of the slot syntax
    // (e.g. "<awos-slot id=\"stage.name\">…") are prose about the
    // construct, not a real slot — they were never meant to survive.
    const headerComment = parsed.headerComment || '';
    const lines = src
      .split('\n')
      .filter((l) => INLINE_SLOT_TEST_RE.test(l) && !headerComment.includes(l));
    assert.ok(
      lines.length > 0,
      'expected at least one line mixing fixed prose with an inline slot'
    );

    const missing = [];
    for (const line of lines) {
      const fragments = line.split(INLINE_SLOT_RE).map((f) => f.trim());
      for (const frag of fragments) {
        if (frag.length < 12) continue;
        if (!out.includes(frag)) missing.push(frag);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `fixed-prose fragments sharing a line with a slot went missing from the assembled output:\n${missing.map((f) => `  ${f}`).join('\n')}`
    );
  });

  test(`${name} carries no generator-instruction comment into the output`, () => {
    const parsed = parseTemplate(src);
    const out = assemble(src, fillAll(parsed), STAMP);
    assert.ok(
      !out.includes('Skeleton consumed by /awos:flow'),
      'the template header comment is instructions to the generator, never content'
    );
    assert.ok(
      !/<awos-slot|<awos-step|awos:flow:section/.test(out),
      'no template-only construct may survive into a generated command'
    );
  });

  test(`${name} every step reference names an emitted stage`, () => {
    const parsed = parseTemplate(src);
    const ids = new Set(parsed.stages.map((s) => s.id));
    for (const target of parsed.stepRefs) {
      assert.ok(
        ids.has(target),
        `<awos-step-ref stage="${target}"/> names a stage this template does not define`
      );
    }
  });

  test(`${name} every optional slot excises without damaging its neighbours`, () => {
    const parsed = parseTemplate(src);
    for (const slot of parsed.slots.filter((s) => s.optional)) {
      const fills = fillAll(parsed);
      fills.slots[slot.id] = null;
      const out = assemble(src, fills, STAMP);
      assert.ok(!/ {2}/.test(out), `excising "${slot.id}" left a double space`);
      assert.ok(
        !/\n{3,}/.test(out),
        `excising "${slot.id}" left a triple blank line`
      );
      assert.ok(
        !/ \./.test(out),
        `excising "${slot.id}" left a space before a full stop`
      );
    }
  });

  test(`${name} every optional stage omits without dangling a step reference`, () => {
    const parsed = parseTemplate(src);
    for (const stage of parsed.stages.filter((s) => s.optional)) {
      const fills = fillAll(parsed);
      fills.omitStages = [stage.id];
      for (const slot of parsed.slots.filter((s) => s.stage === stage.id)) {
        delete fills.slots[slot.id];
      }
      assert.deepEqual(
        validateFills(parsed, fills),
        [],
        `omitting optional stage "${stage.id}" must be valid — if a step reference dangles, the reference belongs inside a slot instruction, not in fixed prose`
      );
    }
  });
}
