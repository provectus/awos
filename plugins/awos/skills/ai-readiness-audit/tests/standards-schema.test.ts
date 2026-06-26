import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStandards } from './helpers.ts';
import { computeTopology } from '../topology.ts';

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
