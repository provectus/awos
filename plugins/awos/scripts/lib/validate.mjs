// Private-use codepoint assemble.mjs writes to mark a null fill for later
// excision. Written only as an escape — never as a literal character in
// source — since a literal control byte here would make this file look
// binary to naive tooling, the same trap that bit assemble.mjs's own copy.
const SENTINEL = '\uE000';

export function validateFills(parsed, fills) {
  const errors = [];
  const slots = fills.slots || {};
  const omitStages = new Set(fills.omitStages || []);
  const omitSections = new Set(fills.omitSections || []);
  const repeat = fills.repeat || {};
  const custom = fills.custom || {};

  const stageById = Object.fromEntries(parsed.stages.map((s) => [s.id, s]));
  const sectionById = Object.fromEntries(parsed.sections.map((s) => [s.id, s]));

  for (const id of omitStages) {
    if (!stageById[id])
      errors.push(
        `omitStages names "${id}", which is not a stage in this template`
      );
    else if (!stageById[id].optional)
      errors.push(
        `stage "${id}" is not optional in the template and cannot be omitted — it carries contracts the flow depends on`
      );
  }
  for (const id of omitSections) {
    if (!sectionById[id])
      errors.push(
        `omitSections names "${id}", which is not a section in this template`
      );
    else if (!sectionById[id].optional)
      errors.push(
        `section "${id}" is not optional in the template and cannot be omitted`
      );
  }

  for (const id of Object.keys(repeat)) {
    if (!stageById[id])
      errors.push(
        `repeat names "${id}", which is not a stage in this template`
      );
  }
  for (const [id, entry] of Object.entries(custom)) {
    if (!stageById[id])
      errors.push(
        `custom names "${id}", which is not a stage in this template`
      );
    if (!entry.reason)
      errors.push(
        `custom override of "${id}" needs a "reason" — an override is a declared deviation`
      );
  }
  for (const id of new Set([
    ...omitStages,
    ...Object.keys(repeat),
    ...Object.keys(custom),
  ])) {
    const hits = [omitStages.has(id), id in repeat, id in custom].filter(
      Boolean
    ).length;
    if (hits > 1)
      errors.push(
        `stage "${id}" is named by more than one of omitStages/repeat/custom`
      );
  }

  const liveStages = new Set(
    parsed.stages.filter((s) => !omitStages.has(s.id)).map((s) => s.id)
  );
  const liveSlots = parsed.slots.filter((s) =>
    s.stage
      ? liveStages.has(s.stage) && !(s.stage in custom)
      : !omitSections.has(s.section)
  );
  const known = new Map(parsed.slots.map((s) => [s.id, s]));

  for (const id of Object.keys(slots)) {
    if (!known.has(id))
      errors.push(
        `fills name slot "${id}", which this template does not define`
      );
  }
  for (const slot of liveSlots) {
    if (!(slot.id in slots)) {
      errors.push(
        `no fill for slot "${slot.id}" (stage/section: ${slot.stage || slot.section})`
      );
      continue;
    }
    const value = slots[slot.id];
    if (value === null) {
      if (!slot.optional)
        errors.push(
          `slot "${slot.id}" is not optional — a null fill would excise fixed prose around it`
        );
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(`slot "${slot.id}" must be a string or null`);
      continue;
    }
    if (value.includes('<!--') || value.includes('-->'))
      errors.push(
        `slot "${slot.id}" contains an HTML comment delimiter — it would close the surrounding stage marker early and break the rest of the file`
      );
    if (/awos:flow:stage/.test(value))
      errors.push(
        `slot "${slot.id}" contains a stage marker — markers are emitted by the assembler, never by a fill`
      );
    if (value.includes(SENTINEL))
      errors.push(
        `slot "${slot.id}" contains the excision sentinel character — assemble.mjs uses that codepoint to mark null fills, so this value would be silently excised`
      );
  }

  const keptIds = parsed.stages
    .filter((s) => !omitStages.has(s.id))
    .map((s) => s.id);
  if (fills.stageOrder) {
    const a = [...fills.stageOrder].sort().join(',');
    const b = [...keptIds].sort().join(',');
    if (a !== b)
      errors.push(
        `stageOrder must be a permutation of the kept stages (${keptIds.join(', ')}) — reordering and omitting are separate operations`
      );
  }

  const insertStageIds = new Set();
  for (const ins of fills.insert || []) {
    if (!keptIds.includes(ins.after))
      errors.push(
        `insert is anchored after "${ins.after}", which is not an emitted stage`
      );
    if (!ins.stage || !ins.title || !ins.body)
      errors.push('every insert needs stage, title and body');
    if (ins.stage) {
      if (stageById[ins.stage])
        errors.push(
          `insert stage id "${ins.stage}" collides with a stage the template already defines — give it a distinct id`
        );
      else if (insertStageIds.has(ins.stage))
        errors.push(
          `insert stage id "${ins.stage}" is claimed by more than one insert — give each a distinct id`
        );
      insertStageIds.add(ins.stage);
    }
  }

  for (const target of parsed.stepRefs) {
    if (!keptIds.includes(target))
      errors.push(
        `fixed prose carries <awos-step-ref stage="${target}"/>, but that stage is not emitted — the cross-reference would dangle`
      );
  }

  return errors;
}
