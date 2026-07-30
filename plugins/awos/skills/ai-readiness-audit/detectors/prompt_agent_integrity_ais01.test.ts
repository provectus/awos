import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector, tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2400, repo);

// One code point from each range named in INVISIBLE_CODEPOINT_RANGES
// (prompt_agent_integrity.ts), paired with the code point immediately
// outside that range's bounds. Ties the evidence text's advertised ranges
// to what isInvisibleCodePoint/countInvisible actually flag: narrowing
// INVISIBLE_CODEPOINT_RANGES without narrowing isInvisibleCodePoint (or
// vice versa) fails one of the two tests below.
const RANGE_SAMPLES: Array<{
  label: string;
  inRange: number;
  outOfRange: number;
}> = [
  { label: 'U+200B–U+200F', inRange: 0x200b, outOfRange: 0x2010 },
  { label: 'U+2028–U+202E', inRange: 0x2028, outOfRange: 0x202f },
  { label: 'U+2060–U+206F', inRange: 0x2060, outOfRange: 0x2070 },
  { label: 'U+00AD', inRange: 0x00ad, outOfRange: 0x00ae },
  { label: 'U+FEFF', inRange: 0xfeff, outOfRange: 0xff00 },
  { label: 'U+E0000–U+E007F', inRange: 0xe0000, outOfRange: 0xe0080 },
];

test('AIS-01 flags one code point from every range the evidence text advertises', () => {
  const repo = tmpDir('awos-pai01-in-');
  try {
    const body = RANGE_SAMPLES.map((r) => String.fromCodePoint(r.inRange)).join(
      ''
    );
    writeFileSync(join(repo, 'CLAUDE.md'), `# ctx\n${body}\n`);

    const res = detect(repo);
    // 1 file, 6 code points, maxCount >= 5 -> FAIL.
    assert.equal(
      res.status,
      'FAIL',
      `expected all 6 sample code points to be counted as invisible; status: ${res.status}`
    );

    const ev = JSON.stringify(res.evidence ?? []);
    assert.match(
      ev,
      /: 6 invisible Unicode code point\(s\)/,
      `expected the per-file evidence to count all 6 samples; evidence: ${ev}`
    );
    for (const { label } of RANGE_SAMPLES) {
      assert.ok(
        ev.includes(label),
        `evidence must advertise ${label} since a sample from it was flagged; evidence: ${ev}`
      );
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AIS-01 does not flag the code point just outside each advertised range', () => {
  const repo = tmpDir('awos-pai01-out-');
  try {
    const body = RANGE_SAMPLES.map((r) =>
      String.fromCodePoint(r.outOfRange)
    ).join('');
    writeFileSync(join(repo, 'CLAUDE.md'), `# ctx\n${body}\n`);

    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `boundary-adjacent code points must not be flagged as invisible; evidence: ${JSON.stringify(res.evidence ?? [])}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
