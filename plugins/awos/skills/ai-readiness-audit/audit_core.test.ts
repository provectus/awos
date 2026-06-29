// audit_core.test.ts — unit tests for aggregate() in audit_core.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { aggregate } from './audit_core.ts';

// ---------------------------------------------------------------------------
// Task 2.1: aggregate re-derives applies from status
// ---------------------------------------------------------------------------

test(
  'aggregate must include patched-PASS connector checks in the coverage denominator — coverage cannot exceed 100% (issue #12)',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'awos-agg-'));
    try {
      // Connector check: patched SKIP→PASS but applies still false (the bug).
      const connectorCheck = {
        check_id: 'ADP-01',
        code: [101],
        method: 'computed',
        status: 'PASS',
        value: 1,
        evidence: [],
        weight_awarded: 5,
        weight_max: 5,
        applies: false,
        reliability: { tag: 'not-reliable', confidence: 'HIGH', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
      };
      // Normal detected check: applies=true.
      const normalCheck = {
        check_id: 'ADP-02',
        code: [102],
        method: 'detected',
        status: 'PASS',
        value: true,
        evidence: [],
        weight_awarded: 5,
        weight_max: 5,
        applies: true,
        reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
        source: '',
        definition: '',
        hint: '',
        plain: '',
      };
      const dim = {
        dimension: 'ai-sdlc-adoption',
        date: '2026-01-01',
        score: 10,
        coverage: 2.0,
        checks: [connectorCheck, normalCheck],
      };
      writeFileSync(join(dir, 'ai-sdlc-adoption.json'), JSON.stringify(dim));

      aggregate(dir);

      const updated = JSON.parse(
        readFileSync(join(dir, 'ai-sdlc-adoption.json'), 'utf8')
      );
      assert.ok(
        updated.coverage <= 1,
        `coverage must be ≤ 1 after aggregate, got ${updated.coverage}`
      );
      assert.equal(
        updated.coverage,
        1.0,
        `coverage must be 10/10=1.0 when patched-PASS check is counted in denominator, got ${updated.coverage}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
);
