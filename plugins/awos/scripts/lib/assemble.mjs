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

  // 1. Which stages are emitted, and in what order — template order, unless
  // stageOrder overrides it (the change-request-first review move reorders
  // stages this way).
  const omitStages = new Set(fills.omitStages || []);
  let baseStages = parsed.stages.filter((s) => !omitStages.has(s.id));
  if (fills.stageOrder) {
    const byId = new Map(baseStages.map((s) => [s.id, s]));
    baseStages = fills.stageOrder.map((id) => {
      const stage = byId.get(id);
      if (!stage) {
        throw new Error(`stageOrder references unknown stage "${id}"`);
      }
      return stage;
    });
  }

  // 1a. Escape hatches that expand or replace a single template stage:
  // repeat emits one labelled instance per entry (multi-environment
  // deploys, multi-PR loops); custom replaces a stage's title and body
  // wholesale while keeping its markers, so re-run attribution still works.
  const repeatMap = fills.repeat || {};
  const customMap = fills.custom || {};
  let emitted = [];
  for (const stage of baseStages) {
    const instances = repeatMap[stage.id];
    const custom = customMap[stage.id];
    if (instances) {
      for (const inst of instances) {
        emitted.push({
          id: `${stage.id}#${inst.label}`,
          stageId: stage.id,
          title: `${stage.title} — ${inst.label}`,
          template: stage,
          instanceSlots: inst.slots,
        });
      }
    } else if (custom) {
      emitted.push({
        id: stage.id,
        stageId: stage.id,
        title: custom.title,
        custom,
      });
    } else {
      emitted.push({
        id: stage.id,
        stageId: stage.id,
        title: stage.title,
        template: stage,
      });
    }
  }

  // 1b. insert: a post-pass over the already-expanded list, so an anchor
  // works regardless of where it landed (repeated, reordered, or last in
  // the list). Inserts are grouped by anchor and spliced as one block, in
  // declaration order — otherwise two inserts sharing an anchor (a canary
  // and a soak stage, both after delivery) would each search for the same
  // anchor position and the second splice would land in front of the
  // first, silently reversing structure the model explicitly declared. An
  // anchor that names a repeated stage lands after its LAST instance —
  // "insert a canary stage after delivery" means once delivery is
  // entirely finished, not wedged between two of its environments.
  const insertGroups = new Map();
  for (const ins of fills.insert || []) {
    if (!insertGroups.has(ins.after)) insertGroups.set(ins.after, []);
    insertGroups.get(ins.after).push(ins);
  }
  for (const [anchor, group] of insertGroups) {
    let at = -1;
    for (let i = emitted.length - 1; i >= 0; i--) {
      if (emitted[i].stageId === anchor) {
        at = i;
        break;
      }
    }
    if (at === -1) {
      throw new Error(`insert anchor "${anchor}" is not an emitted stage`);
    }
    const block = group.map((ins) => ({
      id: ins.stage,
      stageId: ins.stage,
      title: ins.title,
      body: ins.body,
      verbatim: true,
    }));
    emitted.splice(at + 1, 0, ...block);
  }

  // 1c. Step numbers are computed only after every stage the run will emit
  // — reordered, repeated, overridden and inserted — is in its final slot.
  // A repeated stage's base id resolves to its FIRST instance — a step
  // reference means where that stage begins, not where its last
  // environment finishes — so an id already claimed is never overwritten.
  const stepOf = {};
  emitted.forEach((e, i) => {
    if (!(e.id in stepOf)) stepOf[e.id] = i + 1;
    if (!(e.stageId in stepOf)) stepOf[e.stageId] = i + 1;
  });

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
    .trim();

  // 3. Stage bodies, numbered over emission order. A verbatim (inserted)
  // or custom body is model-authored prose, copied as-is aside from step
  // references; a template stage still goes through slot fill and excision,
  // with a repeat instance's own slots layered over the shared fills.
  const blocks = emitted.map((entry, i) => {
    let raw;
    if (entry.verbatim) {
      raw = entry.body;
    } else if (entry.custom) {
      raw = entry.custom.body;
    } else {
      const slots = entry.instanceSlots
        ? { ...fills.slots, ...entry.instanceSlots }
        : fills.slots;
      raw = excise(applySlots(stageBody(entry.template), slots));
    }
    const body = resolveRefs(raw)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return stageBlock(entry.id, entry.title, i + 1, body);
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
