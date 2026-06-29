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

function detect(repo: string) {
  return JSON.parse(
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '3005', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );
}

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

test('AS-06 graded score equals auth-coverage ratio (WARN at 0.5)', () => {
  // 2 files with mutations: 1 has auth, 1 does not → coverage = 0.5 → WARN, score = 0.5
  const repo = mkdtempSync(join(tmpdir(), 'awos-as06-graded-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    // File 1: has mutations AND auth
    writeFileSync(
      join(repo, 'app', 'protected_routes.py'),
      [
        'from fastapi import APIRouter',
        'router = APIRouter()',
        '',
        '@login_required',
        '@router.post("/items")',
        'async def create_item(payload: dict):',
        '    return payload',
      ].join('\n') + '\n'
    );
    // File 2: has mutations but NO auth
    writeFileSync(
      join(repo, 'app', 'public_routes.py'),
      [
        'from fastapi import APIRouter',
        'router = APIRouter()',
        '',
        '@router.post("/public")',
        'async def create_public(payload: dict):',
        '    return payload',
      ].join('\n') + '\n'
    );
    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `1/2 auth coverage must be WARN; got ${res.status}`
    );
    assert.ok(
      typeof res.score === 'number',
      `score must be a number; got ${typeof res.score}`
    );
    assert.ok(
      Math.abs(res.score - 0.5) < 0.01,
      `score must be ≈ 0.50 (1 of 2 files protected); got ${res.score}`
    );
    assert.equal(
      res.confidence,
      1,
      `confidence must be 1.0; got ${res.confidence}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-06 SKIP when no mutation routes found — score=0 confidence=0', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-as06-skip-'));
  try {
    writeFileSync(join(repo, 'util.py'), 'def helper(): pass\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'SKIP',
      `no mutations must be SKIP; got ${res.status}`
    );
    assert.equal(res.score, 0, `SKIP score must be 0; got ${res.score}`);
    assert.equal(
      res.confidence,
      0,
      `SKIP confidence must be 0; got ${res.confidence}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
