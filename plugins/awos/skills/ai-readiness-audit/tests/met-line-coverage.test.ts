/**
 * line_coverage (QA-02) — measured line coverage from coverage reports,
 * scored against Google's published 60/75/90 bands.
 *
 * Contracts:
 * - SKIP with a how-to-fix note when no parseable report exists
 * - lcov LH/LF sums, cobertura lines-covered/lines-valid, istanbul
 *   coverage-summary.json, JaCoCo LINE counter, clover statements all parse
 * - multiple reports aggregate by summed lines
 * - a GITIGNORED report is still measured (coverage artifacts are normally
 *   ignored build outputs — the scan must be ignore-insensitive)
 * - band labels follow Google's terms; score follows the declared curve
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compute } from '../metrics/line_coverage.ts';
import { loadStandards } from './helpers.ts';

const standards = loadStandards();
const run = (repo: string) => compute(repo, standards, {}, repo);

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'awos-linecov-'));
}

test('QA-02: SKIP with a how-to-fix note when no coverage report exists', () => {
  const repo = tmp();
  writeFileSync(join(repo, 'index.ts'), 'export const x = 1;\n');
  const r = run(repo);
  assert.equal(r.status, 'SKIP', 'no report → SKIP');
  assert.match(
    String(r.reliability.note),
    /no parseable coverage report/,
    'the SKIP note must say what was looked for and how to produce one'
  );
});

test('QA-02: lcov LH/LF records aggregate into line coverage', () => {
  const repo = tmp();
  mkdirSync(join(repo, 'coverage'));
  writeFileSync(
    join(repo, 'coverage', 'lcov.info'),
    [
      'SF:src/a.ts',
      'LF:100',
      'LH:80',
      'end_of_record',
      'SF:src/b.ts',
      'LF:100',
      'LH:80',
      'end_of_record',
    ].join('\n') + '\n'
  );
  const r = run(repo);
  assert.equal(r.status, 'OK');
  assert.equal(r.value, 0.8, '160/200 lines → 0.8');
  assert.equal(r.band, 'commendable', '80% sits in the 75–90 Google band');
  assert.ok(
    typeof r.score === 'number' && Math.abs(r.score - 0.867) < 0.01,
    `0.8 coverage must score ≈0.867 on the declared curve (0.75→0.8, 0.9→1.0); got ${r.score}`
  );
});

test('QA-02: a gitignored lcov report is still measured', () => {
  const repo = tmp();
  execFileSync('git', ['init', '--quiet', repo]);
  writeFileSync(join(repo, '.gitignore'), 'coverage/\n');
  mkdirSync(join(repo, 'coverage'));
  writeFileSync(
    join(repo, 'coverage', 'lcov.info'),
    'SF:src/a.ts\nLF:10\nLH:9\nend_of_record\n'
  );
  const r = run(repo);
  assert.equal(
    r.status,
    'OK',
    'coverage artifacts are normally gitignored — the scan must still find them'
  );
  assert.equal(r.value, 0.9);
  assert.equal(r.band, 'exemplary');
});

test('QA-02: cobertura lines-covered/lines-valid parses', () => {
  const repo = tmp();
  writeFileSync(
    join(repo, 'coverage.xml'),
    '<?xml version="1.0"?>\n<coverage line-rate="0.65" lines-covered="65" lines-valid="100" version="7.4"></coverage>\n'
  );
  const r = run(repo);
  assert.equal(r.status, 'OK');
  assert.equal(r.value, 0.65);
  assert.equal(r.band, 'acceptable');
});

test('QA-02: istanbul coverage-summary.json parses', () => {
  const repo = tmp();
  mkdirSync(join(repo, 'coverage'));
  writeFileSync(
    join(repo, 'coverage', 'coverage-summary.json'),
    JSON.stringify({
      total: { lines: { total: 200, covered: 110, pct: 55 } },
    })
  );
  const r = run(repo);
  assert.equal(r.status, 'OK');
  assert.equal(r.value, 0.55);
  assert.equal(r.band, 'low', 'below 60% is below Google’s acceptable band');
});

test('QA-02: JaCoCo report-level LINE counter parses', () => {
  const repo = tmp();
  writeFileSync(
    join(repo, 'jacoco.xml'),
    '<?xml version="1.0"?><report name="x"><counter type="INSTRUCTION" missed="5" covered="5"/><counter type="LINE" missed="8" covered="92"/></report>'
  );
  const r = run(repo);
  assert.equal(r.status, 'OK');
  assert.equal(r.value, 0.92);
  assert.equal(r.band, 'exemplary');
});

test('QA-02: clover coveredstatements/statements parses', () => {
  const repo = tmp();
  writeFileSync(
    join(repo, 'clover.xml'),
    '<?xml version="1.0"?><coverage generated="1" clover="3.2"><project><metrics statements="50" coveredstatements="35"/></project></coverage>'
  );
  const r = run(repo);
  assert.equal(r.status, 'OK');
  assert.equal(r.value, 0.7);
  assert.equal(r.band, 'acceptable');
});

test('QA-02: multiple reports aggregate by summed lines and list each in evidence', () => {
  const repo = tmp();
  mkdirSync(join(repo, 'pkg-a'));
  mkdirSync(join(repo, 'pkg-b'));
  writeFileSync(
    join(repo, 'pkg-a', 'lcov.info'),
    'SF:a.ts\nLF:100\nLH:90\nend_of_record\n'
  );
  writeFileSync(
    join(repo, 'pkg-b', 'lcov.info'),
    'SF:b.ts\nLF:300\nLH:150\nend_of_record\n'
  );
  const r = run(repo);
  assert.equal(r.status, 'OK');
  assert.equal(r.value, 0.6, '(90+150)/(100+300) = 0.6');
  const ev = (r.evidence_per_code as Record<number, string[]>)[2510];
  assert.equal(ev.length, 2, 'each parsed report must appear in evidence');
});

test('QA-02: awards category 2510 and reports the Google-band expression', () => {
  const repo = tmp();
  writeFileSync(
    join(repo, 'lcov.info'),
    'SF:a.ts\nLF:100\nLH:76\nend_of_record\n'
  );
  const r = run(repo);
  assert.deepEqual(r.categories_awarded, [2510]);
  assert.match(
    String(r.expression),
    /76\/100 lines covered = 76\.0% line coverage \(commendable/,
    'expression must show the fraction, percent, and Google band'
  );
});
