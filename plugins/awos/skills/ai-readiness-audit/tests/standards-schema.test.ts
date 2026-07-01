import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStandards } from './helpers.ts';
import { metaNumber } from '../metrics/_base.ts';
import { computeTopology } from '../topology.ts';

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
  const tmpDir = mkdtempSync(join(tmpdir(), 'topology-guard-'));
  const topologyFlags = computeTopology(tmpDir);
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
