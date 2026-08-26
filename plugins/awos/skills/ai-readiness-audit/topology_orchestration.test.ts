// topology_orchestration.test.ts — orchestration-root detection unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  detectOrchestrationRelation,
  detectOrchestrationMembers,
  computeTopology,
  ORCHESTRATION_WIDENED_FLAGS,
} from './topology.ts';
import { tmpDir } from './tests/helpers.ts';

/** Initialise a git repo with an initial commit so rev-parse resolves. */
function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'README.md'), '# repo\n');
}

/** Write a plausible agent-tooling surface into `dir`. */
function writeTooling(dir: string): void {
  mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
  writeFileSync(
    join(dir, '.claude', 'commands', 'ship.md'),
    '# Ship\n\nA real command with enough lines\nto clear the substantive bar.\nLine four.\nLine five.\nLine six.\n'
  );
  writeFileSync(join(dir, '.mcp.json'), '{"mcpServers":{}}\n');
}

test('detectOrchestrationRelation finds a tooling-bearing parent work tree', () => {
  const root = tmpDir('awos-orch-root-');
  try {
    initRepo(root);
    writeTooling(root);
    writeFileSync(join(root, '.gitignore'), 'services/\n');
    const member = join(root, 'services', 'api');
    initRepo(member);

    const rel = detectOrchestrationRelation(member);
    assert.ok(
      rel.root !== null,
      'a member repo nested in a tooling-bearing parent work tree must resolve an orchestration root'
    );
    assert.equal(
      rel.ignored,
      true,
      'the relation must record that the parent gitignores the member, as report evidence'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectOrchestrationRelation resolves a member the parent does NOT gitignore', () => {
  const root = tmpDir('awos-orch-unignored-');
  try {
    initRepo(root);
    writeTooling(root);
    const member = join(root, 'vendor', 'api');
    initRepo(member);

    const rel = detectOrchestrationRelation(member);
    assert.ok(
      rel.root !== null,
      'detection must key on "nested distinct work tree", not on gitignore status — an untracked nested repo has the same inheritance problem'
    );
    assert.equal(
      rel.ignored,
      false,
      'ignored must be false when the parent does not gitignore the member'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectOrchestrationRelation refuses a parent with no agent tooling', () => {
  const root = tmpDir('awos-orch-notooling-');
  try {
    initRepo(root);
    const member = join(root, 'nested');
    initRepo(member);

    assert.equal(
      detectOrchestrationRelation(member).root,
      null,
      'a plain repo cloned inside another repo must NOT be treated as an orchestration relation — the tooling gate is what distinguishes the two'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectOrchestrationRelation refuses a parent whose tooling is boilerplate', () => {
  const root = tmpDir('awos-orch-thin-');
  try {
    initRepo(root);
    mkdirSync(join(root, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(root, '.claude', 'commands', 'stub.md'), '# TODO\n');
    const member = join(root, 'services', 'api');
    initRepo(member);

    assert.equal(
      detectOrchestrationRelation(member).root,
      null,
      'a parent whose only tooling file is boilerplate must not confer inheritance — this is the anti-gaming gate'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectOrchestrationRelation excludes git submodules', () => {
  const root = tmpDir('awos-orch-submodule-');
  try {
    initRepo(root);
    writeTooling(root);
    writeFileSync(
      join(root, '.gitmodules'),
      '[submodule "api"]\n  path = services/api\n  url = https://example.com/api.git\n'
    );
    const member = join(root, 'services', 'api');
    initRepo(member);

    assert.equal(
      detectOrchestrationRelation(member).root,
      null,
      'a submodule is a nested work tree but a different problem shape (double-counting, not missing credit) and is out of scope'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectOrchestrationRelation returns null for a standalone repo', () => {
  const repo = tmpDir('awos-orch-standalone-');
  try {
    initRepo(repo);
    writeTooling(repo);
    assert.equal(
      detectOrchestrationRelation(repo).root,
      null,
      'a repo with no parent work tree has no orchestration root'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectOrchestrationRelation ignores a symlinked sibling', () => {
  const base = tmpDir('awos-orch-symlink-');
  try {
    const root = join(base, 'root');
    const sibling = join(base, 'sibling');
    initRepo(root);
    writeTooling(root);
    initRepo(sibling);
    symlinkSync(sibling, join(root, 'linked'));

    assert.equal(
      detectOrchestrationRelation(sibling).root,
      null,
      'a repo reached only through a symlink is not nested inside the root and must not inherit'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('detectOrchestrationMembers lists nested member work trees', () => {
  const root = tmpDir('awos-orch-members-');
  try {
    initRepo(root);
    writeTooling(root);
    initRepo(join(root, 'services', 'api'));
    initRepo(join(root, 'services', 'web'));

    const members = detectOrchestrationMembers(root);
    assert.equal(
      members.length,
      2,
      `detectOrchestrationMembers must find both nested work trees, got ${JSON.stringify(members)}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectOrchestrationMembers returns [] for a repo with no nested repos', () => {
  const root = tmpDir('awos-orch-nomembers-');
  try {
    initRepo(root);
    writeTooling(root);
    mkdirSync(join(root, 'src'), { recursive: true });

    assert.deepEqual(
      detectOrchestrationMembers(root),
      [],
      'an ordinary repo must report no members, so mode detection does not misfire into org mode'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('computeTopology widens agent-file flags to the orchestration root', () => {
  const root = tmpDir('awos-orch-topo-');
  try {
    initRepo(root);
    writeTooling(root);
    const member = join(root, 'services', 'api');
    initRepo(member);

    const bare = computeTopology(member);
    assert.equal(
      bare.has_ai_agent_files,
      false,
      'without an orchestration root the member has no agent files of its own'
    );

    const widened = computeTopology(member, undefined, root);
    assert.equal(
      widened.has_ai_agent_files,
      true,
      'has_ai_agent_files must widen to the orchestration root, otherwise PRV-07/PRV-17 SKIP before inheritance can apply'
    );
    assert.equal(
      widened.has_commands_or_skills,
      true,
      'has_commands_or_skills must widen to the orchestration root, otherwise AIS-07 SKIPs before inheritance can apply'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('computeTopology keeps member-local flags member-local', () => {
  const root = tmpDir('awos-orch-topo-local-');
  try {
    initRepo(root);
    writeTooling(root);
    writeFileSync(join(root, 'package.json'), '{"name":"root"}\n');
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(root, '.github', 'workflows', 'ci.yml'),
      'name: ci\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n'
    );
    const member = join(root, 'services', 'api');
    initRepo(member);

    const widened = computeTopology(member, undefined, root);
    assert.equal(
      widened.has_ci,
      false,
      "has_ci describes the member's own pipeline and must never absorb the root's — a member with no CI must not be reported as having CI"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ORCHESTRATION_WIDENED_FLAGS is the declared widening set', () => {
  assert.deepEqual(
    [...ORCHESTRATION_WIDENED_FLAGS].sort(),
    [
      'has_agent_instruction_files',
      'has_ai_agent_files',
      'has_commands_or_skills',
    ],
    'the widened-flag set is a contract other tests assert against; changing it must be deliberate'
  );
});
