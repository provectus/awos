/**
 * line_coverage — measured line/statement coverage from coverage reports
 * (QA-02, code 2510).
 *
 * kind: "coverage"
 * value: covered / total lines across every parseable coverage report (0..1)
 * score: via standards.toml [category.line_coverage.scoring] — the x
 *   boundaries transcribe Google Testing Blog's published guidance
 *   (60% "acceptable", 75% "commendable", 90% "exemplary").
 *
 * This is REAL measured coverage, distinct from QA-01 (share of source
 * modules that have any test — a proxy) and QA-03 (whether coverage is
 * measured at all — presence). It reads the artifacts a coverage run leaves
 * behind:
 *   - lcov.info / *.lcov               — LH/LF line sums
 *   - cobertura XML (coverage.xml, cobertura-coverage.xml)
 *                                       — lines-covered/lines-valid or line-rate
 *   - istanbul coverage-summary.json    — total.lines.covered/total
 *   - JaCoCo XML (jacoco.xml)           — report-level counter type="LINE"
 *   - clover.xml                        — metrics coveredstatements/statements
 *
 * Coverage artifacts are normally gitignored build outputs, so the scan is
 * deliberately ignore-INSENSITIVE (like AS-14): a report sitting on disk is
 * real data even when git ignores it. Reliability is "not-reliable": a
 * report measures the run that produced it — it may be stale relative to the
 * current tree, so the number is a proxy for current coverage.
 *
 * SKIP (with a how-to-fix note) when no parseable report exists.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  awardCategories,
  makeMetricResult,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import { scoreFromConfig, scoringFor } from './_score.ts';
import { iterFilesIgnoreInsensitive } from '../detectors/_base.ts';

/** One parsed report: absolute lines covered / total, plus its source file. */
interface ParsedReport {
  file: string;
  covered: number;
  total: number;
}

function readSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** lcov: sum LH (lines hit) and LF (lines found) records. */
function parseLcov(path: string): ParsedReport | null {
  const src = readSafe(path);
  if (src === null || !/^(SF|LF|LH):/m.test(src)) return null;
  let covered = 0;
  let total = 0;
  for (const m of src.matchAll(/^LH:(\d+)$/gm)) covered += Number(m[1]);
  for (const m of src.matchAll(/^LF:(\d+)$/gm)) total += Number(m[1]);
  return total > 0 ? { file: path, covered, total } : null;
}

/** Cobertura XML: lines-covered/lines-valid attrs, else line-rate × lines-valid-less shape. */
function parseCobertura(path: string): ParsedReport | null {
  const src = readSafe(path);
  if (src === null || !src.includes('<coverage')) return null;
  const root = src.match(/<coverage\b[^>]*>/);
  if (!root) return null;
  const attrs = root[0];
  const covered = attrs.match(/lines-covered="(\d+)"/);
  const valid = attrs.match(/lines-valid="(\d+)"/);
  if (covered && valid && Number(valid[1]) > 0) {
    return { file: path, covered: Number(covered[1]), total: Number(valid[1]) };
  }
  // Older cobertura carries only line-rate; without absolute counts, weight it
  // as a single-line report so a rate-only file cannot dominate real counts.
  const rate = attrs.match(/line-rate="([\d.]+)"/);
  if (rate) {
    const r = Math.min(1, Math.max(0, Number(rate[1])));
    return { file: path, covered: r * 100, total: 100 };
  }
  return null;
}

/** Istanbul coverage-summary.json: total.lines.{covered,total}. */
function parseIstanbulSummary(path: string): ParsedReport | null {
  const src = readSafe(path);
  if (src === null) return null;
  try {
    const json = JSON.parse(src) as {
      total?: { lines?: { covered?: number; total?: number } };
    };
    const lines = json.total?.lines;
    if (
      typeof lines?.covered === 'number' &&
      typeof lines?.total === 'number' &&
      lines.total > 0
    ) {
      return { file: path, covered: lines.covered, total: lines.total };
    }
  } catch {
    // not JSON / unexpected shape
  }
  return null;
}

/** JaCoCo XML: the report-level <counter type="LINE" missed covered/>. */
function parseJacoco(path: string): ParsedReport | null {
  const src = readSafe(path);
  if (src === null || !src.includes('<report')) return null;
  // The report-level counter is the LAST LINE counter in the document.
  const counters = [
    ...src.matchAll(
      /<counter type="LINE" missed="(\d+)" covered="(\d+)"\s*\/>/g
    ),
  ];
  if (counters.length === 0) return null;
  const last = counters[counters.length - 1];
  const missed = Number(last[1]);
  const covered = Number(last[2]);
  const total = missed + covered;
  return total > 0 ? { file: path, covered, total } : null;
}

/** Clover XML: project-level <metrics statements coveredstatements>. */
function parseClover(path: string): ParsedReport | null {
  const src = readSafe(path);
  if (src === null || !src.includes('<coverage') || !src.includes('clover'))
    return null;
  const m = src.match(
    /<metrics\b[^>]*\bstatements="(\d+)"[^>]*\bcoveredstatements="(\d+)"/
  );
  if (!m) return null;
  const total = Number(m[1]);
  const covered = Number(m[2]);
  return total > 0 ? { file: path, covered, total } : null;
}

/** Report filename globs → parser. Order matters only for evidence display. */
const REPORT_SOURCES: Array<{
  globs: string[];
  parse: (path: string) => ParsedReport | null;
}> = [
  { globs: ['lcov.info', '*.lcov'], parse: parseLcov },
  {
    globs: ['coverage.xml', 'cobertura-coverage.xml', 'cobertura.xml'],
    parse: parseCobertura,
  },
  { globs: ['coverage-summary.json'], parse: parseIstanbulSummary },
  { globs: ['jacoco.xml', 'jacocoTestReport.xml'], parse: parseJacoco },
  { globs: ['clover.xml'], parse: parseClover },
];

export function compute(
  _collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>,
  repoPathOverride?: string
): MetricResult {
  const repoPath = repoPathOverride ?? _collectedDir;

  const reports: ParsedReport[] = [];
  for (const src of REPORT_SOURCES) {
    for (const path of iterFilesIgnoreInsensitive(repoPath, src.globs)) {
      const parsed = src.parse(path);
      if (parsed) reports.push(parsed);
    }
  }

  if (reports.length === 0) {
    return skipMetric(
      'line_coverage',
      'coverage',
      'not-reliable',
      'scale',
      'no parseable coverage report found (lcov.info, cobertura/coverage.xml, coverage-summary.json, jacoco.xml, clover.xml) — run the test suite with coverage locally or in CI so a report exists to measure'
    );
  }

  const covered = reports.reduce((s, r) => s + r.covered, 0);
  const total = reports.reduce((s, r) => s + r.total, 0);
  const ratio = covered / total;

  const band =
    ratio >= 0.9
      ? 'exemplary'
      : ratio >= 0.75
        ? 'commendable'
        : ratio >= 0.6
          ? 'acceptable'
          : 'low';

  const categories = awardCategories(standards, 'line_coverage', topology);
  // Score curve: standards.toml [category.line_coverage.scoring] — the x
  // boundaries transcribe Google's published 60/75/90 guidance.
  const scoring = scoringFor(standards, 'line_coverage');
  const score = scoreFromConfig(ratio, scoring);

  const expression = `${Math.round(covered)}/${Math.round(total)} lines covered = ${(ratio * 100).toFixed(1)}% line coverage (${band}, Google bands 60/75/90)`;
  const evidence = reports.map(
    (r) =>
      `${relative(repoPath, r.file)}: ${Math.round(r.covered)}/${Math.round(r.total)} lines (${((r.covered / r.total) * 100).toFixed(1)}%)`
  );

  return makeMetricResult(
    'line_coverage',
    ratio,
    'coverage',
    categories,
    {
      tag: 'not-reliable',
      confidence: 'HIGH',
      note: 'measured from the coverage report(s) on disk — a report reflects the run that produced it and may be stale relative to the current tree',
    },
    ['scale'],
    [],
    {
      band,
      expression,
      score,
      confidence: 1.0,
      unit: 'line coverage (0..1)',
      evidencePerCode: { 2510: evidence },
    }
  );
}
