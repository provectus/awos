const STAGE_RE =
  /<!--\s*awos:flow:stage=([a-z0-9#-]+)\s*-->([\s\S]*?)<!--\s*\/awos:flow:stage\s*-->/g;

function splitGenerated(src) {
  const stages = new Map();
  let preamble = src;
  STAGE_RE.lastIndex = 0;
  let m;
  while ((m = STAGE_RE.exec(src)) !== null) {
    stages.set(m[1], m[2].trim());
    preamble = preamble.replace(m[0], '');
  }
  return { preamble: preamble.replace(/\n{2,}/g, '\n').trim(), stages };
}

export function diffStages(generated, baseline) {
  if (baseline === null || baseline === undefined)
    return { baseline: 'absent' };

  const g = splitGenerated(generated);
  const b = splitGenerated(baseline);

  const stages = [];
  for (const [id, body] of b.stages) {
    if (!g.stages.has(id)) stages.push({ id, status: 'absent' });
    else
      stages.push({
        id,
        status: g.stages.get(id) === body ? 'unchanged' : 'edited',
      });
  }
  for (const id of g.stages.keys()) {
    if (!b.stages.has(id)) stages.push({ id, status: 'edited' });
  }

  return {
    baseline: 'present',
    preamble: g.preamble === b.preamble ? 'unchanged' : 'edited',
    stages,
  };
}
