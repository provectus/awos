// tooling_depth_inheritance.test.ts — inherited tooling layers are labelled as
// inherited, so a report reader can trace where the capability actually lives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { compute } from './tooling_depth.ts';
import { tmpDir } from '../tests/helpers.ts';

/** Write a minimal collected/git.json artifact with the given tooling scan. */
function writeGitArtifact(
  dir: string,
  paths: string[],
  origins: Record<string, string>
): void {
  const collectedDir = join(dir, 'collected');
  mkdirSync(collectedDir, { recursive: true });
  writeFileSync(
    join(collectedDir, 'git.json'),
    JSON.stringify({
      source: 'git',
      available: true,
      raw: {
        tooling_paths: paths,
        tooling_path_origins: origins,
        orchestration_root: '/tmp/root',
        orchestration_root_ignored: true,
      },
    })
  );
}

test('an inherited tooling layer is labelled inherited in its evidence', () => {
  const dir = tmpDir('awos-tooling-depth-');
  try {
    writeGitArtifact(dir, ['.claude/skills'], {
      '.claude/skills': 'inherited',
    });
    const result = compute(join(dir, 'collected'), {}, {});
    const evidence = result.evidence_per_code?.[102] ?? [];
    assert.ok(
      evidence.some((e) => /inherited from orchestration root/.test(e)),
      `ADP-02's evidence must name the orchestration root when the credit is inherited, got ${JSON.stringify(evidence)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an own tooling layer keeps its plain evidence wording', () => {
  const dir = tmpDir('awos-tooling-depth-own-');
  try {
    writeGitArtifact(dir, ['.claude/skills'], { '.claude/skills': 'own' });
    const result = compute(join(dir, 'collected'), {}, {});
    const evidence = result.evidence_per_code?.[102] ?? [];
    assert.ok(
      evidence.every((e) => !/inherited/.test(e)),
      `own-repo capability must not be reported as inherited, got ${JSON.stringify(evidence)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a layer with mixed-origin paths (one own, one inherited) keeps plain wording', () => {
  // Code 103 (rule/command dirs) has multiple registry paths — '.claude/commands'
  // (Claude Code) and '.cursor/rules' (Cursor) both map to it (agent_tools.ts).
  // A repo can carry both: its own '.claude/commands' plus a '.cursor/rules'
  // inherited from the orchestration root. The member repo genuinely owns part
  // of this layer's capability, so labelling it "inherited" would misinform a
  // reader into thinking the repo has no native tooling here — it does.
  const dir = tmpDir('awos-tooling-depth-mixed-');
  try {
    writeGitArtifact(dir, ['.claude/commands', '.cursor/rules'], {
      '.claude/commands': 'own',
      '.cursor/rules': 'inherited',
    });
    const result = compute(join(dir, 'collected'), {}, {});
    const evidence = result.evidence_per_code?.[103] ?? [];
    assert.ok(
      evidence.every((e) => !/inherited/.test(e)),
      `a layer where the repository holds any of its own capability must never be reported as inherited, because that would tell a reader the member has no native tooling for that layer when it does; got ${JSON.stringify(evidence)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a git.json without origins still scores (backward compatibility)', () => {
  const dir = tmpDir('awos-tooling-depth-legacy-');
  try {
    const collectedDir = join(dir, 'collected');
    mkdirSync(collectedDir, { recursive: true });
    writeFileSync(
      join(collectedDir, 'git.json'),
      JSON.stringify({
        source: 'git',
        available: true,
        raw: { tooling_paths: ['.claude/skills'] },
      })
    );
    const result = compute(collectedDir, {}, {});
    assert.ok(
      result.categories_awarded.includes(102),
      'an artifact written by an older engine has no tooling_path_origins and must still award its layers'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
