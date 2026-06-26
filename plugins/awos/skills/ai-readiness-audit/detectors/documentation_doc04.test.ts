// detectors/documentation_doc04.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('DOC-04 ignores route/command-like references, flags real dead file links', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-doc04-'));
  try {
    writeFileSync(
      join(repo, 'README.md'),
      [
        '# App',
        'Call the `/api` endpoint. Run `/awos:architecture`.',
        'See [missing doc](./docs/gone.md).',
      ].join('\n') + '\n'
    );
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2203', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    const ev = (res.evidence ?? []).join(' ');
    assert.ok(
      !ev.includes('/api'),
      `/api must not be flagged as a path; got: ${ev}`
    );
    assert.ok(
      !ev.includes('/awos:architecture'),
      `/awos:architecture must not be flagged; got: ${ev}`
    );
    assert.ok(
      ev.includes('docs/gone.md'),
      `genuine dead link must still be flagged; got: ${ev}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
