/**
 * topology-nested-manifests.test.ts — supply-chain topology flags see
 * manifests at any depth.
 *
 * Regression pin: has_package_ecosystem / has_package_manifests /
 * has_lockfiles were probed with a root-level-only existsSync. A multi-module
 * monorepo keeping every manifest in subdirectories (observed in the wild:
 * hop-ui/package.json + pnpm-lock.yaml, hop-backend/build.gradle.kts, nothing
 * at the root) got all three flags false, gating six of eight Supply Chain
 * checks to SKIP despite the repo obviously having dependencies. The monorepo
 * probe also ignored Gradle manifests entirely.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { computeTopology } from '../topology.ts';

function makeRepo(files: Record<string, string>): string {
  const t = mkdtempSync(join(tmpdir(), 'topo-nested-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(t, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return t;
}

test('monorepo with manifests only in subdirectories: package flags and is_monorepo are true', () => {
  const t = makeRepo({
    'ui/package.json': '{"name":"ui"}\n',
    'ui/pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'backend/build.gradle.kts': 'plugins { kotlin("jvm") }\n',
    'README.md': '# repo with nothing buildable at the root\n',
  });
  const flags = computeTopology(t);

  assert.equal(
    flags.has_package_ecosystem,
    true,
    'a manifest in a subdirectory is still a package ecosystem — root-only probing gated Supply Chain to SKIP'
  );
  assert.equal(
    flags.has_package_manifests,
    true,
    'has_package_manifests must match has_package_ecosystem for nested manifests'
  );
  assert.equal(
    flags.has_lockfiles,
    true,
    'a lockfile in a subdirectory (ui/pnpm-lock.yaml) must set has_lockfiles'
  );
  assert.equal(
    flags.is_monorepo,
    true,
    'two manifest-bearing directories (ui/, backend/) are two build roots — Gradle manifests must count'
  );
});

test('co-located manifests are one build root, not a monorepo', () => {
  const t = makeRepo({
    'pyproject.toml': '[project]\nname = "app"\n',
    'setup.py': 'from setuptools import setup\nsetup()\n',
  });
  const flags = computeTopology(t);

  assert.equal(
    flags.has_package_ecosystem,
    true,
    'root manifests must still set has_package_ecosystem'
  );
  assert.equal(
    flags.is_monorepo,
    false,
    'pyproject.toml + setup.py in the same directory is one build root — raw hit-counting would misreport a monorepo'
  );
});

test('gradle.lockfile counts as a lockfile', () => {
  const t = makeRepo({
    'backend/build.gradle.kts': 'plugins { java }\n',
    'backend/gradle.lockfile': 'org.example:lib:1.0=compileClasspath\n',
  });
  assert.equal(
    computeTopology(t).has_lockfiles,
    true,
    'Gradle dependency locking (gradle.lockfile) must set has_lockfiles'
  );
});

test('manifests inside pruned directories (node_modules) do not count', () => {
  const t = makeRepo({
    'node_modules/left-pad/package.json': '{"name":"left-pad"}\n',
    'src/main.md': 'not a manifest\n',
  });
  const flags = computeTopology(t);

  assert.equal(
    flags.has_package_ecosystem,
    false,
    'a vendored dependency manifest is not the project’s own ecosystem — walker pruning must apply to the probe'
  );
  assert.equal(
    flags.is_monorepo,
    false,
    'pruned directories must not contribute build roots'
  );
});
