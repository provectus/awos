// detectors/documentation_doc01.test.ts
//
// Issue #156: evidence strings must name the exact thing the check searched,
// not a hand-typed approximation that can drift. Pins DOC-01's FAIL evidence
// to the README_NAMES constant itself, so a future edit to the list can't
// silently re-introduce that drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';
import { README_NAMES } from './documentation.ts';

const detect = (repo: string) => runDetector(2200, repo);

test('DOC-01 FAIL evidence enumerates every element of README_NAMES', () => {
  const repo = tmpDir('awos-doc01-');
  try {
    writeFileSync(join(repo, 'package.json'), '{}\n');
    const res = detect(repo);
    assert.equal(res.status, 'FAIL');
    const ev = (res.evidence ?? []).join(' ');
    for (const name of README_NAMES) {
      assert.ok(
        ev.includes(name),
        `DOC-01 FAIL evidence must enumerate the constant it actually searched — a hand-typed list drifts from the check (missing "${name}"); got: ${ev}`
      );
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
