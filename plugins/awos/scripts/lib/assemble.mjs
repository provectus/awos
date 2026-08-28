import { parseTemplate } from './template.mjs';

// Private-use codepoint marking a slot whose fill is null, for `excise` to
// find and remove. Written only as the escape below — never as a literal
// character in source — since a model-authored fill is arbitrary prose and
// could otherwise collide with a literal sentinel string.
const SENTINEL = '\uE000';

const SLOT_RE =
  /<awos-slot id="([a-z0-9.-]+)"(?:\s+optional)?\s*>([\s\S]*?)<\/awos-slot>/g;
const STEP_REF_RE = /<awos-step-ref stage="([a-z0-9-]+)"\s*\/>/g;
const HEADING_LINE_RE = /^###\s+<awos-step\/>:.*$/m;
const STAGE_CLOSE = '<!-- /awos:flow:stage -->';
const SECTION_MARKER_RE =
  /^[ \t]*<!--\s*\/?awos:flow:section(?:=[a-z0-9-]+)?(?:\s+optional)?\s*-->[ \t]*\n/gm;

// Replace every slot in `text` with its fill. A null fill leaves a sentinel
// for `excise` to remove; any other value is substituted in place. Throws
// when a slot present in the text has no corresponding fill — the
// validation pass added in a later task moves this check ahead of assembly.
function applySlots(text, slots) {
  return text.replace(SLOT_RE, (full, id) => {
    if (!(id in slots)) {
      throw new Error(`no fill for slot "${id}"`);
    }
    const value = slots[id];
    return value === null ? SENTINEL : value;
  });
}

// Remove every sentinel left by applySlots. A sentinel alone on its own
// line is a block slot: drop the line. A sentinel embedded in a line is an
// inline slot: collapse the whitespace around it to a single space, or to
// nothing at a line edge.
function excise(text) {
  return text
    .replace(new RegExp(`\\n[ \\t]*${SENTINEL}[ \\t]*(?=\\n|$)`, 'g'), '')
    .replace(new RegExp(`^[ \\t]*${SENTINEL}[ \\t]*\\n`), '')
    .replace(
      new RegExp(`[ \\t]*${SENTINEL}[ \\t]*`, 'g'),
      (m, offset, whole) => {
        const before = whole[offset - 1];
        const after = whole[offset + m.length];
        if (before === undefined || before === '\n') return '';
        if (after === undefined || after === '\n') return '';
        return ' ';
      }
    );
}

// The content below a stage's heading and above its close marker.
function stageBody(stage) {
  const heading = stage.raw.match(HEADING_LINE_RE);
  const afterHeading = stage.raw.slice(heading.index + heading[0].length);
  return afterHeading.slice(0, afterHeading.indexOf(STAGE_CLOSE)).trim();
}

// Stage markers are re-emitted plain: the `optional` attribute is
// template-only and must not leak into a generated command.
function stageBlock(id, title, stepNo, body) {
  return `<!-- awos:flow:stage=${id} -->\n\n### Step ${stepNo}: ${title}\n\n${body}\n\n${STAGE_CLOSE}`;
}

// Reapply the quoting style (single, double, or none) the template's own
// frontmatter line used for `key`, so a fill containing an apostrophe
// cannot produce broken YAML.
function quoteLike(frontmatter, key, value) {
  const line = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  const quote = line && /^['"]/.test(line[1]) ? line[1][0] : '';
  return `${quote}${value}${quote}`;
}

export function assemble(src, fills, stamp) {
  const parsed = parseTemplate(src);

  // 1. Which stages are emitted, in template order.
  const omitStages = new Set(fills.omitStages || []);
  const emitted = parsed.stages.filter((s) => !omitStages.has(s.id));
  const stepOf = {};
  emitted.forEach((s, i) => (stepOf[s.id] = i + 1));

  const resolveRefs = (text) =>
    text.replace(STEP_REF_RE, (full, stageId) => {
      if (!(stageId in stepOf)) {
        throw new Error(
          `<awos-step-ref stage="${stageId}"/> points at a stage that is not emitted`
        );
      }
      return `Step ${stepOf[stageId]}`;
    });

  // 2. Preamble: drop omitted sections whole, strip remaining section
  // markers, then fill and excise slots, then resolve step references.
  const omitSections = new Set(fills.omitSections || []);
  let preamble = parsed.preamble;
  for (const section of parsed.sections) {
    if (omitSections.has(section.id)) {
      preamble = preamble.split(section.raw).join('');
    }
  }
  preamble = preamble.replace(SECTION_MARKER_RE, '');
  preamble = excise(applySlots(preamble, fills.slots));
  preamble = resolveRefs(preamble)
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  // 3. Stage bodies, numbered over emission order.
  const blocks = emitted.map((stage, i) => {
    const body = resolveRefs(excise(applySlots(stageBody(stage), fills.slots)));
    return stageBlock(stage.id, stage.title, i + 1, body);
  });

  // 4. Frontmatter: substitute only the fields the caller provided.
  const fm = fills.frontmatter || {};
  let frontmatter = parsed.frontmatter;
  if (fm.description !== undefined) {
    frontmatter = frontmatter.replace(
      /^description:.*$/m,
      `description: ${fm.description}`
    );
  }
  if (fm['argument-hint'] !== undefined) {
    frontmatter = frontmatter.replace(
      /^argument-hint:.*$/m,
      `argument-hint: ${quoteLike(parsed.frontmatter, 'argument-hint', fm['argument-hint'])}`
    );
  }

  // 5. Footer: provenance is stamped mechanically, never generated.
  const footer = `<!-- awos:flow:generated date=${stamp.date} version=${stamp.version} source=${stamp.source} -->`;

  return `---\n${frontmatter}\n---\n\n${preamble}\n\n${blocks.join('\n\n')}\n\n---\n\n${footer}\n`;
}
