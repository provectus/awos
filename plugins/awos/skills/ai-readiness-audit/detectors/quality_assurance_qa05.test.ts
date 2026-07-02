// detectors/quality_assurance_qa05.test.ts — QA-05 test-pyramid tier classification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

function detect(repo: string) {
  return JSON.parse(
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '2504', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );
}

test('QA-05 classifies vitest-importing unit tests as unit, not e2e (B1)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-qa05-vitest-'));
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
    // 4 unit tests that import the vitest runner explicitly (no globals).
    for (const name of ['a', 'b', 'c', 'd']) {
      writeFileSync(
        join(repo, 'src', `${name}.test.ts`),
        `import { describe, it, expect } from 'vitest';\n` +
          `describe('${name}', () => { it('works', () => { expect(1).toBe(1); }); });\n`
      );
    }
    // 1 integration test (by filename convention).
    writeFileSync(
      join(repo, 'src', 'api.integration.test.ts'),
      `import { it, expect } from 'vitest';\nit('integrates', () => { expect(1).toBe(1); });\n`
    );
    const res = detect(repo);
    const tiers = (res.evidence as string[]).find((e: string) =>
      e.startsWith('unit:')
    );
    assert.ok(
      tiers?.includes('unit: 4'),
      `4 vitest-importing tests must count as unit tier, got "${tiers}"`
    );
    assert.ok(
      tiers?.includes('e2e: 0'),
      `importing the vitest runner must not classify a test as e2e, got "${tiers}"`
    );
    assert.equal(
      res.status,
      'PASS',
      `unit-dominant vitest suite must PASS the pyramid check, got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('QA-05 still classifies browser-driver tests (playwright import) as e2e', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-qa05-e2e-'));
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(
      join(repo, 'src', 'unit.test.ts'),
      `import { it, expect } from 'vitest';\nit('works', () => { expect(1).toBe(1); });\n`
    );
    writeFileSync(
      join(repo, 'src', 'flow.test.ts'),
      `import { test } from '@playwright/test';\ntest('flow', async ({ page }) => { await page.goto('/'); });\n`
    );
    const res = detect(repo);
    const tiers = (res.evidence as string[]).find((e: string) =>
      e.startsWith('unit:')
    );
    assert.ok(
      tiers?.includes('e2e: 1'),
      `a playwright-importing test must still count as e2e, got "${tiers}"`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
