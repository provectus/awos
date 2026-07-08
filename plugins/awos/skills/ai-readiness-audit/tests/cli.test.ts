/**
 * cli.test.ts — hermetic smoke tests for dist/cli.js (the bundled dispatcher).
 *
 * Runs against the BUNDLED file, not the TypeScript sources, so build:audit-engine
 * must be run before this test suite executes.
 *
 * Node path: the subprocess is spawned with the same Node binary that runs
 * this test (`process.execPath`), so it stays portable across CI and local
 * runs. Override with the NODE_BIN env var when a different binary is required.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './helpers.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE = process.env.NODE_BIN || process.execPath;
const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(SKILL, 'dist', 'cli.js');

// ---------------------------------------------------------------------------
// Helper: run cli.js and parse stdout as JSON
// ---------------------------------------------------------------------------

function runCli(...args: string[]): { json: unknown; code: number } {
  try {
    const stdout = execFileSync(NODE, [CLI, ...args], {
      encoding: 'utf8',
      // suppress the "module type not specified" warning from Node
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { json: JSON.parse(stdout), code: 0 };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      status?: number;
    };
    let json: unknown = null;
    try {
      json = JSON.parse(e.stdout ?? '');
    } catch {
      // not parseable — leave null
    }
    return { json, code: e.status ?? 1 };
  }
}

/** Like runCli, but feeds `input` to the subprocess's stdin (for `-` args). */
function runCliStdin(
  input: string,
  ...args: string[]
): { json: unknown; code: number } {
  try {
    const stdout = execFileSync(NODE, [CLI, ...args], {
      encoding: 'utf8',
      input,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { json: JSON.parse(stdout), code: 0 };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      status?: number;
    };
    let json: unknown = null;
    try {
      json = JSON.parse(e.stdout ?? '');
    } catch {
      // not parseable — leave null
    }
    return { json, code: e.status ?? 1 };
  }
}

// ---------------------------------------------------------------------------
// 'rollup' — reads each repo's FULL audit from per-repo subdirectories,
// emitting the org headline (average matrix) + enriched per_repo rows.
// ---------------------------------------------------------------------------

/** Write a minimal per-repo audit.json + collected/git.json under <base>/<repo>. */
function writeRepoAudit(
  base: string,
  repo: string,
  opts: {
    audit_total: number;
    coverage: number;
    deploy: number | null;
    lead: number | null;
    merges: number | null;
    loc: number | null;
    aiToolingAwarded?: boolean;
    contributors?: number | null;
    sources?: string[];
  }
): void {
  const repoDir = join(base, repo);
  mkdirSync(join(repoDir, 'collected'), { recursive: true });
  const checks: Record<string, unknown>[] = [
    { check_id: 'DF-01', code: [700], status: 'OK', value: opts.deploy },
    { check_id: 'DF-02', code: [701], status: 'OK', value: opts.lead },
  ];
  if (opts.contributors != null)
    checks.push({
      check_id: 'DESC-01',
      code: [201],
      status: 'OK',
      value: opts.contributors,
    });
  if (opts.aiToolingAwarded)
    checks.push({
      check_id: 'AITD-01',
      code: [101],
      status: 'PASS',
      weight_awarded: 5,
      value: true,
    });
  const audit = {
    date: '2026-07-01',
    project: repo,
    audit_total: opts.audit_total,
    coverage: opts.coverage,
    dimensions: [{ dimension: 'ai-sdlc-adoption', checks }],
    sources: (opts.sources ?? ['git']).map((s) => ({
      source: s,
      available: true,
    })),
    // Provenance stamp — rollup refuses per-repo audits without it.
    engine: { generated_by: 'audit-core' },
  };
  writeFileSync(join(repoDir, 'audit.json'), JSON.stringify(audit));
  writeFileSync(
    join(repoDir, 'collected', 'git.json'),
    JSON.stringify({
      source: 'git',
      available: true,
      raw: {
        window_stats: {
          merges_per_active: opts.merges,
          loc_per_active: opts.loc,
        },
      },
    })
  );
}

test('rollup: reads per-repo subdirs → org headline (mean matrix) + enriched per_repo', () => {
  const base = tmpDir('awos-rollup-test-');
  try {
    writeRepoAudit(base, 'service-a', {
      audit_total: 50,
      coverage: 0.5,
      deploy: 8,
      lead: 12,
      merges: 4,
      loc: 200,
      aiToolingAwarded: true,
      contributors: 8,
      sources: ['git', 'ci'],
    });
    writeRepoAudit(base, 'service-b', {
      audit_total: 30,
      coverage: 0.3,
      deploy: 6,
      lead: 36,
      merges: 2,
      loc: 100,
      aiToolingAwarded: false,
      contributors: 4,
      sources: ['git'],
    });
    // A dir missing audit.json must be skipped gracefully, not crash.
    mkdirSync(join(base, 'broken'), { recursive: true });

    const { json, code } = runCli('rollup', base);
    assert.equal(code, 0, 'rollup must exit 0');
    const r = json as Record<string, unknown>;

    // Portfolio cards intact.
    assert.equal(
      (r['portfolio_metrics'] as unknown[]).length,
      3,
      'rollup must still emit exactly 3 portfolio metrics'
    );

    // Org headline = per-metric mean, re-banded.
    const headline = r['headline'] as { delivery: Record<string, unknown>[] };
    assert.ok(
      headline,
      'rollup must emit an org headline for rich per-repo data'
    );
    const deploy = headline.delivery.find(
      (d) => d['label'] === 'Deployment frequency'
    );
    assert.ok(deploy, 'headline must include Deployment frequency');
    assert.equal(
      deploy['display_value'],
      '7 / wk',
      'deploy freq mean (8+6)/2 = 7 / wk'
    );
    assert.equal(deploy['band'], 'elite', 'deploy mean 7 re-bands to elite');
    const lead = headline.delivery.find(
      (d) => d['label'] === 'Lead time for change'
    );
    assert.equal(
      lead!['display_value'],
      '24 h',
      'lead time mean (12+36)/2 = 24 h'
    );

    // Enriched per_repo carries audit_total, coverage, delivery columns.
    const perRepo = r['per_repo'] as Record<string, unknown>[];
    assert.equal(
      perRepo.length,
      2,
      'broken (no audit.json) repo must be skipped'
    );
    const a = perRepo.find((p) => p['repo'] === 'service-a')!;
    assert.equal(
      a['audit_total'],
      50,
      'per_repo must carry audit_total from audit.json'
    );
    assert.equal(
      a['coverage'],
      0.5,
      'per_repo must carry coverage from audit.json'
    );
    assert.equal(
      a['merges_per_active'],
      4,
      'per_repo must carry merges/active from git.json'
    );
    assert.equal(
      a['deploy_freq'],
      8,
      'per_repo must carry deploy_freq from DF-01 check'
    );
    assert.equal(
      a['has_ai_tooling'],
      true,
      'has_ai_tooling derived from awarded code 101'
    );
    assert.deepEqual(
      a['sources_reachable'],
      ['git', 'ci'],
      'sources_reachable derived from audit.json available sources'
    );
    assert.equal(
      a['contributors'],
      8,
      'contributors derived from DESC-01 check value'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 'patch-judgment' — the verb SKILL.md invokes to apply judgment verdicts.
// Dispatch-layer contracts: stdin ("-") input path, invalid-JSON rejection,
// non-array rejection.
// ---------------------------------------------------------------------------

/** Write a minimal audits dir with one dimension file carrying a judgment check. */
function writeJudgmentAuditsDir(base: string): void {
  mkdirSync(base, { recursive: true });
  const dim = {
    dimension: 'spec-driven-development',
    date: '2026-07-01',
    order: 0,
    score: 0,
    coverage: 0,
    checks: [
      {
        check_id: 'SDD-03',
        code: [303],
        method: 'judgment',
        status: 'PENDING_JUDGMENT',
        value: null,
        evidence: [],
        weight_awarded: 0,
        weight_max: 4,
        applies: true,
        reliability: { tag: 'maximal', confidence: 'high', note: null },
        source: 'AWOS audit',
        definition: 'Spec quality (judgment)',
        hint: 'judged by the orchestrator',
      },
    ],
  };
  writeFileSync(
    join(base, 'spec-driven-development.json'),
    JSON.stringify(dim, null, 2)
  );
  // patch-judgment refuses to run without an engine-stamped audit.json.
  writeFileSync(
    join(base, 'audit.json'),
    JSON.stringify({
      date: '2026-07-01',
      project: 'patchj-fixture',
      audit_total: 0,
      coverage: 0,
      dimensions: [],
      engine: { generated_by: 'audit-core' },
    })
  );
}

test('patch-judgment: reads patches from stdin via "-", applies them, and re-aggregates', () => {
  const base = tmpDir('awos-patchj-stdin-');
  try {
    writeJudgmentAuditsDir(base);
    const patches = JSON.stringify([
      { check_id: 'SDD-03', status: 'PASS', evidence: ['spec looks solid'] },
    ]);

    const { json, code } = runCliStdin(patches, 'patch-judgment', base, '-');

    assert.equal(
      code,
      0,
      'patch-judgment with valid stdin patches must exit 0'
    );
    const r = json as Record<string, unknown>;
    assert.ok(
      Array.isArray(r['patched']) &&
        (r['patched'] as string[]).includes('SDD-03'),
      `summary.patched must list the patched check_id; got ${JSON.stringify(r['patched'])}`
    );
    assert.equal(
      r['aggregated'],
      base,
      'summary must confirm the audits dir was re-aggregated'
    );

    // The dimension artifact on disk must carry the patched verdict + weight.
    const dim = JSON.parse(
      readFileSync(join(base, 'spec-driven-development.json'), 'utf8')
    ) as { checks: Array<Record<string, unknown>> };
    const check = dim.checks.find((c) => c['check_id'] === 'SDD-03')!;
    assert.equal(
      check['status'],
      'PASS',
      'patched judgment check must be rewritten to PASS on disk'
    );
    assert.equal(
      check['weight_awarded'],
      4,
      'PASS patch must award the full weight_max (4)'
    );
    assert.deepEqual(
      check['evidence'],
      ['spec looks solid'],
      'patch evidence must replace the check evidence'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('patch-judgment: invalid JSON on stdin exits non-zero with a "not valid JSON" error', () => {
  const base = tmpDir('awos-patchj-badjson-');
  try {
    writeJudgmentAuditsDir(base);
    const { json, code } = runCliStdin(
      'this is { not json',
      'patch-judgment',
      base,
      '-'
    );
    assert.notEqual(code, 0, 'invalid patch JSON must exit non-zero');
    const err = json as Record<string, unknown>;
    assert.ok(
      typeof err['error'] === 'string' &&
        err['error'].includes('not valid JSON'),
      `error must say the patches are not valid JSON; got ${JSON.stringify(err)}`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('patch-judgment: non-array JSON on stdin exits non-zero with a "must be a JSON array" error', () => {
  const base = tmpDir('awos-patchj-nonarray-');
  try {
    writeJudgmentAuditsDir(base);
    const { json, code } = runCliStdin(
      '{"check_id":"SDD-03","status":"PASS"}',
      'patch-judgment',
      base,
      '-'
    );
    assert.notEqual(code, 0, 'a non-array patch document must exit non-zero');
    const err = json as Record<string, unknown>;
    assert.ok(
      typeof err['error'] === 'string' &&
        err['error'].includes('must be a JSON array'),
      `error must say patches must be a JSON array; got ${JSON.stringify(err)}`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 'patch-report' — apply report blocks + emit recommendations.md. The verb
// exists so the orchestrator never edits audit.json directly (the run-1 smoke
// finding: models used python3 -c to inject blocks by hand).
// ---------------------------------------------------------------------------

test('patch-report: merges blocks into audit.json and writes recommendations.md', () => {
  const base = tmpDir('awos-patchr-');
  try {
    writeJudgmentAuditsDir(base); // includes an engine-stamped audit.json
    const blocks = {
      headline: { reach: { ai_tooling: 'CLAUDE.md present' } },
      insights: [
        {
          theme: 'CI',
          severity: 'high',
          weak_areas: ['no pipeline'],
          so_what: 'x',
          improves: 'y',
        },
      ],
      recommendations: [
        {
          id: 'R1',
          priority: 'P1',
          title: 'Add CI',
          dimension: 'software-best-practices',
          check_id: 'SBP-04',
          effort: 'S',
          detail: 'Set up a CI pipeline.',
        },
        {
          id: 'R0',
          priority: 'P0',
          title: 'Add tests',
          dimension: 'quality-assurance',
          check_id: 'QA-01',
          effort: 'M',
          detail: 'Add a test suite.',
        },
      ],
    };
    const { json, code } = runCliStdin(
      JSON.stringify(blocks),
      'patch-report',
      base,
      '-'
    );
    assert.equal(code, 0, 'patch-report with valid blocks must exit 0');
    const r = json as Record<string, unknown>;
    assert.deepEqual(
      r['patched'],
      ['headline', 'insights', 'recommendations'],
      'summary.patched must list every applied block'
    );
    const audit = JSON.parse(readFileSync(join(base, 'audit.json'), 'utf8'));
    assert.equal(
      (audit.headline as any).reach.ai_tooling,
      'CLAUDE.md present',
      'headline block must be merged into audit.json'
    );
    assert.equal(
      audit.engine?.generated_by,
      'audit-core',
      'patch-report must preserve the engine provenance stamp'
    );
    const md = readFileSync(join(base, 'recommendations.md'), 'utf8');
    assert.ok(
      md.indexOf('P0 — Add tests') < md.indexOf('P1 — Add CI'),
      'recommendations.md must be emitted sorted by priority (P0 before P1)'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('report-context: flattens check values + window stats so the orchestrator never parses artifacts', () => {
  const base = tmpDir('awos-repctx-');
  try {
    writeJudgmentAuditsDir(base);
    // Give the stamped audit.json a dimension with one check, plus a git artifact.
    const audit = JSON.parse(readFileSync(join(base, 'audit.json'), 'utf8'));
    audit.dimensions = [
      {
        dimension: 'descriptors',
        checks: [
          {
            check_id: 'DESC-04',
            status: 'INFO',
            value: '1k LOC · 12 files',
            hint: 'scale',
            weight_awarded: 0,
            weight_max: 0,
            evidence: ['src/'],
          },
        ],
      },
    ];
    writeFileSync(join(base, 'audit.json'), JSON.stringify(audit));
    mkdirSync(join(base, 'collected'), { recursive: true });
    writeFileSync(
      join(base, 'collected', 'git.json'),
      JSON.stringify({
        source: 'git',
        available: true,
        raw: {
          window_stats: { authors_total: 7, merges_per_active_per_week: 1.5 },
        },
      })
    );
    const { json, code } = runCli('report-context', base);
    assert.equal(code, 0, 'report-context on a stamped audit must exit 0');
    const r = json as Record<string, any>;
    assert.equal(
      r.window_stats?.authors_total,
      7,
      'window_stats must be lifted from collected/git.json'
    );
    const check = (r.checks as any[]).find((c) => c.check_id === 'DESC-04');
    assert.equal(
      check?.value,
      '1k LOC · 12 files',
      'checks must be flattened with their values for transcription'
    );

    // Unstamped audit → refused, same circuit-breaker as the other verbs.
    const unstamped = tmpDir('awos-repctx-un-');
    writeFileSync(
      join(unstamped, 'audit.json'),
      JSON.stringify({ date: 'x', project: 'y', dimensions: [] })
    );
    const denied = runCli('report-context', unstamped);
    assert.notEqual(
      denied.code,
      0,
      'report-context must refuse an audit.json without engine provenance'
    );
    rmSync(unstamped, { recursive: true, force: true });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('patch-report: refuses an unstamped (hand-assembled) audit.json', () => {
  const base = tmpDir('awos-patchr-unstamped-');
  try {
    mkdirSync(base, { recursive: true });
    writeFileSync(
      join(base, 'audit.json'),
      JSON.stringify({
        date: '2026-07-01',
        project: 'x',
        audit_total: 0,
        coverage: 0,
        dimensions: [],
      })
    );
    const { code } = runCliStdin(
      JSON.stringify({ insights: [] }),
      'patch-report',
      base,
      '-'
    );
    assert.notEqual(
      code,
      0,
      'patch-report must exit non-zero when audit.json lacks engine provenance'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('patch-report: non-object blocks document exits non-zero', () => {
  const base = tmpDir('awos-patchr-nonobj-');
  try {
    writeJudgmentAuditsDir(base);
    const { json, code } = runCliStdin('[1,2]', 'patch-report', base, '-');
    assert.notEqual(code, 0, 'an array blocks document must exit non-zero');
    const err = json as Record<string, unknown>;
    assert.ok(
      typeof err['error'] === 'string' &&
        err['error'].includes('must be a JSON object'),
      `error must say blocks must be an object; got ${JSON.stringify(err)}`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 'render' — dispatch-layer error paths (flag validation before any rendering)
// ---------------------------------------------------------------------------

/** Write a minimal but valid audit.json for render error-path tests. */
function writeMinimalAudit(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const auditPath = join(dir, 'audit.json');
  writeFileSync(
    auditPath,
    JSON.stringify({
      date: '2026-07-01',
      project: 'render-errors',
      audit_total: 0,
      coverage: 0,
      dimensions: [],
    })
  );
  return auditPath;
}

test('render: unknown --format value exits non-zero naming the allowed formats', () => {
  const base = tmpDir('awos-render-badfmt-');
  try {
    const auditPath = writeMinimalAudit(base);
    const { json, code } = runCli('render', auditPath, '--format', 'pdf');
    assert.notEqual(code, 0, 'render with --format pdf must exit non-zero');
    const err = json as Record<string, unknown>;
    assert.ok(
      typeof err['error'] === 'string' &&
        err['error'].includes('md') &&
        err['error'].includes('html') &&
        err['error'].includes('both') &&
        err['error'].includes('pdf'),
      `error must name the allowed formats and echo the bad value; got ${JSON.stringify(err)}`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('render --format both into a per-repo dir: HTML back-link targets the org #repos anchor', () => {
  const base = tmpDir('awos-render-backlink-');
  try {
    const auditPath = join(base, 'audit.json');
    writeFileSync(
      auditPath,
      JSON.stringify({
        date: '2026-07-01',
        project: 'backlink',
        audit_total: 0,
        coverage: 0,
        dimensions: [],
        engine: { generated_by: 'audit-core' },
      })
    );
    const outDir = join(base, 'per-repo', 'myrepo');
    const { code } = runCli(
      'render',
      auditPath,
      '--format',
      'both',
      '--out-dir',
      outDir
    );
    assert.equal(code, 0, 'render --format both into per-repo/ must succeed');
    const html = readFileSync(join(outDir, 'report.html'), 'utf8');
    assert.ok(
      html.includes('href="../../report.html#repos"'),
      'per-repo HTML back-link must target the org Repositories anchor (#repos) so the reader returns to the table they navigated from'
    );
    const md = readFileSync(join(outDir, 'report.md'), 'utf8');
    assert.ok(
      md.includes('(../../report.md)'),
      'per-repo Markdown back-link keeps the plain org report path'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('render: --format both without --out-dir exits non-zero with a usage error', () => {
  const base = tmpDir('awos-render-nooutdir-');
  try {
    const auditPath = writeMinimalAudit(base);
    const { json, code } = runCli('render', auditPath, '--format', 'both');
    assert.notEqual(
      code,
      0,
      'render --format both without --out-dir must exit non-zero'
    );
    const err = json as Record<string, unknown>;
    assert.ok(
      typeof err['error'] === 'string' && err['error'].includes('--out-dir'),
      `error must say --format both requires --out-dir; got ${JSON.stringify(err)}`
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
