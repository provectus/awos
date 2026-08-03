// detectors/ai_development_tooling_ai07.test.ts
//
// Issue #156: AI-07's FAIL evidence used to hand-type a run-mechanism list
// that drifted from ROOT_RUN_FILES (the constant the detector actually
// searches) — the canonical regression the issue was filed about. Pins the
// evidence to the constant itself, not a copy of its current contents, so a
// future edit to ROOT_RUN_FILES can't silently re-introduce the drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';
import { ROOT_RUN_FILES } from './ai_development_tooling.ts';

const detect = (repo: string) => runDetector(2006, repo);

test('AI-07 FAIL evidence enumerates every element of ROOT_RUN_FILES', () => {
  const repo = tmpDir('awos-ai07-');
  try {
    writeFileSync(join(repo, 'README.md'), '# project\n');
    const res = detect(repo);
    assert.equal(res.status, 'FAIL');
    const ev = (res.evidence ?? []).join(' ');
    for (const f of ROOT_RUN_FILES) {
      assert.ok(
        ev.includes(f),
        `AI-07 FAIL evidence must enumerate the constant it actually searched — a hand-typed list drifts from the check (missing "${f}"); got: ${ev}`
      );
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
