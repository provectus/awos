// detectors/_base_audit_prune.test.ts — the audit must never scan its own
// output directory (context/audits/), or it scores artifacts it wrote itself
// (self-pollution, B3). Covers both file walkers: the find-based iterFiles
// (detectors) and the recursive walkDir (AST metrics).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { iterFiles } from './_base.ts';
import { walkDir } from '../metrics/_ast.ts';
import { tmpDir, writeRepo } from '../tests/helpers.ts';

function makeRepoWithAuditOutput(): string {
  const repo = tmpDir('awos-prune-');
  writeRepo(repo, {
    'src/real_module.py': 'x = 1\n',
    'README.md': '# real\n',
    'context/audits/2026-07-02/report.md': '# audit output\n',
    'context/audits/2026-07-02/polluter.py': 'api_key = "AKIA1234"\n',
  });
  return repo;
}

test('iterFiles prunes context/audits — detector scans never see audit output', () => {
  const repo = makeRepoWithAuditOutput();
  try {
    const md = iterFiles(repo, ['*.md']);
    const py = iterFiles(repo, ['*.py']);
    assert.ok(
      md.some((f) => f.endsWith('README.md')),
      'real project files must still be found'
    );
    assert.ok(
      !md.some((f) => f.includes('context/audits')),
      `audit-output markdown must be pruned, got: ${md.join(', ')}`
    );
    assert.ok(
      !py.some((f) => f.includes('context/audits')),
      `audit-output source files must be pruned, got: ${py.join(', ')}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('walkDir prunes context/audits — AST metrics never parse audit output', () => {
  const repo = makeRepoWithAuditOutput();
  try {
    const seen: string[] = [];
    walkDir(repo, (p) => seen.push(p));
    assert.ok(
      seen.some((f) => f.endsWith('real_module.py')),
      'real project files must still be walked'
    );
    assert.ok(
      !seen.some((f) => f.includes(join('context', 'audits'))),
      `audit-output files must be pruned from the walk, got: ${seen.join(', ')}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a context dir nested deeper (services/api/context/audits) is pruned too', () => {
  const repo = tmpDir('awos-prune-nested-');
  try {
    const nested = join(repo, 'services', 'api', 'context', 'audits');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'report.md'), '# nested audit output\n');
    const md = iterFiles(repo, ['*.md']);
    assert.equal(
      md.length,
      0,
      `nested context/audits must be pruned, got: ${md.join(', ')}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
