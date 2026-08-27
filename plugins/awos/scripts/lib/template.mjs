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

function collectSlots(src, offset, stageId, out) {
  SLOT_RE.lastIndex = 0;
  let m;
  while ((m = SLOT_RE.exec(src)) !== null) {
    const [full, id, optionalAttr, instruction] = m;
    const line = lineAround(src, m.index);
    const withoutSlot = line.text.replace(full.split('\n')[0], '').trim();
    out.push({
      id,
      ...ownerOf(id, stageId),
      optional: Boolean(optionalAttr),
      inline: withoutSlot.length > 0 && !withoutSlot.startsWith('#'),
      instruction: instruction.trim(),
      context: line.text.replace(full, '⟦slot⟧').trim(),
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
