// detectors/security_sec05.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2604, repo);

test('AS-14 flags a secret file ignored by git but exposed to Docker builds', () => {
  const repo = tmpDir('awos-sec05-gap-');
  try {
    writeFileSync(join(repo, 'server.pem'), 'KEY\n'); // a real secret file exists
    writeFileSync(join(repo, '.gitignore'), '*.pem\n'); // ignored by git
    writeFileSync(join(repo, 'Dockerfile'), 'FROM x\nCOPY . /app\n'); // ...but COPY . into image
    // no .dockerignore → leak
    const res = detect(repo);
    const ev = (res.evidence ?? []).join(' ').toLowerCase();
    assert.ok(
      ev.includes('docker'),
      `must call out the .dockerignore gap; got ${ev}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-14 does not penalize a repo with no secret-type files', () => {
  const repo = tmpDir('awos-sec05-none-');
  try {
    writeFileSync(join(repo, 'main.py'), 'print(1)\n'); // no *.pem/*.key/etc.
    const res = detect(repo);
    assert.notEqual(
      res.status,
      'FAIL',
      `no secret files → must not FAIL; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
