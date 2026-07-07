import { parse } from 'smol-toml';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditJson, Check, DimensionArtifact } from '../artifact_types.ts';
import { DETECTORS } from '../detectors/index.ts';
import { clearDetectorCaches } from '../detectors/_base.ts';
import type { DetectorResult } from '../detectors/_base.ts';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Create a fresh isolated temp directory for a test fixture. */
export function tmpDir(prefix = 'awos-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Run a `git` command in `cwd` with a fully-pinned author/committer identity and
 * date, so collector tests build hermetic, deterministic histories.
 */
export function gitAs(
  cwd: string,
  args: string[],
  date: string,
  name: string,
  email: string
): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    },
  });
}

/**
 * Write a file tree into `dir`: keys are repo-relative paths (subdirectories
 * created as needed), values the file contents.
 */
export function writeRepo(dir: string, files: Record<string, string>): void {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
}

export function loadStandards(): any {
  return parse(
    readFileSync(join(SKILL, 'references', 'standards.toml'), 'utf8')
  );
}

let standardsCache: any = null;

/**
 * Run one detector by category code with its standards.toml verdict params —
 * the in-process equivalent of the retired `cli.ts detect <code> <repo>` verb.
 * Clears the repo-immutability caches first, so repeated calls against a
 * mutated temp repo behave like the fresh subprocess each spawn used to be.
 */
export function runDetector(code: number, repoPath: string): DetectorResult {
  clearDetectorCaches();
  const fn = DETECTORS[code];
  if (!fn) throw new Error(`no detector registered for code ${code}`);
  standardsCache ??= loadStandards();
  const cats = (standardsCache['category'] ?? {}) as Record<string, any>;
  const cat = Object.values(cats).find((c) => c.code === code);
  return fn(repoPath, {
    threshold: cat?.threshold,
    threshold_days: cat?.threshold_days,
    pass_at: cat?.pass_at,
    warn_at: cat?.warn_at,
    fail_at: cat?.fail_at,
  });
}

/**
 * Baseline `git` collector `raw` artifact for metric tests. Defaults describe an
 * empty repo (no commits, merges, tooling, or churn); pass `overrides` to set
 * only the fields a given test exercises. Extra keys (e.g. `window_stats`,
 * `code_turnover`) merge through, so a test needing them just names them.
 */
export function gitRaw(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 0,
    ai_marked_commits: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
    ...overrides,
  };
}

/**
 * Serialize a `tracker` collector artifact (the bare `{ available, raw }`
 * envelope the i-series metrics read from `tracker.json`). `raw` carries the
 * metric-specific payload (`tickets`, `type_counts`, `incident_source`, …).
 */
export function trackerArtifact(raw: unknown, available = true): string {
  return JSON.stringify({ available, raw });
}

/** Minimal valid Check fixture for renderer tests — extend per test. */
export function makeCheck(overrides: Partial<Check> = {}): Check {
  return {
    check_id: 'TEST-01',
    code: [1001],
    method: 'detected',
    status: 'PASS',
    value: null,
    evidence: [],
    weight_awarded: 1,
    weight_max: 1,
    applies: true,
    reliability: { tag: 'maximal', confidence: 'high', note: null },
    source: 'git',
    definition: 'Test check definition',
    hint: 'Test hint',
    ...overrides,
  };
}

/** Minimal valid DimensionArtifact fixture. */
export function makeDim(
  dimension: string,
  checks: Check[] = [],
  overrides: Partial<DimensionArtifact> = {}
): DimensionArtifact {
  return {
    dimension,
    date: '2026-01-01',
    score: 0,
    coverage: 0,
    checks,
    ...overrides,
  };
}

/** Minimal valid audit fixture — extend per test. */
export function makeAudit(overrides: Partial<AuditJson> = {}): AuditJson {
  return {
    date: '2026-01-01',
    project: 'test-project',
    audit_total: 10,
    coverage: 0.5,
    dimensions: [],
    ...overrides,
  };
}

/**
 * A written dimension-check record as it appears inside a per-dimension JSON
 * (the shape aggregate() reads and re-derives). Defaults describe an applicable,
 * fully-passing detected check with zero awarded weight; pass `overrides` for the
 * fields a test exercises (status, score, weight_max, sources, …). Typed loosely
 * because these fixtures are round-tripped through JSON and asserted with casts.
 */
export function makeCheckRecord(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    check_id: 'CHK-01',
    code: [1],
    method: 'detected',
    status: 'PASS',
    value: null,
    evidence: [],
    weight_awarded: 0,
    weight_max: 1,
    score: 0,
    confidence: 1,
    applies: true,
    reliability: { tag: 'maximal', confidence: 'HIGH', note: null },
    source: '',
    definition: '',
    hint: '',
    plain: '',
    ...overrides,
  };
}

export function writeCollected(
  tmpDir: string,
  source: string,
  raw: unknown,
  available = true
): string {
  const d = join(tmpDir, 'collected');
  mkdirSync(d, { recursive: true });
  const art = {
    source,
    available,
    reason_if_absent: null,
    period: { bucket_days: 30, lookback_days: 730, history_available_days: 0 },
    raw,
  };
  writeFileSync(join(d, `${source}.json`), JSON.stringify(art));
  return d;
}
