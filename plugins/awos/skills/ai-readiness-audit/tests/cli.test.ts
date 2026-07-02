/**
 * cli.test.ts — hermetic smoke tests for dist/cli.js (the bundled dispatcher).
 *
 * Runs against the BUNDLED file, not the TypeScript sources, so build:engine
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
import { tmpdir } from 'node:os';

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
// 'detect' smoke test — category 2706 (Python-2 except-clause syntax)
// ---------------------------------------------------------------------------

test('detect 2706: FAIL when repo contains Python-2 except-clause syntax', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'awos-cli-test-'));
  try {
    // Write a Python file that triggers the pattern: `except A, B:` (Py2-only)
    mkdirSync(join(tmpRepo, 'src'), { recursive: true });
    writeFileSync(
      join(tmpRepo, 'src', 'bad.py'),
      'try:\n    risky()\nexcept ValueError, IOError:\n    pass\n'
    );

    const { json, code } = runCli('detect', '2706', tmpRepo);

    assert.equal(
      code,
      0,
      'detect must exit 0 even when result is FAIL (it found the defect)'
    );
    assert.ok(json && typeof json === 'object', 'output must be a JSON object');
    const result = json as Record<string, unknown>;
    assert.equal(
      result['status'],
      'FAIL',
      'status must be FAIL for a file with Python-2 except syntax'
    );
    assert.ok(Array.isArray(result['evidence']), 'evidence must be an array');
    const evidence = result['evidence'] as string[];
    assert.ok(
      evidence.some((e) => e.includes('bad.py')),
      `evidence must mention bad.py; got: ${JSON.stringify(evidence)}`
    );
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 'collect' smoke test — git collector produces a valid artifact
// ---------------------------------------------------------------------------

test('collect git: artifact has source === "git" and required fields', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'awos-cli-collect-'));
  try {
    // Init a minimal git repo so the git collector can run
    execFileSync('git', ['init', '--quiet', tmpRepo]);
    execFileSync('git', [
      '-C',
      tmpRepo,
      'config',
      'user.email',
      'test@example.com',
    ]);
    execFileSync('git', ['-C', tmpRepo, 'config', 'user.name', 'Test']);
    writeFileSync(join(tmpRepo, 'README.md'), '# test\n');
    execFileSync('git', ['-C', tmpRepo, 'add', '.']);
    execFileSync('git', ['-C', tmpRepo, 'commit', '--quiet', '-m', 'init']);

    const { json, code } = runCli('collect', 'git', tmpRepo);

    assert.equal(code, 0, 'collect git must exit 0');
    assert.ok(json && typeof json === 'object', 'output must be a JSON object');
    const artifact = json as Record<string, unknown>;

    assert.equal(artifact['source'], 'git', 'artifact.source must be "git"');
    assert.ok('available' in artifact, 'artifact must have available field');
    assert.ok('period' in artifact, 'artifact must have period field');
    assert.ok('raw' in artifact, 'artifact must have raw field');
    assert.equal(
      artifact['available'],
      true,
      'artifact.available must be true for a valid git repo'
    );
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 'metric' command — exits non-zero with a clear error for unknown metric id
// ---------------------------------------------------------------------------

test('metric <id>: exits non-zero with error JSON for unknown metric id', () => {
  const { json, code } = runCli('metric', 'ADP-I1', '/tmp');
  assert.notEqual(code, 0, 'unknown metric id must exit non-zero');
  assert.ok(json && typeof json === 'object', 'must print JSON error');
  const err = json as Record<string, unknown>;
  assert.ok(
    typeof err['error'] === 'string' && err['error'].length > 0,
    'error field must be a non-empty string naming the unknown metric'
  );
});

// ---------------------------------------------------------------------------
// unknown collector exits non-zero
// ---------------------------------------------------------------------------

test('collect unknown-source: exits non-zero with error JSON', () => {
  const { json, code } = runCli('collect', 'nonexistent', '/tmp');
  assert.notEqual(code, 0, 'unknown collector must exit non-zero');
  assert.ok(json && typeof json === 'object', 'must print JSON error');
  const err = json as Record<string, unknown>;
  assert.ok(typeof err['error'] === 'string', 'error field must be a string');
});

// ---------------------------------------------------------------------------
// 'standards' verb — parses standards.toml and emits JSON
// ---------------------------------------------------------------------------

test('standards: parses standards.toml, emits JSON with expected codes and meta', () => {
  // Use the canonical standards.toml shipped with this plugin.
  const standardsPath = join(SKILL, 'references', 'standards.toml');

  const { json, code } = runCli('standards', standardsPath);

  assert.equal(code, 0, 'standards must exit 0');
  assert.ok(json && typeof json === 'object', 'output must be a JSON object');

  const parsed = json as Record<string, unknown>;

  // [meta] must be present with the locked cadence constants.
  assert.ok(
    parsed['meta'] && typeof parsed['meta'] === 'object',
    'parsed JSON must have a "meta" key'
  );
  const meta = parsed['meta'] as Record<string, unknown>;
  assert.equal(
    meta['monthly_bucket_days'],
    undefined,
    'meta.monthly_bucket_days must be absent (bucket machinery removed)'
  );

  // [category.*] tables must be present.
  assert.ok(
    parsed['category'] && typeof parsed['category'] === 'object',
    'parsed JSON must have a "category" key'
  );
  const categories = parsed['category'] as Record<string, unknown>;
  const categoryCodes = Object.values(categories)
    .filter((v) => v && typeof v === 'object')
    .map((v) => (v as Record<string, unknown>)['code'])
    .filter((c) => typeof c === 'number');

  // At minimum the first three ADP-G1 codes (101, 102, 103) must be present.
  for (const expectedCode of [101, 102, 103]) {
    assert.ok(
      categoryCodes.includes(expectedCode),
      `standards.toml categories must include code ${expectedCode}`
    );
  }
});

test('standards: exits non-zero with error JSON when file does not exist', () => {
  const { json, code } = runCli('standards', '/no/such/file.toml');
  assert.notEqual(code, 0, 'standards must exit non-zero when file missing');
  assert.ok(json && typeof json === 'object', 'must print JSON error');
  const err = json as Record<string, unknown>;
  assert.ok(
    typeof err['error'] === 'string' && err['error'].length > 0,
    'error field must be a non-empty string'
  );
});

// ---------------------------------------------------------------------------
// 'metric' query-once path — collectedDir argument reads pre-written artifacts
// ---------------------------------------------------------------------------

test('metric adp_g2_contributors: query-once path reads pre-collected git.json', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'awos-cli-queryonce-'));
  const collectedDir = join(tmpRepo, 'collected');
  try {
    // Init a minimal git repo.
    execFileSync('git', ['init', '--quiet', tmpRepo]);
    execFileSync('git', [
      '-C',
      tmpRepo,
      'config',
      'user.email',
      'test@example.com',
    ]);
    execFileSync('git', ['-C', tmpRepo, 'config', 'user.name', 'Test']);
    writeFileSync(join(tmpRepo, 'README.md'), '# test\n');
    execFileSync('git', ['-C', tmpRepo, 'add', '.']);
    execFileSync('git', ['-C', tmpRepo, 'commit', '--quiet', '-m', 'init']);

    // Step 1: collect git artifact via the collect verb.
    const { json: artifact, code: collectCode } = runCli(
      'collect',
      'git',
      tmpRepo
    );
    assert.equal(collectCode, 0, 'collect git must exit 0');
    mkdirSync(collectedDir, { recursive: true });
    writeFileSync(
      join(collectedDir, 'git.json'),
      JSON.stringify(artifact, null, 2)
    );

    // Step 2: run metric with pre-collected dir (query-once path).
    const { json: result, code: metricCode } = runCli(
      'metric',
      'adp_g2_contributors',
      tmpRepo,
      collectedDir
    );

    assert.equal(metricCode, 0, 'metric adp_g2_contributors must exit 0');
    assert.ok(
      result && typeof result === 'object',
      'output must be a JSON object'
    );
    const r = result as Record<string, unknown>;
    assert.equal(
      r['metric'],
      'adp_g2_contributors',
      'metric field must be "adp_g2_contributors"'
    );
    assert.equal(
      r['status'],
      'OK',
      'adp_g2 must be OK after migrating to window_stats.per_author'
    );
    assert.ok(
      Array.isArray(r['categories_awarded']) &&
        (r['categories_awarded'] as number[]).includes(201),
      'adp_g2 must award code 201 when active contributor count is available'
    );
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

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
  const base = mkdtempSync(join(tmpdir(), 'awos-rollup-test-'));
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
}

test('patch-judgment: reads patches from stdin via "-", applies them, and re-aggregates', () => {
  const base = mkdtempSync(join(tmpdir(), 'awos-patchj-stdin-'));
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
  const base = mkdtempSync(join(tmpdir(), 'awos-patchj-badjson-'));
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
  const base = mkdtempSync(join(tmpdir(), 'awos-patchj-nonarray-'));
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
  const base = mkdtempSync(join(tmpdir(), 'awos-render-badfmt-'));
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

test('render: --format both without --out-dir exits non-zero with a usage error', () => {
  const base = mkdtempSync(join(tmpdir(), 'awos-render-nooutdir-'));
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
