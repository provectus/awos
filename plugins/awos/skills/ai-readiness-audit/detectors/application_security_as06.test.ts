// detectors/application_security_as06.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('AS-06 treats FastAPI Depends-based auth on mutations as protected', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-as06-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    writeFileSync(
      join(repo, 'app', 'routes.py'),
      [
        'from fastapi import APIRouter, Depends',
        'from .auth import get_current_user',
        'router = APIRouter()',
        '',
        '@router.post("/items")',
        'async def create_item(payload: dict, user = Depends(get_current_user)):',
        '    return payload',
        '',
        '@router.delete("/items/{id}")',
        'async def delete_item(id: int, user = Depends(get_current_user)):',
        '    return {"ok": True}',
      ].join('\n') + '\n'
    );
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '3005', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    assert.notEqual(
      res.status,
      'FAIL',
      `DI-protected mutations must not FAIL AS-06; got ${res.status} / ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
