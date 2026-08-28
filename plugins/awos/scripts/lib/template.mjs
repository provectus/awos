const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const STAGE_OPEN_RE =
  /<!--\s*awos:flow:stage=([a-z0-9-]+)(\s+optional)?\s*-->/g;
const STAGE_CLOSE = '<!-- /awos:flow:stage -->';
const SECTION_OPEN_RE =
  /<!--\s*awos:flow:section=([a-z0-9-]+)(\s+optional)?\s*-->/g;
const SECTION_CLOSE = '<!-- /awos:flow:section -->';
const SLOT_RE =
  /<awos-slot id="([a-z0-9.-]+)"(\s+optional)?\s*>([\s\S]*?)<\/awos-slot>/g;
const STEP_REF_RE = /<awos-step-ref stage="([a-z0-9-]+)"\s*\/>/g;
const FOOTER_RE = /\n---\n\n<!-- awos:flow:generated [^\n]*-->\n?$/;
const HEADING_RE = /^###\s+<awos-step\/>:\s*(.+)$/m;

// The slot id's first dot-separated segment names its owner. A slot inside a
// stage span belongs to that stage; anything else belongs to the section named
// by its prefix — which is why pre-stage slot ids are prefixed (intro., arguments.).
function ownerOf(id, stageId) {
  if (stageId) return { stage: stageId, section: null };
  return { stage: null, section: id.split('.')[0] };
}

function lineAround(src, index) {
  const start = src.lastIndexOf('\n', index) + 1;
  let end = src.indexOf('\n', index);
  if (end === -1) end = src.length;
  return { start, end, text: src.slice(start, end) };
}

// The paragraph bounds spanning [start, end) — blank-line-delimited on both
// sides, or a string edge. `full` (the whole matched slot) can span several
// physical lines, so `lineAround`'s single line is not guaranteed to
// contain it; the paragraph always does, since a slot's own markup is never
// itself split across a blank line.
function paragraphBounds(src, start, end) {
  const prevBlank = src.lastIndexOf('\n\n', start);
  const pStart = prevBlank === -1 ? 0 : prevBlank + 2;
  const nextBlank = src.indexOf('\n\n', end);
  const pEnd = nextBlank === -1 ? src.length : nextBlank;
  return { pStart, pEnd };
}

// Matches any complete <awos-slot ...>...</awos-slot> element, used to scan
// a paragraph for every slot it contains — not just the one this call is
// building context for. A paragraph can hold several slots (three
// consecutive numbered list items with no blank line between them form one
// paragraph, for instance), and each one's context must show the others as
// already-resolved neighbours, never as their raw markup.
const PARAGRAPH_SLOT_RE = /<awos-slot\b[^>]*>[\s\S]*?<\/awos-slot>/g;

// Renders a paragraph as the slot starting at `relStart` will see it: its
// own span becomes ⟦slot⟧, and every sibling slot's span — found by
// scanning the paragraph for every <awos-slot> element, not by
// string-matching `full`, since `.replace(full, …)` only ever touches the
// first occurrence and would leave (or misidentify) any other slot in the
// same paragraph — becomes ⟦other-slot⟧, so the model can tell "my
// insertion point" from "another fill lands here" without seeing raw markup.
function renderContext(paragraph, relStart) {
  PARAGRAPH_SLOT_RE.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = PARAGRAPH_SLOT_RE.exec(paragraph)) !== null) {
    out += paragraph.slice(last, m.index);
    out += m.index === relStart ? '⟦slot⟧' : '⟦other-slot⟧';
    last = m.index + m[0].length;
  }
  out += paragraph.slice(last);
  return out;
}

function collectSlots(src, offset, stageId, out) {
  SLOT_RE.lastIndex = 0;
  let m;
  while ((m = SLOT_RE.exec(src)) !== null) {
    const [full, id, optionalAttr, instruction] = m;
    const line = lineAround(src, m.index);
    const withoutSlot = line.text.replace(full.split('\n')[0], '').trim();
    const { pStart, pEnd } = paragraphBounds(
      src,
      m.index,
      m.index + full.length
    );
    const paragraph = src.slice(pStart, pEnd);
    out.push({
      id,
      ...ownerOf(id, stageId),
      optional: Boolean(optionalAttr),
      inline: withoutSlot.length > 0 && !withoutSlot.startsWith('#'),
      instruction: instruction.trim(),
      context: renderContext(paragraph, m.index - pStart).trim(),
      index: offset + m.index,
    });
  }
}

export function parseTemplate(src) {
  const fm = src.match(FRONTMATTER_RE);
  const frontmatter = fm ? fm[1] : '';
  const bodyStart = fm ? fm[0].length : 0;
  const body = src.slice(bodyStart);

  // The header comment is the first HTML comment in the body that is not a
  // stage or section marker. It is instructions to the generator, never content.
  let headerComment = null;
  const firstComment = body.match(/<!--[\s\S]*?-->/);
  if (firstComment && !/awos:flow:(stage|section)/.test(firstComment[0])) {
    headerComment = firstComment[0];
  }

  const footerMatch = body.match(FOOTER_RE);
  const footer = footerMatch ? footerMatch[0] : '';
  const bodyNoFooter = footer
    ? body.slice(0, body.length - footer.length)
    : body;

  const stages = [];
  STAGE_OPEN_RE.lastIndex = 0;
  let m;
  while ((m = STAGE_OPEN_RE.exec(bodyNoFooter)) !== null) {
    const closeAt = bodyNoFooter.indexOf(STAGE_CLOSE, m.index);
    if (closeAt === -1) {
      throw new Error(
        `stage "${m[1]}" is never closed — every <!-- awos:flow:stage=id --> needs a matching ${STAGE_CLOSE}`
      );
    }
    const raw = bodyNoFooter.slice(m.index, closeAt + STAGE_CLOSE.length);
    const heading = raw.match(HEADING_RE);
    stages.push({
      id: m[1],
      optional: Boolean(m[2]),
      title: heading ? heading[1].trim() : null,
      raw,
      body: raw,
      start: m.index,
      end: closeAt + STAGE_CLOSE.length,
    });
  }

  const firstStageStart = stages.length ? stages[0].start : bodyNoFooter.length;
  let preamble = bodyNoFooter.slice(0, firstStageStart);
  if (headerComment) preamble = preamble.replace(headerComment, '');

  const sections = [];
  SECTION_OPEN_RE.lastIndex = 0;
  while ((m = SECTION_OPEN_RE.exec(preamble)) !== null) {
    const closeAt = preamble.indexOf(SECTION_CLOSE, m.index);
    if (closeAt === -1) {
      throw new Error(
        `section "${m[1]}" is never closed — every <!-- awos:flow:section=id --> needs a matching ${SECTION_CLOSE}`
      );
    }
    sections.push({
      id: m[1],
      optional: Boolean(m[2]),
      raw: preamble.slice(m.index, closeAt + SECTION_CLOSE.length),
    });
  }

  const slots = [];
  collectSlots(preamble, 0, null, slots);
  for (const stage of stages)
    collectSlots(stage.raw, stage.start, stage.id, slots);

  const stepRefs = [];
  STEP_REF_RE.lastIndex = 0;
  while ((m = STEP_REF_RE.exec(bodyNoFooter)) !== null) stepRefs.push(m[1]);

  return {
    frontmatter,
    bodyStart,
    headerComment,
    preamble,
    sections,
    stages,
    slots,
    stepRefs,
    footer,
  };
}
