// spec_frameworks.test.ts — the recognized spec-practice registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { detectSpecFrameworks, SPEC_FRAMEWORKS } from './spec_frameworks.ts';
import { tmpDir } from './tests/helpers.ts';

const BODY =
  'Line one.\nLine two.\nLine three.\nLine four.\nLine five.\nLine six.\nLine seven.\n';

test('AWOS is recognized', () => {
  const repo = tmpDir('awos-fw-awos-');
  try {
    mkdirSync(join(repo, '.awos', 'commands'), { recursive: true });
    writeFileSync(join(repo, '.awos', 'commands', 'spec.md'), BODY);
    const found = detectSpecFrameworks(repo).map((f) => f.framework.id);
    assert.ok(found.includes('awos'), `AWOS must be recognized, got ${found}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('an ADR practice is recognized as spec-driven discipline', () => {
  const repo = tmpDir('awos-fw-adr-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    for (const n of [
      '0001-use-postgres.md',
      '0002-split-api.md',
      '0003-drop-redis.md',
    ]) {
      writeFileSync(
        join(repo, 'docs', 'adr', n),
        `# ${n}\n\n## Status\n\nAccepted\n\n## Context\n\n${BODY}\n## Decision\n\n${BODY}\n## Consequences\n\n${BODY}`
      );
    }
    const found = detectSpecFrameworks(repo).map((f) => f.framework.id);
    assert.ok(
      found.includes('adr'),
      'a repo with a real ADR practice must earn spec-driven credit — the dimension measures discipline, not which vendor’s framework is installed'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a single stray ADR does not count as a practice', () => {
  const repo = tmpDir('awos-fw-adr-stray-');
  try {
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(
      join(repo, 'docs', 'adr', '0001-use-postgres.md'),
      `# 0001-use-postgres.md\n\n## Status\n\nAccepted\n\n## Context\n\n${BODY}\n## Decision\n\n${BODY}\n## Consequences\n\n${BODY}`
    );
    const found = detectSpecFrameworks(repo).map((f) => f.framework.id);
    assert.ok(
      !found.includes('adr'),
      `one ADR file below MIN_DECISION_RECORDS must not earn credit, got ${found}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a repo with no spec practice recognizes nothing', () => {
  const repo = tmpDir('awos-fw-none-');
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    assert.deepEqual(
      detectSpecFrameworks(repo),
      [],
      'a repo with neither a framework nor a decision-record practice must recognize nothing, so SDD-01 can report that honestly'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('every framework declares a status vocabulary', () => {
  for (const fw of SPEC_FRAMEWORKS) {
    assert.ok(
      fw.statusActive.length > 0 && fw.statusTerminal.length > 0,
      `${fw.id} must declare both active and terminal status values, or SDD-06 cannot judge staleness for repos using it`
    );
  }
});

test('a framework is recognized through the orchestration root', () => {
  const root = tmpDir('awos-fw-inherit-');
  const member = join(root, 'services', 'api');
  try {
    mkdirSync(member, { recursive: true });
    mkdirSync(join(root, '.awos', 'commands'), { recursive: true });
    writeFileSync(join(root, '.awos', 'commands', 'spec.md'), BODY);
    const found = detectSpecFrameworks(member, {
      inheritance: { orchestrationRoot: root, inherits: true },
    });
    assert.equal(
      found[0]?.origin,
      'inherited',
      'a member of an orchestration root must recognize the root’s framework, marked as inherited'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
