// topology_linked.test.ts — detectLinkedRepos unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectLinkedRepos } from './topology.ts';

test('detectLinkedRepos finds git submodules', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-linked-'));
  try {
    writeFileSync(
      join(repo, '.gitmodules'),
      '[submodule "x"]\n  path = vendor/x\n  url = https://example.com/onex-discovery-awos.git\n'
    );
    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some((r) => r.name === 'onex-discovery-awos'),
      `detectLinkedRepos must extract submodule name from .gitmodules url, got ${JSON.stringify(linked)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectLinkedRepos returns empty array for repo with no submodules or symlinks', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-linked-empty-'));
  try {
    const linked = detectLinkedRepos(repo);
    assert.deepStrictEqual(
      linked,
      [],
      'detectLinkedRepos must return [] when no .gitmodules and no agent-tool symlinks exist'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectLinkedRepos sets kind=submodule and via=.gitmodules', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-linked-meta-'));
  try {
    writeFileSync(
      join(repo, '.gitmodules'),
      '[submodule "lib"]\n  path = lib\n  url = https://github.com/acme/shared-lib.git\n'
    );
    const linked = detectLinkedRepos(repo);
    const found = linked.find((r) => r.name === 'shared-lib');
    assert.ok(found, 'shared-lib submodule not detected');
    assert.equal(
      found!.kind,
      'submodule',
      'linked repo kind must be "submodule" for .gitmodules entries'
    );
    assert.equal(
      found!.via,
      '.gitmodules',
      'linked repo via must be ".gitmodules" for .gitmodules entries'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
