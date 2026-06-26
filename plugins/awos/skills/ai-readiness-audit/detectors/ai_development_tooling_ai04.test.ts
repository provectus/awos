import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('AI-04 evidence explains org-level MCP invisibility when none found in-repo', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-ai04-'));
  try {
    writeFileSync(join(repo, 'README.md'), '# x\n');
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2003', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
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
