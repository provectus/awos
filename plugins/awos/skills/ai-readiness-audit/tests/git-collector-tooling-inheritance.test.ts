// git-collector-tooling-inheritance.test.ts — ADP tooling layers inherit from
// an orchestration root, and a member's own tooling always wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { collect } from '../collectors/git.ts';
import { tmpDir } from './helpers.ts';

const PERIOD = {
  bucket_days: 30,
  lookback_days: 90,
  history_available_days: 0,
};

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'README.md'), '# repo\n');
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@e.x', 'commit', '-qm', 'init'],
    { cwd: dir, stdio: 'ignore' }
  );
}

function writeSkill(dir: string): void {
  mkdirSync(join(dir, '.claude', 'skills', 'demo'), { recursive: true });
  writeFileSync(
    join(dir, '.claude', 'skills', 'demo', 'SKILL.md'),
    '---\nname: demo\n---\n\nA demo skill with real content.\nLine five.\nLine six.\nLine seven.\n'
  );
}

test('tooling paths inherit from the orchestration root and are marked inherited', () => {
  const root = tmpDir('awos-tooling-inherit-');
  try {
    initRepo(root);
    writeSkill(root);
    const member = join(root, 'services', 'api');
    initRepo(member);

    const art = collect(member, PERIOD, { orchestrationRoot: root });
    const raw = art.raw as {
      tooling_paths: string[];
      tooling_path_origins: Record<string, string>;
      orchestration_root: string | null;
    };

    assert.ok(
      raw.tooling_paths.includes('.claude/skills'),
      `a member with no tooling of its own must inherit the root's skill directory, got ${JSON.stringify(raw.tooling_paths)}`
    );
    assert.equal(
      raw.tooling_path_origins['.claude/skills'],
      'inherited',
      'an inherited tooling path must be marked inherited so the report can attribute the credit'
    );
    assert.equal(
      raw.orchestration_root,
      root,
      'the resolved orchestration root must be persisted into git.json so enrich reads it back instead of re-detecting'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a member's own tooling wins over the root's", () => {
  const root = tmpDir('awos-tooling-own-wins-');
  try {
    initRepo(root);
    writeSkill(root);
    const member = join(root, 'services', 'api');
    initRepo(member);
    writeSkill(member);

    const art = collect(member, PERIOD, { orchestrationRoot: root });
    const raw = art.raw as {
      tooling_path_origins: Record<string, string>;
    };

    assert.equal(
      raw.tooling_path_origins['.claude/skills'],
      'own',
      "own-repo capability must always win over inherited credit — this is what keeps a self-sufficient member's results unchanged"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an empty tooling directory at the root confers nothing', () => {
  const root = tmpDir('awos-tooling-empty-');
  try {
    initRepo(root);
    mkdirSync(join(root, '.claude', 'skills'), { recursive: true });
    const member = join(root, 'services', 'api');
    initRepo(member);

    const art = collect(member, PERIOD, { orchestrationRoot: root });
    const raw = art.raw as { tooling_paths: string[] };

    assert.ok(
      !raw.tooling_paths.includes('.claude/skills'),
      'an empty directory at the root must not confer credit — this is the anti-gaming gate'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('with no orchestration root every path is own', () => {
  const repo = tmpDir('awos-tooling-standalone-');
  try {
    initRepo(repo);
    writeSkill(repo);

    const art = collect(repo, PERIOD, {});
    const raw = art.raw as {
      tooling_path_origins: Record<string, string>;
      orchestration_root: string | null;
    };

    assert.equal(
      raw.tooling_path_origins['.claude/skills'],
      'own',
      'a standalone repo owns all of its tooling paths'
    );
    assert.equal(
      raw.orchestration_root,
      null,
      'a standalone repo records a null orchestration root'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
