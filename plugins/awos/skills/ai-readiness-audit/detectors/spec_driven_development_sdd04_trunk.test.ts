/**
 * spec_driven_development_sdd04_trunk.test.ts — regression pin for the
 * diverged-clone trunk bug reaching SDD-04.
 *
 * detectBranchSpecRatio's merged-event scan ran `git log --first-parent` on
 * the implicit local HEAD. On a developer clone whose local main diverged
 * from origin/main via `git pull` sync merges, the scan counted the
 * developer's own pull-merge commits as "merged feature work" (their
 * first-parent diff is the whole fetched trunk delta, so they even scored as
 * spec-touching PRs) while real squash-merged PRs stayed invisible. The scan
 * must walk the trunk ref from resolveTrunk() instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { detectBranchSpecRatio } from './spec_driven_development.ts';
import { gitAs } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

/** Commit one file with a pinned author/date. */
function commitFile(
  dir: string,
  file: string,
  subject: string,
  date: string
): void {
  const p = join(dir, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${subject}\n`);
  gitAs(dir, ['add', '.'], date, 'Alice', 'alice@example.com');
  gitAs(dir, ['commit', '-m', subject], date, 'Alice', 'alice@example.com');
}

test('SDD-04 counts merged events on the trunk ref, not the diverged local lineage', () => {
  // Origin: 6 squash-merged PRs on main — 4 feature PRs touch context/spec/,
  // 1 feature PR does not, and 1 fix PR is maintenance (excluded from the
  // feature denominator).
  const origin = tmpDir('awos-sdd04-origin-');
  execFileSync('git', ['init', '-b', 'main', origin], { stdio: 'ignore' });
  for (let i = 1; i <= 4; i++) {
    commitFile(
      origin,
      `context/spec/00${i}-feat/functional-spec.md`,
      `feat: spec change ${i} (#${i})`,
      `2025-01-0${i}T10:00:00`
    );
  }
  commitFile(
    origin,
    'src/util.ts',
    'feat: straight to code, no spec (#5)',
    '2025-01-05T10:00:00'
  );
  commitFile(
    origin,
    'src/broken.ts',
    'fix: crash on empty input (#6)',
    '2025-01-06T09:00:00'
  );

  // Developer clone: local commit + pull-style sync merge → local main diverges.
  const clone = tmpDir('awos-sdd04-clone-');
  execFileSync('git', ['clone', '--quiet', origin, clone], { stdio: 'ignore' });
  gitAs(
    clone,
    ['reset', '--hard', 'HEAD~2'],
    '2025-01-06T10:00:00',
    'Dev',
    'dev@example.com'
  );
  commitFile(clone, 'local.txt', 'wip: local only', '2025-01-06T11:00:00');
  gitAs(
    clone,
    ['fetch', '--quiet', 'origin'],
    '2025-01-07T10:00:00',
    'Dev',
    'dev@example.com'
  );
  gitAs(
    clone,
    ['merge', '--no-edit', 'origin/main'],
    '2025-01-07T10:00:00',
    'Dev',
    'dev@example.com'
  );

  const result = detectBranchSpecRatio(clone);
  assert.equal(
    result.value,
    0.8,
    'ratio must be 4/5 from the 5 trunk FEATURE PRs — the local pull merge is not an event, and the fix PR is excluded from the denominator'
  );
  const evidence = result.evidence.join('\n');
  assert.match(
    evidence,
    /4\/5 merged feature PRs/,
    'evidence must count exactly the 5 trunk feature-merge events'
  );
  assert.match(
    evidence,
    /1 fix\/maintenance PRs excluded/,
    'evidence must disclose the excluded maintenance PR'
  );
  assert.doesNotMatch(
    evidence,
    /Merge branch/,
    "the developer's pull-merge commit must never be listed as a spec PR"
  );
});
