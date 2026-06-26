// detectors/application_security_as03.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

function detect(repo: string) {
  return JSON.parse(
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '3002', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );
}

test('AS-03 returns N/A (not a value-0 PASS) when no CORS config exists', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-as03-none-'));
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
  const repo = mkdtempSync(join(tmpdir(), 'awos-as03-wild-'));
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
