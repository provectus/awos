// Private-use codepoint assemble.mjs writes to mark a null fill for later
// excision. Written only as an escape — never as a literal character in
// source — since a literal control byte here would make this file look
// binary to naive tooling, the same trap that bit assemble.mjs's own copy.
const SENTINEL = '\uE000';

// A JSON object — not an array, not null. The shape every fill container
// that maps ids to values has to have.
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Names what actually arrived, so the error tells the model which of its
// containers to fix without it having to guess.
function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

export function validateFills(parsed, fills, context = {}) {
  const errors = [];

  // fills.json is model-authored, so a container can arrive with the wrong
  // type entirely — a repeat entry as an object, an insert as a map, an
  // omitStages as a number. Each of those used to throw a TypeError out of
  // the middle of the pass, which is neither this module's job (it returns
  // a list of what is wrong with the fills) nor usable by the model that
  // has to fix them. So every container is checked as it is read: the
  // error is recorded and the container normalized to an empty one, so the
  // remaining checks still run and one call reports every problem.
  const objectFill = (key, value) => {
    if (value === undefined || value === null) return {};
    if (!isPlainObject(value)) {
      errors.push(
        `${key} must be a JSON object, not ${describeType(value)} — it is ignored for the rest of this check`
      );
      return {};
    }
    return value;
  };
  const arrayFill = (key, value) => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      errors.push(
        `${key} must be a JSON array, not ${describeType(value)} — it is ignored for the rest of this check`
      );
      return [];
    }
    return value;
  };

  const slots = objectFill('slots', fills.slots);
  const omitStages = new Set(arrayFill('omitStages', fills.omitStages));
  const omitSections = new Set(arrayFill('omitSections', fills.omitSections));
  const custom = objectFill('custom', fills.custom);
  const insert = arrayFill('insert', fills.insert);

  // repeat is two containers deep: a map of stage id to a list of
  // instances, each an object with its own slots. It is normalized into a
  // fresh map — never by mutating the caller's fills, which the caller goes
  // on to persist — so every loop below can assume an array of objects.
  const repeat = {};
  for (const [id, instances] of Object.entries(
    objectFill('repeat', fills.repeat)
  )) {
    if (!Array.isArray(instances)) {
      errors.push(
        `repeat entry for "${id}" must be a JSON array of instances, not ${describeType(instances)}`
      );
      repeat[id] = [];
      continue;
    }
    repeat[id] = instances.map((inst, index) => {
      if (!isPlainObject(inst)) {
        errors.push(
          `repeat instance #${index + 1} of stage "${id}" must be a JSON object carrying a "label", not ${describeType(inst)}`
        );
        return {};
      }
      if (inst.slots !== undefined && !isPlainObject(inst.slots)) {
        errors.push(
          `repeat instance #${index + 1} of stage "${id}" has "slots" of ${describeType(inst.slots)} — it must be a JSON object mapping slot ids to fills`
        );
        return { ...inst, slots: {} };
      }
      return inst;
    });
  }

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
    // The entry itself, before any of its fields are read: an override
    // that is not an object has no reason, title or body to check.
    if (!isPlainObject(entry)) {
      errors.push(
        `custom override of "${id}" must be a JSON object with a "reason" (and optionally "title"/"body"), not ${describeType(entry)}`
      );
      continue;
    }
    if (!entry.reason)
      errors.push(
        `custom override of "${id}" needs a "reason" — an override is a declared deviation`
      );
    // assemble.mjs writes entry.title/entry.body into the output with no
    // check of its own (unlike a slot fill, which validateFills always
    // sees) — a custom override is just as capable of fabricating a stage
    // marker or breaking comment structure as any other fill shape.
    if (entry.title !== undefined) {
      if (typeof entry.title !== 'string')
        errors.push(`custom override of "${id}"'s title must be a string`);
      else checkTextHazards(`custom override of "${id}"'s title`, entry.title);
    }
    if (entry.body !== undefined) {
      if (typeof entry.body !== 'string')
        errors.push(`custom override of "${id}"'s body must be a string`);
      else checkTextHazards(`custom override of "${id}"'s body`, entry.body);
    }
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

  // Checks one free-text value's content, regardless of which fill shape it
  // came from (a slot fill, a repeat instance override, an insert's title
  // or body, a custom override's title or body) — assemble.mjs writes all
  // of these into the output the same uncontrolled way, so a payload that
  // corrupts structure through one hatch corrupts it through any other.
  //
  // The comment-delimiter check only rejects an UNBALANCED "<!--"/"-->"
  // count, not any occurrence: a complete, balanced comment a fill has a
  // legitimate reason to mention (e.g. documenting the `<!-- skip-tests:
  // true -->` convention) reads fine in the assembled file, while a stray
  // unmatched delimiter breaks the comment structure of everything after
  // it. The marker check is separate and stricter — it rejects the bare
  // substring regardless of comment wrapping, because a fill that mentions
  // "awos:flow:stage"/"awos:flow:section" at all is fabricating something
  // that is the assembler's alone to emit.
  function checkTextHazards(label, value) {
    const opens = (value.match(/<!--/g) || []).length;
    const closes = (value.match(/-->/g) || []).length;
    if (opens !== closes)
      errors.push(
        `${label} contains an unbalanced HTML comment delimiter — a stray "<!--" or "-->" would break the comment structure of the rest of the file`
      );
    if (/awos:flow:(stage|section)/.test(value))
      errors.push(
        `${label} contains a stage marker or section marker — markers are emitted by the assembler, never by a fill`
      );
    if (value.includes(SENTINEL))
      errors.push(
        `${label} contains the excision sentinel character — assemble.mjs uses that codepoint to mark null fills, so this value would be silently excised`
      );
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
    checkTextHazards(`slot "${id}"`, value);
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

  // The migration gate: the caller (assemble-flow-command.mjs) sets this
  // when --out already names a file and no baseline exists for it — an
  // install that predates the assembler, where flow.md Step 6 item 2's
  // fallback is the only thing standing between a hand-edit and silent
  // overwrite. That fallback is otherwise satisfiable by doing nothing: a
  // model can call diff, read "baseline absent", and go straight to
  // writing fills without ever opening the on-disk file. Requiring a
  // fills.migrationReview entry per kept stage forces the fallback's
  // on-disk read to leave a trace — one that names the stage, so it is
  // checked against the same stage's Local Customizations record, not a
  // single blanket claim covering stages that were never actually read.
  if (context.migrationGate) {
    const ack = fills.migrationReview;
    if (!ack || typeof ack !== 'object' || Array.isArray(ack)) {
      errors.push(
        `"--out" already exists with no baseline to diff against (an install that predates the assembler) — assemble refuses to overwrite it without fills.migrationReview, an object with one entry per kept stage (${keptIds.join(', ')}) naming what Step 6 item 2's on-disk-read fallback found there, or "none" where it found nothing`
      );
    } else {
      for (const id of keptIds) {
        const value = ack[id];
        if (typeof value !== 'string' || value.trim() === '') {
          errors.push(
            `fills.migrationReview has no acknowledgement for kept stage "${id}" — every kept stage needs a non-empty entry, even "none", since an omitted or empty one is not an acknowledgement`
          );
        }
      }
      for (const id of Object.keys(ack)) {
        if (!keptIds.includes(id))
          errors.push(
            `fills.migrationReview names "${id}", which is not a stage this run keeps`
          );
      }
    }
  }

  if (fills.stageOrder !== undefined && !Array.isArray(fills.stageOrder)) {
    errors.push(
      `stageOrder must be a JSON array of stage ids, not ${describeType(fills.stageOrder)} — it is ignored for the rest of this check`
    );
  } else if (fills.stageOrder) {
    const a = [...fills.stageOrder].sort().join(',');
    const b = [...keptIds].sort().join(',');
    if (a !== b)
      errors.push(
        `stageOrder must be a permutation of the kept stages (${keptIds.join(', ')}) — reordering and omitting are separate operations`
      );
  }

  // The set of ids assemble.mjs will ACTUALLY emit for this run — not just
  // the template's own stage ids. A repeated stage never emits its base id;
  // it emits one `${id}#${label}` marker per instance instead, and an
  // insert colliding with one of those is just as capable of corrupting
  // diff.mjs's re-parse as colliding with a plain template stage id.
  const emittedIds = new Set();
  for (const id of keptIds) {
    const instances = repeat[id];
    if (instances && instances.length) {
      for (const inst of instances) {
        if (typeof inst.label === 'string')
          emittedIds.add(`${id}#${inst.label}`);
      }
    } else {
      emittedIds.add(id);
    }
  }

  const insertStageIds = new Set();
  insert.forEach((ins, index) => {
    // The entry itself, before any of its fields are read: an insert that
    // is not an object has no anchor, id, title or body to check.
    if (!isPlainObject(ins)) {
      errors.push(
        `insert #${index + 1} must be a JSON object with "after"/"stage"/"title"/"body", not ${describeType(ins)}`
      );
      return;
    }
    if (!keptIds.includes(ins.after))
      errors.push(
        `insert is anchored after "${ins.after}", which is not an emitted stage`
      );
    if (!ins.stage || !ins.title || !ins.body)
      errors.push(
        `insert #${index + 1} (anchored after "${ins.after}") is missing one of stage/title/body — every insert needs all three`
      );
    if (typeof ins.title === 'string')
      checkTextHazards(
        `insert #${index + 1} (anchored after "${ins.after}")'s title`,
        ins.title
      );
    else if (ins.title !== undefined)
      errors.push(
        `insert #${index + 1} (anchored after "${ins.after}")'s title must be a string`
      );
    if (typeof ins.body === 'string')
      checkTextHazards(
        `insert #${index + 1} (anchored after "${ins.after}")'s body`,
        ins.body
      );
    else if (ins.body !== undefined)
      errors.push(
        `insert #${index + 1} (anchored after "${ins.after}")'s body must be a string`
      );
    if (ins.stage) {
      // Same shape constraint as a repeat instance label (LABEL_RE, above):
      // ins.stage becomes a marker id verbatim, and diff.mjs's STAGE_RE can
      // only re-parse the kebab shape.
      if (!LABEL_RE.test(ins.stage)) {
        errors.push(
          `insert stage id "${ins.stage}" must be lowercase kebab-case matching ${LABEL_RE.source} — it becomes the emitted marker id "${ins.stage}" and diff.mjs's STAGE_RE must be able to re-parse it`
        );
      } else if (emittedIds.has(ins.stage)) {
        errors.push(
          `insert stage id "${ins.stage}" collides with a stage id assemble will actually emit — give it a distinct id`
        );
      } else if (insertStageIds.has(ins.stage)) {
        errors.push(
          `insert stage id "${ins.stage}" is claimed by more than one insert — give each a distinct id`
        );
      }
      insertStageIds.add(ins.stage);
    }
  });

  for (const target of parsed.stepRefs) {
    if (!keptIds.includes(target))
      errors.push(
        `fixed prose carries <awos-step-ref stage="${target}"/>, but that stage is not emitted — the cross-reference would dangle`
      );
  }

  // A newline in a frontmatter field cannot be quoted around — YAML has no
  // escape that keeps a `key: value` line on one physical line once the
  // value itself contains one, so assemble.mjs's quoting (however it
  // quotes) cannot save it. A newline here either breaks the frontmatter
  // block's parse outright or, worse, injects what reads as a second
  // frontmatter key on the next line.
  const fm = fills.frontmatter || {};
  for (const key of ['description', 'argument-hint']) {
    const value = fm[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      errors.push(`frontmatter.${key} must be a string`);
      continue;
    }
    if (/[\r\n]/.test(value))
      errors.push(
        `frontmatter.${key} contains a newline — a frontmatter value must be a single line`
      );
  }

  return errors;
}
