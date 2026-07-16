import { test } from 'node:test';
import assert from 'node:assert/strict';
import {} from 'node:fs';
import { join } from 'node:path';
import { loadStandards } from './helpers.ts';
import { metaNumber } from '../metrics/_base.ts';
import { computeTopology } from '../topology.ts';
import { tmpDir } from './helpers.ts';

const VALID = new Set(['computed', 'detected', 'judgment']);
const categories = () => loadStandards().category as Record<string, any>;

test('metaNumber reads [meta] tunables from standards.toml (source of truth), with fallback', () => {
  assert.equal(metaNumber({ meta: { x: 0.05 } }, 'x', 0.9), 0.05);
  assert.equal(
    metaNumber({ meta: {} }, 'x', 0.9),
    0.9,
    'fallback applies when the key is absent'
  );
  assert.equal(
    metaNumber({}, 'x', 0.9),
    0.9,
    'fallback applies when there is no [meta] table'
  );
  // The real tunables must live in standards.toml [meta], not hardcoded in code.
  const s = loadStandards() as Record<string, unknown>;
  for (const key of [
    'max_lookback_days',
    'active_contributor_threshold',
    'rework_horizon_days',
  ]) {
    const sentinel = -999;
    assert.notEqual(
      metaNumber(s, key, sentinel),
      sentinel,
      `standards.toml [meta] must define ${key} (code reads it from there, never hardcodes it)`
    );
  }
});

test('every category declares a valid method', () => {
  for (const [slug, cat] of Object.entries(categories())) {
    assert.ok('method' in cat, `category ${slug} missing method`);
    assert.ok(
      VALID.has(cat.method),
      `category ${slug} has bad method ${cat.method}`
    );
  }
});

test('judgment categories have rubric and evidence', () => {
  for (const [slug, cat] of Object.entries(categories())) {
    if (cat.method === 'judgment') {
      assert.ok(cat.rubric, `judgment category ${slug} must declare a rubric`);
      assert.ok(
        Array.isArray(cat.evidence_required) && cat.evidence_required.length,
        `judgment category ${slug} must declare a non-empty evidence_required array`
      );
    }
  }
});

test('non-judgment categories carry no rubric', () => {
  for (const [slug, cat] of Object.entries(categories())) {
    if (cat.method !== 'judgment') {
      assert.ok(
        !('rubric' in cat),
        `${cat.method} category ${slug} must not carry a rubric`
      );
    }
  }
});

test('every [category.*] has a non-empty url and date field', () => {
  const cats = categories();
  const missing: string[] = [];
  for (const [slug, cat] of Object.entries(cats)) {
    if (!cat.url || typeof cat.url !== 'string' || cat.url.trim() === '') {
      missing.push(
        `category ${slug} is missing a non-empty url field — add url directly to the [category.*] block`
      );
    }
    if (!cat.date || typeof cat.date !== 'string' || cat.date.trim() === '') {
      missing.push(
        `category ${slug} is missing a non-empty date field — add date directly to the [category.*] block`
      );
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Every [category.*] must carry its own non-empty url and date fields:\n${missing.join('\n')}`
  );
});

test('every topology.* applies_when flag is computed by topology.ts', () => {
  const guardDir = tmpDir('topology-guard-');
  const topologyFlags = computeTopology(guardDir);
  const missing: string[] = [];
  for (const [slug, cat] of Object.entries(categories())) {
    const aw: string | undefined = (cat as any).applies_when;
    if (typeof aw === 'string') {
      const m = aw.match(/^topology\.(\w+)$/);
      if (m) {
        const flagName = m[1];
        if (!(flagName in topologyFlags)) {
          missing.push(
            `${slug}: applies_when references topology.${flagName} which is not computed in topology.ts`
          );
        }
      }
    }
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

// A source URL must deep-link to the page that explains the metric, never a
// bare domain root / marketing landing page (which rarely defines the metric).
test('no category source url is a bare domain root', () => {
  const offenders: string[] = [];
  for (const [slug, cat] of Object.entries(categories())) {
    const url: string | undefined = cat.url;
    if (!url) continue;
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      offenders.push(`${slug}: unparseable url ${url}`);
      continue;
    }
    if (path === '' || path === '/') {
      offenders.push(`${slug}: url is a bare domain root (${url})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `every category url must deep-link to the page that explains the metric, not a site root:\n${offenders.join('\n')}`
  );
});

// The inline lead shown on the report (summary ?? definition) must stay concise;
// verbose mechanics belong in the tooltip via the full `definition`, so a long
// definition is fine ONLY when a short `summary` fronts it.
test('every category inline lead (summary ?? definition) is concise', () => {
  const MAX = 320;
  const offenders: string[] = [];
  for (const [slug, cat] of Object.entries(categories())) {
    const lead: string = (cat.summary ?? cat.definition ?? '') as string;
    if (lead.length > MAX) {
      offenders.push(
        `${slug}: inline lead is ${lead.length} chars (max ${MAX}) — add a concise \`summary\``
      );
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `report inline leads must be concise (add a \`summary\` and keep detail in \`definition\`):\n${offenders.join('\n')}`
  );
});

// ---------------------------------------------------------------------------
// Prevention-coverage schema contracts: the cluster pairing and the
// covers_checks cross-references that the linkage pass (prevention.ts)
// consumes. A typo here would silently drop a cluster or a covered check.
// ---------------------------------------------------------------------------

test('cluster/covers_checks keys appear only on prevention-coverage categories', () => {
  const offenders: string[] = [];
  for (const [slug, cat] of Object.entries(categories())) {
    if (cat.dimension === 'prevention-coverage') {
      if (typeof cat.cluster !== 'string' || cat.cluster.trim() === '') {
        offenders.push(`${slug}: prevention-coverage category missing cluster`);
      }
    } else {
      if ('cluster' in cat)
        offenders.push(`${slug}: cluster key outside prevention-coverage`);
      if ('covers_checks' in cat)
        offenders.push(
          `${slug}: covers_checks key outside prevention-coverage`
        );
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `cluster metadata is a prevention-coverage contract:\n${offenders.join('\n')}`
  );
});

test('every prevention cluster pairs exactly one detected and one judgment category', () => {
  const byCluster = new Map<
    string,
    { detected: string[]; judgment: string[] }
  >();
  for (const [slug, cat] of Object.entries(categories())) {
    if (cat.dimension !== 'prevention-coverage') continue;
    const entry = byCluster.get(cat.cluster) ?? { detected: [], judgment: [] };
    if (cat.method === 'detected') entry.detected.push(slug);
    else if (cat.method === 'judgment') entry.judgment.push(slug);
    byCluster.set(cat.cluster, entry);
  }
  assert.ok(byCluster.size > 0, 'prevention-coverage clusters must exist');
  const offenders: string[] = [];
  for (const [cluster, { detected, judgment }] of byCluster) {
    if (detected.length !== 1)
      offenders.push(
        `cluster ${cluster}: expected exactly 1 detected (enforcement) category, got ${detected.length}`
      );
    if (judgment.length !== 1)
      offenders.push(
        `cluster ${cluster}: expected exactly 1 judgment (instruction) category, got ${judgment.length}`
      );
  }
  assert.deepEqual(
    offenders,
    [],
    `each cluster is one enforcement + one instruction category:\n${offenders.join('\n')}`
  );
});

test('covers_checks lives on the enforcement half only and resolves to real non-PRV check_ids', () => {
  const cats = categories();
  const allCheckIds = new Set<string>();
  for (const cat of Object.values(cats)) {
    if (typeof cat.check_id === 'string') allCheckIds.add(cat.check_id);
  }
  const offenders: string[] = [];
  for (const [slug, cat] of Object.entries(cats)) {
    if (cat.dimension !== 'prevention-coverage') continue;
    if (cat.method === 'detected') {
      if (!Array.isArray(cat.covers_checks) || cat.covers_checks.length === 0) {
        offenders.push(
          `${slug}: enforcement category must declare a non-empty covers_checks array`
        );
        continue;
      }
      for (const id of cat.covers_checks) {
        if (!allCheckIds.has(id)) {
          offenders.push(
            `${slug}: covers_checks entry ${id} matches no check_id in standards.toml`
          );
        } else if (
          Object.values(cats).some(
            (c) => c.check_id === id && c.dimension === 'prevention-coverage'
          )
        ) {
          offenders.push(
            `${slug}: covers_checks entry ${id} targets a prevention-coverage category (no self-coverage)`
          );
        }
      }
    } else if ('covers_checks' in cat) {
      offenders.push(
        `${slug}: covers_checks belongs on the enforcement (detected) half only`
      );
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `covers_checks is the linkage join key — every entry must resolve:\n${offenders.join('\n')}`
  );
});

test('prevention pairs share applies_when and lock the 3/2 weight contract', () => {
  const cats = categories();
  const byCluster = new Map<string, Record<string, any>[]>();
  for (const cat of Object.values(cats)) {
    if (cat.dimension !== 'prevention-coverage') continue;
    const list = byCluster.get(cat.cluster) ?? [];
    list.push(cat);
    byCluster.set(cat.cluster, list);
  }
  const offenders: string[] = [];
  for (const [cluster, pair] of byCluster) {
    const enforcement = pair.find((c) => c.method === 'detected');
    const instruction = pair.find((c) => c.method === 'judgment');
    if (!enforcement || !instruction) continue; // pairing test reports this
    if (enforcement.applies_when !== instruction.applies_when) {
      offenders.push(
        `cluster ${cluster}: halves disagree on applies_when (${enforcement.applies_when} vs ${instruction.applies_when}) — a half-skipped cluster cannot classify`
      );
    }
    if (enforcement.weight !== 3)
      offenders.push(
        `cluster ${cluster}: enforcement weight must be 3, got ${enforcement.weight}`
      );
    if (instruction.weight !== 2)
      offenders.push(
        `cluster ${cluster}: instruction weight must be 2, got ${instruction.weight}`
      );
  }
  assert.deepEqual(
    offenders,
    [],
    `prevention pair contract (shared applies_when, weights 3/2):\n${offenders.join('\n')}`
  );
});
