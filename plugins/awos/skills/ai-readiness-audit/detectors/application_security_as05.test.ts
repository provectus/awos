// detectors/application_security_as05.test.ts
//
// Regression pin for issue #156 residual 1: AS-05's WARN branch
// (detectAuthOnMutations) cites both the resolved pass_at and warn_at bands
// alongside the measured auth-coverage ratio. Nothing pinned the ordering of
// that citation — a future edit that swaps `passAtPct`/`warnAtPct` (or the
// values they read from) would silently ship a sentence like "below the 30%
// pass threshold, at or above the 60% warn threshold": nonsense, but the
// suite would stay green because no test asserted which number is which. A
// citation that inverts the bands is worse than no citation, so this pins
// the pass threshold as the higher of the two cited numbers, the warn
// threshold as the lower, and the measured value as strictly below the pass
// threshold as rendered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(3005, repo);

test('AS-05 (issue #156): WARN evidence cites the pass threshold above the warn threshold, and the measured value below the pass threshold', () => {
  // 1 file with mutations + auth, 1 file with mutations and no auth →
  // coverage = 0.5 → between the default warn_at (0.3) and pass_at (0.7) →
  // WARN.
  const repo = tmpDir('awos-as05-warn-');
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
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

    const text = (res.evidence ?? []).join(' | ');
    const m = text.match(
      /(\d+(?:\.\d+)?)% — below the (\d+)% pass threshold, at or above the (\d+)% warn threshold/
    );
    assert.ok(
      m,
      `evidence must cite both a pass threshold and a warn threshold alongside the measured coverage; got ${JSON.stringify(res.evidence)}`
    );
    const [, measured, passThreshold, warnThreshold] = m as RegExpMatchArray;

    assert.ok(
      Number(passThreshold) > Number(warnThreshold),
      `the cited pass threshold (${passThreshold}%) must be higher than the cited warn threshold (${warnThreshold}%) — an inverted citation is worse than no citation; got: "${text}"`
    );
    assert.ok(
      Number(measured) < Number(passThreshold),
      `the measured coverage (${measured}%) must render strictly below the cited pass threshold (${passThreshold}%); got: "${text}"`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
