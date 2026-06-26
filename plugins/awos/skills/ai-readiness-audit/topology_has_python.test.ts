import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeTopology } from './topology.ts';

test('has_python is true for a Python repo and false otherwise', () => {
  const py = mkdtempSync(join(tmpdir(), 'awos-py-'));
  const go = mkdtempSync(join(tmpdir(), 'awos-go-'));
  try {
    writeFileSync(join(py, 'main.py'), 'print(1)\n');
    writeFileSync(join(go, 'main.go'), 'package main\n');
    assert.equal(
      computeTopology(py).has_python,
      true,
      'python repo → has_python true'
    );
    assert.equal(
      computeTopology(go).has_python,
      false,
      'go repo → has_python false'
    );
  } finally {
    rmSync(py, { recursive: true, force: true });
    rmSync(go, { recursive: true, force: true });
  }
});
