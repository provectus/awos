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
import { detectLinkedRepos, type LinkedRepo } from './topology.ts';
import { tmpDir } from './tests/helpers.ts';

test('detectLinkedRepos finds git submodules', () => {
  const repo = tmpDir('awos-linked-');
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
  const repo = tmpDir('awos-linked-empty-');
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
  const repo = tmpDir('awos-linked-meta-');
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
  const base = tmpDir('awos-linked-nested-');
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
  const repo = tmpDir('awos-linked-inrepo-');
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
  const root = tmpDir('awos-link-root-');
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
  const base = tmpDir('awos-ctx-symlink-');
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

// ---------------------------------------------------------------------------
// 6b.4 — expanded linked repo detection: all three kinds in one fixture
// ---------------------------------------------------------------------------

test('detectLinkedRepos: symlink outside repo NOT under tool-config dir surfaces as kind=symlink', () => {
  // The expanded walk must find symlinks in arbitrary dirs (e.g. src/), not just
  // agent-tool config dirs or AWOS framework dirs.
  const base = tmpDir('awos-broad-symlink-');
  const outsideRepo = join(base, 'shared-lib');
  const repo = join(base, 'repo');
  try {
    mkdirSync(join(outsideRepo, '.git'), { recursive: true }); // give it a .git so the name resolves
    mkdirSync(join(repo, 'src'), { recursive: true });
    // Place a symlink inside src/ (not under any tool-config dir).
    symlinkSync(outsideRepo, join(repo, 'src', 'lib'));

    const linked = detectLinkedRepos(repo);
    const found = linked.find((r) => r.name === 'shared-lib');
    assert.ok(
      found !== undefined,
      `detectLinkedRepos must find a symlink under src/ pointing outside the repo; got ${JSON.stringify(linked)}`
    );
    assert.equal(
      found!.kind,
      'symlink',
      'symlink outside tool-config dir must have kind="symlink"'
    );
    assert.equal(
      found!.via,
      'src/lib',
      `via must be the clean relative path "src/lib" with no leading slash; got "${found!.via}"`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('detectLinkedRepos: .mcp.json servers appear as kind=mcp entries', () => {
  const repo = tmpDir('awos-mcp-json-');
  try {
    writeFileSync(
      join(repo, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'github-mcp': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
          },
          'filesystem-mcp': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
          },
        },
      })
    );

    const linked = detectLinkedRepos(repo);

    const githubMcp = linked.find((r) => r.name === 'github-mcp');
    const fsMcp = linked.find((r) => r.name === 'filesystem-mcp');

    assert.ok(
      githubMcp !== undefined,
      `detectLinkedRepos must detect "github-mcp" from .mcp.json; got ${JSON.stringify(linked)}`
    );
    assert.equal(
      githubMcp!.kind,
      'mcp',
      'MCP server entry must have kind="mcp"'
    );
    assert.equal(
      githubMcp!.via,
      '.mcp.json',
      'MCP server via must reference .mcp.json'
    );

    assert.ok(
      fsMcp !== undefined,
      'detectLinkedRepos must detect "filesystem-mcp" from .mcp.json'
    );
    assert.equal(
      fsMcp!.kind,
      'mcp',
      'second MCP server must also have kind="mcp"'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectLinkedRepos: .claude/settings.json mcpServers appear as kind=mcp entries', () => {
  const repo = tmpDir('awos-claude-settings-mcp-');
  try {
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(
      join(repo, '.claude', 'settings.json'),
      JSON.stringify({
        mcpServers: {
          'atlassian-mcp': { command: 'node', args: ['dist/index.js'] },
        },
      })
    );

    const linked = detectLinkedRepos(repo);
    const found = linked.find((r) => r.name === 'atlassian-mcp');
    assert.ok(
      found !== undefined,
      `detectLinkedRepos must detect "atlassian-mcp" from .claude/settings.json; got ${JSON.stringify(linked)}`
    );
    assert.equal(found!.kind, 'mcp', 'must be kind="mcp"');
    assert.equal(
      found!.via,
      '.claude/settings.json',
      'via must reference .claude/settings.json'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectLinkedRepos: all three kinds (symlink + submodule + mcp) surface together', () => {
  // A repo with:
  // - .gitmodules with one submodule
  // - an outside symlink NOT under a tool-config dir (under lib/)
  // - .mcp.json with 2 MCP servers
  // All three kinds must appear in the result.
  const base = tmpDir('awos-all-kinds-');
  const outsideTarget = join(base, 'external-repo');
  const repo = join(base, 'my-repo');
  try {
    mkdirSync(join(outsideTarget, '.git'), { recursive: true });
    mkdirSync(join(repo, 'lib'), { recursive: true });

    // Submodule
    writeFileSync(
      join(repo, '.gitmodules'),
      '[submodule "vendor/ui"]\n  path = vendor/ui\n  url = https://github.com/acme/ui-kit.git\n'
    );

    // Outside symlink not under tool-config dir
    symlinkSync(outsideTarget, join(repo, 'lib', 'external'));

    // MCP servers
    writeFileSync(
      join(repo, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'server-alpha': { command: 'node', args: ['alpha/index.js'] },
          'server-beta': { command: 'node', args: ['beta/index.js'] },
        },
      })
    );

    const linked = detectLinkedRepos(repo);

    // Submodule
    const sub = linked.find((r: LinkedRepo) => r.kind === 'submodule');
    assert.ok(
      sub !== undefined,
      `submodule must be detected; got ${JSON.stringify(linked)}`
    );
    assert.equal(sub!.name, 'ui-kit', 'submodule name must be "ui-kit"');

    // Symlink
    const sym = linked.find((r: LinkedRepo) => r.kind === 'symlink');
    assert.ok(
      sym !== undefined,
      `outside symlink under lib/ must be detected; got ${JSON.stringify(linked)}`
    );
    assert.equal(
      sym!.name,
      'external-repo',
      'symlink name must be "external-repo"'
    );

    // MCP servers (2)
    const mcps = linked.filter((r: LinkedRepo) => r.kind === 'mcp');
    assert.equal(
      mcps.length,
      2,
      `exactly 2 MCP server entries must be detected; got ${JSON.stringify(mcps)}`
    );
    const mcpNames = mcps.map((r: LinkedRepo) => r.name).sort();
    assert.deepEqual(
      mcpNames,
      ['server-alpha', 'server-beta'],
      `MCP server names must match; got ${JSON.stringify(mcpNames)}`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Dangling-symlink relative-path fix (issue: relative dangling symlinks
// were always recorded as external because rawTarget never starts with the
// absolute realRepoRoot).
// ---------------------------------------------------------------------------

test('detectLinkedRepos: dangling relative symlink pointing OUTSIDE repo IS recorded', () => {
  // link x -> ../outside-thing  (resolves outside repo, target does not exist)
  const base = tmpDir('awos-dangle-out-');
  const repo = join(base, 'repo');
  try {
    mkdirSync(repo, { recursive: true });
    // ../outside-thing resolves to base/outside-thing — outside repo, dangling
    symlinkSync('../outside-thing', join(repo, 'x'));

    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some((r) => r.name === 'outside-thing'),
      `dangling relative symlink pointing outside repo must be recorded as linked repo; got ${JSON.stringify(linked)}`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('detectLinkedRepos: dangling relative symlink pointing INSIDE repo is NOT recorded', () => {
  // link y -> ./does-not-exist-yet  (resolves inside repo, target does not exist)
  const repo = tmpDir('awos-dangle-in-');
  try {
    // ./does-not-exist-yet resolves to repo/does-not-exist-yet — inside repo, dangling
    symlinkSync('./does-not-exist-yet', join(repo, 'y'));

    const linked = detectLinkedRepos(repo);
    assert.ok(
      !linked.some((r) => r.name === 'does-not-exist-yet'),
      `dangling relative symlink resolving inside the repo must NOT be recorded as linked repo; got ${JSON.stringify(linked)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectLinkedRepos: dangling absolute symlink pointing outside repo IS recorded (regression)', () => {
  // Absolute dangling path — the old rawTarget.startsWith(realRepoRoot) check
  // handled this; must still work after the relative-path fix.
  const repo = tmpDir('awos-dangle-abs-');
  try {
    // /tmp/absolute-outside-dangling does not exist and is outside repo
    symlinkSync('/tmp/absolute-outside-dangling', join(repo, 'z'));

    const linked = detectLinkedRepos(repo);
    assert.ok(
      linked.some((r) => r.name === 'absolute-outside-dangling'),
      `dangling absolute symlink pointing outside repo must be recorded as linked repo; got ${JSON.stringify(linked)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
