import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2003, repo);

test('AI-04 evidence explains org-level MCP invisibility when none found in-repo', () => {
  const repo = tmpDir('awos-ai04-');
  try {
    writeFileSync(join(repo, 'README.md'), '# x\n');
    const res = detect(repo);
    const ev = (res.evidence ?? []).join(' ').toLowerCase();
    assert.ok(
      ev.includes('org') ||
        ev.includes('not visible') ||
        ev.includes('outside the repo'),
      `AI-04 evidence must note repo-only visibility; got: ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
