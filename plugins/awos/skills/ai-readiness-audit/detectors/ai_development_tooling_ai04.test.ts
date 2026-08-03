import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';
import { ALL_MCP_CONFIG_PATHS } from '../agent_tools.ts';

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

// Issue #156: evidence strings must name the exact thing the check searched,
// not a vague "none of the known paths" gesture. Pins FAIL evidence to the
// ALL_MCP_CONFIG_PATHS constant itself, so a future edit to the list can't
// silently re-introduce that drift.
test('AI-04 FAIL evidence enumerates every element of ALL_MCP_CONFIG_PATHS', () => {
  const repo = tmpDir('awos-ai04-');
  try {
    writeFileSync(join(repo, 'README.md'), '# x\n');
    const res = detect(repo);
    assert.equal(res.status, 'FAIL');
    const ev = (res.evidence ?? []).join(' ');
    for (const p of ALL_MCP_CONFIG_PATHS) {
      assert.ok(
        ev.includes(p),
        `AI-04 FAIL evidence must enumerate the constant it actually searched — a vague list drifts from the check (missing "${p}"); got: ${ev}`
      );
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
