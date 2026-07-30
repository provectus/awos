// detectors/software_best_practices_sbp03.test.ts
//
// Regression pin for issue #156 residual 1: SBP-03's Python-annotation-ratio
// fallback (detectTypeSafety, reached when no mypy/pyright/tsconfig config is
// found) used to render the measured ratio with Math.round, so a ratio that
// rounds to the same integer as the resolved pass threshold produced a
// self-contradictory sentence ("60% — below the 60% pass threshold"). The
// fix renders the measured value at one decimal (`.toFixed(1)`, mirroring
// `metrics/line_coverage.ts`) while the threshold citations stay integral.
// 25 annotated / 42 total defs = 59.5238…%, which rounds to 60% at integer
// precision — the resolved pass_at (0.60) — but to 59.5% at one decimal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2702, repo);

test('SBP-03 (issue #156): measured annotation ratio renders at one decimal, never colliding with the pass threshold it is compared against', () => {
  const repo = tmpDir('awos-sbp03-collision-');
  try {
    const lines: string[] = [];
    for (let i = 0; i < 25; i++) {
      lines.push(`def annotated${i}(x: int) -> int:`, '    return x');
    }
    for (let i = 0; i < 17; i++) {
      lines.push(`def plain${i}(x):`, '    return x');
    }
    writeFileSync(join(repo, 'app.py'), lines.join('\n') + '\n');

    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `25/42 annotated ratio (59.5%) must be WARN under the resolved 60% pass threshold, with no mypy/pyright/tsconfig config present; got ${res.status}`
    );

    const text = (res.evidence ?? []).join(' | ');
    assert.ok(
      text.includes('59.5%'),
      `evidence must render the measured ratio at one decimal (59.5%), not the integer-rounded 60%; got ${JSON.stringify(res.evidence)}`
    );

    // The measured value and the threshold it is compared against must
    // never render as the same number — that is an unverifiable sentence.
    assert.doesNotMatch(
      text,
      /(\d+)% — below the \1%/,
      'the measured value and the threshold it is compared against must never render as the same number'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
