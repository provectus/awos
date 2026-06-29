// topology_linked.test.ts — detectLinkedRepos unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
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

test('detectLinkedRepos finds a nested symlink pointing outside the repo', () => {
  // Simulates .claude/skills/<name> → <outside-repo-dir>
  const base = mkdtempSync(join(tmpdir(), 'awos-linked-nested-'));
  const repo = join(base, 'repo');
  const outsideRepo = join(base, 'other-repo-x');
  try {
    mkdirSync(repo);
    mkdirSync(outsideRepo);
    // Create .claude/skills/ nested dir
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(repo, '.claude', 'skills'), { recursive: true });
    // Create a symlink at .claude/skills/foo → ../../other-repo-x (outside repo)
    symlinkSync(outsideRepo, join(repo, '.claude', 'skills', 'foo'));

    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some((r) => r.name === 'other-repo-x'),
      `detectLinkedRepos must find a nested symlink pointing outside the repo, got ${JSON.stringify(linked)}`
    );
    const found = linked.find((r) => r.name === 'other-repo-x');
    assert.equal(
      found!.kind,
      'symlink',
      'nested out-of-repo symlink must have kind="symlink"'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('detectLinkedRepos ignores a symlink pointing inside the repo', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-linked-inrepo-'));
  try {
    // Create a target directory inside the repo
    mkdirSync(join(repo, 'local-module'), { recursive: true });
    // Create .claude/ and a symlink that points to something inside the repo
    mkdirSync(join(repo, '.claude'), { recursive: true });
    symlinkSync(
      join(repo, 'local-module'),
      join(repo, '.claude', 'inside-link')
    );

    const linked = detectLinkedRepos(repo);
    assert.ok(
      !linked.some((r) => r.name === 'local-module'),
      `detectLinkedRepos must NOT record an in-repo symlink, got ${JSON.stringify(linked)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('linked repo named from target repo root, not the symlink leaf', () => {
  const root = mkdtempSync(join(tmpdir(), 'awos-link-root-'));
  try {
    // sibling "repo" with a .git marker
    const sibling = join(root, 'onex-discovery-awos');
    mkdirSync(join(sibling, '.git'), { recursive: true });
    mkdirSync(join(sibling, '.claude', 'skills'), { recursive: true });
    // the audited repo with .claude/skills -> ../onex-discovery-awos/.claude/skills
    const repo = join(root, 'onex-discovery-api');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    symlinkSync(
      join(sibling, '.claude', 'skills'),
      join(repo, '.claude', 'skills')
    );

    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some((r) => r.name === 'onex-discovery-awos'),
      `expected name onex-discovery-awos; got ${JSON.stringify(linked)}`
    );
    assert.ok(
      !linked.some((r) => r.name === 'skills'),
      'must not be named "skills"'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Symlink scan must surface AWOS context/* symlinks, not only agent-tool config dirs (issue #6)', () => {
  const base = mkdtempSync(join(tmpdir(), 'awos-ctx-symlink-'));
  const outsideRepo = join(base, 'another-context-repo');
  const repo = join(base, 'repo');
  try {
    mkdirSync(outsideRepo, { recursive: true });
    mkdirSync(repo, { recursive: true });
    // Create context/ dir in repo with a symlink to an outside directory.
    mkdirSync(join(repo, 'context'), { recursive: true });
    symlinkSync(outsideRepo, join(repo, 'context', 'product'));

    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some(
        (r) => r.name === 'another-context-repo' || r.via.includes('context')
      ),
      `Symlink scan must surface AWOS context/* symlinks, not only agent-tool config dirs (issue #6): got ${JSON.stringify(linked)}`
    );
    const found = linked.find(
      (r) => r.name === 'another-context-repo' || r.via.includes('context')
    );
    assert.ok(found, 'context/ symlink must be detected');
    assert.equal(found!.kind, 'symlink', 'must be kind=symlink');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
