#!/usr/bin/env node
/**
 * compare_audit_runs.ts — diff two archived audit runs.
 *
 *   node --import tsx tools/ai-readiness-audit/qa/compare_audit_runs.ts <runDirA> <runDirB>
 *   node --import tsx tools/ai-readiness-audit/qa/compare_audit_runs.ts --target <repo-name>
 *   (or `npm run audit:compare -- --target <repo-name>`)
 *
 * `--target` picks the two newest runs for that repo. Prints side by side:
 * phase, skill commit, tokens, cost, wall-clock, audit_total, coverage, and
 * per-dimension score deltas — so a skill change's effect on the numbers is
 * visible at a glance. A = older, B = newer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { awosMainCheckout, isDir, isFile, readJson } from './harness_lib.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_ROOT = path.join(awosMainCheckout(HERE), 'tmp', 'audit-runs');

function fail(msg: string): never {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

function load(run: string): any {
  return readJson(path.join(run, 'run-meta.json'));
}

function twoNewest(name: string): [string, string] {
  const base = path.join(ARCHIVE_ROOT, name);
  if (!isDir(base)) fail(`no runs under ${base}`);
  const runs = fs
    .readdirSync(base)
    .filter((d) => isFile(path.join(base, d, 'run-meta.json')))
    .sort()
    .reverse()
    .map((d) => path.join(base, d));
  if (runs.length < 2) fail(`need >=2 runs under ${base}`);
  return [runs[1], runs[0]]; // older, newer
}

function g(m: any, ...keys: string[]): any {
  for (const k of keys) {
    m = m !== null && typeof m === 'object' ? m[k] : undefined;
  }
  return m;
}

/** Render a value the way the Python harness did (None for absent). */
function show(v: any): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  return String(v);
}

function main(): void {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: { target: { type: 'string' } },
      allowPositionals: true,
    });
  } catch (e: any) {
    process.stderr.write(`error: ${e?.message ?? e}\n`);
    process.exit(2);
  }
  const { values, positionals } = parsed;

  let ra: string, rb: string;
  if (values.target) {
    [ra, rb] = twoNewest(values.target);
  } else if (positionals.length === 2) {
    [ra, rb] = positionals as [string, string];
  } else {
    process.stderr.write('error: pass two run dirs or --target <repo-name>\n');
    process.exit(2);
  }

  const A = load(ra);
  const B = load(rb);
  const W = 30;

  const row = (label: string, a: any, b: any): void => {
    console.log(
      `  ${label.padEnd(22)} ${show(a).padEnd(W)} ${show(b).padEnd(W)}`
    );
  };

  console.log('='.repeat(86));
  console.log(
    `  ${''.padEnd(22)} ${'A (older)'.padEnd(W)} ${'B (newer)'.padEnd(W)}`
  );
  console.log('='.repeat(86));
  row('phase', A.phase, B.phase);
  row(
    'skill commit',
    g(A, 'skill_under_test', 'short'),
    g(B, 'skill_under_test', 'short')
  );
  row(
    'skill dirty',
    g(A, 'skill_under_test', 'dirty'),
    g(B, 'skill_under_test', 'dirty')
  );
  row('label', A.label, B.label);
  row('target commit', g(A, 'target', 'commit'), g(B, 'target', 'commit'));
  row('cost_usd', A.total_cost_usd, B.total_cost_usd);
  row('duration_ms', A.duration_ms, B.duration_ms);
  row('turns', A.num_turns, B.num_turns);
  for (const k of [
    'input_tokens',
    'output_tokens',
    'cache_creation_input_tokens',
    'cache_read_input_tokens',
  ]) {
    row(k, g(A, 'usage', k), g(B, 'usage', k));
  }

  const sA = A.summary ?? {};
  const sB = B.summary ?? {};
  const mode = sA.mode ?? sB.mode;
  console.log('-'.repeat(86));
  if (mode === 'single') {
    row('audit_total', sA.audit_total, sB.audit_total);
    row('coverage', sA.coverage, sB.coverage);
    console.log('-'.repeat(86));
    console.log('  per-dimension score (A -> B, Δ):');
    const dims = [
      ...new Set([
        ...Object.keys(sA.dimensions ?? {}),
        ...Object.keys(sB.dimensions ?? {}),
      ]),
    ].sort();
    for (const d of dims) {
      const av = (sA.dimensions?.[d] ?? {}).score;
      const bv = (sB.dimensions?.[d] ?? {}).score;
      let delta = '';
      if (typeof av === 'number' && typeof bv === 'number') {
        const diff = bv - av;
        delta = diff ? `  (${diff >= 0 ? '+' : ''}${diff})` : '  (=)';
      }
      console.log(
        `    ${d.padEnd(28)} ${show(av).padStart(6)} -> ${show(bv).padStart(6)}${delta}`
      );
    }
  } else if (mode === 'org') {
    row('repos', sA.repos, sB.repos);
    console.log(
      '  portfolio_metrics A:',
      JSON.stringify(sA.portfolio_metrics ?? null)
    );
    console.log(
      '  portfolio_metrics B:',
      JSON.stringify(sB.portfolio_metrics ?? null)
    );
  } else {
    console.log('  (no comparable summary — audit output missing in one run)');
  }
  console.log('='.repeat(86));
}

main();
