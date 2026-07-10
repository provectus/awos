// detectors/application_security_as03.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(3002, repo);

test('AS-03 returns N/A (not a value-0 PASS) when no CORS config exists', () => {
  const repo = tmpDir('awos-as03-none-');
  try {
    writeFileSync(join(repo, 'app.py'), 'print("no cors here")\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'SKIP',
      `no-CORS must be SKIP/N-A, not PASS; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-03 FAILs on a wildcard origin', () => {
  const repo = tmpDir('awos-as03-wild-');
  try {
    writeFileSync(
      join(repo, 'app.py'),
      'CORSMiddleware(allow_origins=["*"])\n'
    );
    const res = detect(repo);
    assert.equal(res.status, 'FAIL', `wildcard must FAIL; got ${res.status}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
