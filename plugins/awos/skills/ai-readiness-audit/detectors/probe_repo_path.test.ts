// probe_repo_path.test.ts — the one funnel through which a detector may
// consult an orchestration root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { probeRepoPath, inheritedNote } from './_base.ts';
import { tmpDir } from '../tests/helpers.ts';

const SUBSTANTIVE =
  '# Doc\n\nLine two.\nLine three.\nLine four.\nLine five.\nLine six.\nLine seven.\n';

test('own-repo capability wins over the orchestration root', () => {
  const base = tmpDir('awos-probe-own-');
  try {
    const root = join(base, 'root');
    const member = join(base, 'root', 'services', 'api');
    mkdirSync(member, { recursive: true });
    writeFileSync(join(root, 'CLAUDE.md'), SUBSTANTIVE);
    writeFileSync(join(member, 'CLAUDE.md'), SUBSTANTIVE);

    const res = probeRepoPath(
      member,
      { inheritance: { orchestrationRoot: root, inherits: true } },
      'CLAUDE.md'
    );
    assert.equal(
      res.origin,
      'own',
      'own-repo capability must always win — this is what keeps a self-sufficient member unchanged'
    );
    assert.equal(
      res.path,
      join(member, 'CLAUDE.md'),
      'the own path is returned'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a missing own path falls back to a substantive root path', () => {
  const base = tmpDir('awos-probe-inherit-');
  try {
    const root = join(base, 'root');
    const member = join(base, 'root', 'services', 'api');
    mkdirSync(member, { recursive: true });
    writeFileSync(join(root, 'CLAUDE.md'), SUBSTANTIVE);

    const res = probeRepoPath(
      member,
      { inheritance: { orchestrationRoot: root, inherits: true } },
      'CLAUDE.md'
    );
    assert.equal(
      res.origin,
      'inherited',
      'a member without the artifact must inherit the root’s copy'
    );
    assert.equal(
      res.path,
      join(root, 'CLAUDE.md'),
      'the root path is returned'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a boilerplate root path confers nothing', () => {
  const base = tmpDir('awos-probe-thin-');
  try {
    const root = join(base, 'root');
    const member = join(base, 'root', 'services', 'api');
    mkdirSync(member, { recursive: true });
    writeFileSync(join(root, 'CLAUDE.md'), '# TODO\n');

    const res = probeRepoPath(
      member,
      { inheritance: { orchestrationRoot: root, inherits: true } },
      'CLAUDE.md'
    );
    assert.equal(
      res.path,
      null,
      'a one-line placeholder at the root must not license credit — this is the anti-gaming gate'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('inherits:false ignores the root entirely', () => {
  const base = tmpDir('awos-probe-noinherit-');
  try {
    const root = join(base, 'root');
    const member = join(base, 'root', 'services', 'api');
    mkdirSync(member, { recursive: true });
    writeFileSync(join(root, 'CLAUDE.md'), SUBSTANTIVE);

    const res = probeRepoPath(
      member,
      { inheritance: { orchestrationRoot: root, inherits: false } },
      'CLAUDE.md'
    );
    assert.equal(
      res.path,
      null,
      'a category whose standards.toml policy is false must not inherit, even when a root is in scope'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('absent params behave exactly as before orchestration roots existed', () => {
  const repo = tmpDir('awos-probe-noparams-');
  try {
    writeFileSync(join(repo, 'CLAUDE.md'), SUBSTANTIVE);
    const res = probeRepoPath(repo, undefined, 'CLAUDE.md');
    assert.equal(
      res.origin,
      'own',
      'detectors called without params (unit tests, older callers) must keep working unchanged'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('inheritedNote annotates only inherited evidence', () => {
  assert.equal(
    inheritedNote('own', '.claude/skills found'),
    '.claude/skills found',
    'own evidence is left exactly as the detector wrote it'
  );
  assert.equal(
    inheritedNote('inherited', '.claude/skills found'),
    '.claude/skills found (inherited from orchestration root)',
    'inherited evidence carries a traceable suffix so a reader can see where the capability lives'
  );
});
