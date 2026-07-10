// detectors/documentation_doc04.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2203, repo);

test('DOC-04 ignores route/command-like references, flags real dead file links', () => {
  const repo = tmpDir('awos-doc04-');
  try {
    writeFileSync(
      join(repo, 'README.md'),
      [
        '# App',
        'Call the `/api` endpoint. Run `/awos:architecture`.',
        'See [missing doc](./docs/gone.md).',
      ].join('\n') + '\n'
    );
    const res = detect(repo);
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
