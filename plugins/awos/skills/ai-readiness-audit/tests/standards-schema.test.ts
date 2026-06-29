import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStandards } from './helpers.ts';
import { computeTopology } from '../topology.ts';
import { resolveSource } from '../metrics/_base.ts';

const VALID = new Set(['computed', 'detected', 'judgment']);
const categories = () => loadStandards().category as Record<string, any>;

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

test('every distinct source value used by a category resolves to a [source.*] entry with a non-empty url', () => {
  const standards = loadStandards() as Record<string, unknown>;
  const cats = standards.category as Record<string, any>;
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const [slug, cat] of Object.entries(cats)) {
    const sourceName: string | undefined = cat.source;
    if (!sourceName || seen.has(sourceName)) continue;
    seen.add(sourceName);
    const { url } = resolveSource(standards, sourceName);
    if (!url) {
      missing.push(
        `category ${slug} cites source "${sourceName}" which has no [source."${sourceName}"] entry with a non-empty url in standards.toml`
      );
    }
  }
  assert.deepEqual(
    missing,
    [],
    `All category source values must resolve to a verified [source.*] url:\n${missing.join('\n')}`
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
