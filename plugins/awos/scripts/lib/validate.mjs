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

  // assemble.mjs emits a repeated stage once per instance — zero
  // instances means the stage's marker, heading and body vanish from the
  // output entirely, the same as omitStages, but silently: nothing else
  // validates that omission against the stage's optionality or against
  // fixed prose that step-refs it.
  const emptyRepeatStages = new Set(
    Object.keys(repeat).filter((id) => stageById[id] && repeat[id].length === 0)
  );
  for (const id of emptyRepeatStages) {
    if (!stageById[id].optional)
      errors.push(
        `stage "${id}" has zero repeat instances, which omits it entirely — it is not optional in the template and cannot be omitted this way`
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

  // The emptyRepeatStages exclusion here is kept in sync with
  // coveredByEveryInstance's vacuous-truth-on-empty-array behavior below
  // (an empty instances array is treated as "fully covered" without ever
  // needing a base fill). If that vacuous truth is ever tightened — e.g.
  // to require at least one instance before treating a slot as
  // covered — this exclusion is what still keeps a zero-instance stage's
  // slots from suddenly demanding a fill that was never meant to exist.
  const liveStages = new Set(
    parsed.stages
      .filter((s) => !omitStages.has(s.id) && !emptyRepeatStages.has(s.id))
      .map((s) => s.id)
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

  // A repeat instance's own slots must name real slots that belong to the
  // stage being repeated — the same contract Object.keys(slots) enforces
  // for the base fill. An unrecognized or wrong-stage key here is not
  // applied anywhere in the assembled output (assemble.mjs only
  // substitutes keys its own stage body's <awos-slot> markers reference),
  // so it silently drops whatever override the model meant to make.
  for (const [stageId, instances] of Object.entries(repeat)) {
    if (!stageById[stageId]) continue; // already flagged above
    (instances || []).forEach((inst, index) => {
      const label = inst.label || `#${index + 1}`;
      for (const key of Object.keys(inst.slots || {})) {
        const owner = known.get(key);
        if (!owner) {
          errors.push(
            `repeat instance "${stageId}#${label}" names slot "${key}", which this template does not define`
          );
        } else if (owner.stage !== stageId) {
          const belongsTo = owner.stage
            ? `stage "${owner.stage}"`
            : `section "${owner.section}"`;
          errors.push(
            `repeat instance "${stageId}#${label}" names slot "${key}", which belongs to ${belongsTo}, not stage "${stageId}"`
          );
        }
      }
    });
  }

  // A repeat instance's label becomes half of the marker id assemble.mjs
  // emits (`${stage.id}#${inst.label}`) — the exact id diff.mjs's
  // STAGE_RE must later re-parse out of the generated file to attribute a
  // hand-edit to the right instance. An unconstrained label (free text, a
  // space, another "#") either breaks that regex outright — the stage
  // silently vanishes from the diff report, and a hand-edit inside it is
  // overwritten on the next re-run — or produces a marker id colliding
  // with something else. Constrain it to the same kebab shape stage and
  // slot ids already use, so this is caught here instead of at diff time.
  const LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  for (const [stageId, instances] of Object.entries(repeat)) {
    if (!stageById[stageId]) continue; // already flagged above
    const seenLabels = new Set();
    (instances || []).forEach((inst, index) => {
      if (typeof inst.label !== 'string' || !LABEL_RE.test(inst.label)) {
        const shown =
          typeof inst.label === 'string'
            ? `"${inst.label}"`
            : String(inst.label);
        errors.push(
          `repeat instance #${index + 1} of stage "${stageId}" has label ${shown}, which must be lowercase kebab-case matching ${LABEL_RE.source} — it becomes part of the emitted marker id "${stageId}#${inst.label}"`
        );
        return;
      }
      // Two instances sharing a label collide on the marker id assemble.mjs
      // emits ("${stageId}#${label}"): assemble writes two markers with
      // that identical id, and diffStages's Map.set on that id keeps only
      // the last, so the first instance — and any hand-edit inside it —
      // silently disappears from the diff report and gets overwritten on
      // the next re-run.
      if (seenLabels.has(inst.label)) {
        errors.push(
          `stage "${stageId}" has more than one repeat instance labelled "${inst.label}" — instance labels must be unique within a stage because they become the marker id "${stageId}#${inst.label}"`
        );
      } else {
        seenLabels.add(inst.label);
      }
    });
  }

  // Checks one fill value's content — never its presence, callers decide
  // that. Shared between a base fill and a repeat instance's own fill,
  // since assemble.mjs treats both the same way once merged per instance.
  function checkSlotValue(id, value, optional) {
    if (value === null) {
      if (!optional)
        errors.push(
          `slot "${id}" is not optional — a null fill would excise fixed prose around it`
        );
      return;
    }
    if (typeof value !== 'string') {
      errors.push(`slot "${id}" must be a string or null`);
      return;
    }
    if (value.includes('<!--') || value.includes('-->'))
      errors.push(
        `slot "${id}" contains an HTML comment delimiter — it would close the surrounding stage marker early and break the rest of the file`
      );
    if (/awos:flow:stage/.test(value))
      errors.push(
        `slot "${id}" contains a stage marker — markers are emitted by the assembler, never by a fill`
      );
    if (value.includes(SENTINEL))
      errors.push(
        `slot "${id}" contains the excision sentinel character — assemble.mjs uses that codepoint to mark null fills, so this value would be silently excised`
      );
  }

  for (const slot of liveSlots) {
    // assemble.mjs fills a repeated stage's slots from
    // {...fills.slots, ...instance.slots} PER INSTANCE, regardless of
    // whether a base fill also exists — an instance's own value always
    // wins for that instance's block. So every instance that supplies its
    // own value for this slot gets checked here unconditionally, even
    // when a base fill is also present: checking only the base value
    // would let an instance's comment delimiter, stage marker, sentinel
    // or non-optional-null slip through untouched into that instance's
    // output.
    const instances = slot.stage && repeat[slot.stage];
    let coveredByEveryInstance = Boolean(instances);
    if (instances) {
      for (const inst of instances) {
        if (inst.slots && slot.id in inst.slots) {
          checkSlotValue(slot.id, inst.slots[slot.id], slot.optional);
        } else {
          coveredByEveryInstance = false;
        }
      }
    }
    if (coveredByEveryInstance) continue;

    if (slot.id in slots) {
      checkSlotValue(slot.id, slots[slot.id], slot.optional);
      continue;
    }
    errors.push(
      `no fill for slot "${slot.id}" (stage/section: ${slot.stage || slot.section})`
    );
  }

  const keptIds = parsed.stages
    .filter((s) => !omitStages.has(s.id) && !emptyRepeatStages.has(s.id))
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
  (fills.insert || []).forEach((ins, index) => {
    if (!keptIds.includes(ins.after))
      errors.push(
        `insert is anchored after "${ins.after}", which is not an emitted stage`
      );
    if (!ins.stage || !ins.title || !ins.body)
      errors.push(
        `insert #${index + 1} (anchored after "${ins.after}") is missing one of stage/title/body — every insert needs all three`
      );
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
  });

  for (const target of parsed.stepRefs) {
    if (!keptIds.includes(target))
      errors.push(
        `fixed prose carries <awos-step-ref stage="${target}"/>, but that stage is not emitted — the cross-reference would dangle`
      );
  }

  return errors;
}
