#!/usr/bin/env node
/**
 * cli.ts — single CLI dispatcher for the ai-readiness-audit engine.
 *
 * Bundled by build-engine.mjs → dist/cli.js (all imports inlined, no external deps).
 *
 * Usage:
 *   node dist/cli.js collect   <source>           <repoPath>
 *   node dist/cli.js detect    <code>             <repoPath>
 *   node dist/cli.js metric    <id>               <repoPath> [collectedDir]
 *   node dist/cli.js standards <path-to-toml>
 *   node dist/cli.js progress  <elapsed_seconds>  <done> <total>
 *   node dist/cli.js rollup    <dir-of-per-repo-jsons>
 *
 * The optional [collectedDir] argument to `metric` is the "query-once" path:
 * if supplied, the metric reads pre-written <collectedDir>/<source>.json
 * artifacts instead of running collectors inline.  Omit for the original
 * self-collect behavior.
 */

// ---------------------------------------------------------------------------
// Standards parser (smol-toml — bundled, no Python required)
// ---------------------------------------------------------------------------
import { parse as parseToml } from 'smol-toml';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------
import {
  collect as collectGit,
  ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT,
  REWORK_HORIZON_DAYS_DEFAULT,
} from './collectors/git.ts';
import { collect as collectCi } from './collectors/ci.ts';
import { collect as collectTracker } from './collectors/tracker.ts';
import { collect as collectDocs } from './collectors/docs.ts';
import { writeArtifact } from './collectors/_base.ts';

const COLLECTORS: Record<
  string,
  (repoPath: string, period: Period) => unknown
> = {
  git: collectGit,
  ci: collectCi,
  tracker: collectTracker,
  docs: collectDocs,
};

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------
import { DETECTORS as SBP_DETECTORS } from './detectors/software_best_practices.ts';
import { DETECTORS as CODE_ARCH_DETECTORS } from './detectors/code_architecture.ts';
import { DETECTORS as SDD_DETECTORS } from './detectors/spec_driven_development.ts';
import { DETECTORS as AI_TOOLING_DETECTORS } from './detectors/ai_development_tooling.ts';
import { DETECTORS as E2E_DETECTORS } from './detectors/end_to_end_delivery.ts';
import { DETECTORS as SEC_DETECTORS } from './detectors/security.ts';
import { DETECTORS as SCS_DETECTORS } from './detectors/supply_chain_security.ts';
import { DETECTORS as PAI_DETECTORS } from './detectors/prompt_agent_integrity.ts';
import { DETECTORS as QA_DETECTORS } from './detectors/quality_assurance.ts';
import { DETECTORS as DOC_DETECTORS } from './detectors/documentation.ts';
import { DETECTORS as AS_DETECTORS } from './detectors/application_security.ts';
// Adding a detector module is a one-line change per import + one spread below.

import { type DetectorResult } from './detectors/_base.ts';

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => DetectorResult
> = {
  ...SBP_DETECTORS,
  ...CODE_ARCH_DETECTORS,
  ...SDD_DETECTORS,
  ...AI_TOOLING_DETECTORS,
  ...E2E_DETECTORS,
  ...SEC_DETECTORS,
  ...SCS_DETECTORS,
  ...PAI_DETECTORS,
  ...QA_DETECTORS,
  ...DOC_DETECTORS,
  ...AS_DETECTORS,
};

// ---------------------------------------------------------------------------
// Metric modules
// ---------------------------------------------------------------------------
import { compute as computeG1 } from './metrics/adp_g1_tooling_depth.ts';
import { compute as computeG2 } from './metrics/adp_g2_contributors.ts';
import { compute as computeG3 } from './metrics/adp_g3_deploy_frequency.ts';
import { compute as computeG4 } from './metrics/adp_g4_lead_time.ts';
import { compute as computeG5 } from './metrics/adp_g5_pr_cycle_time.ts';
import { compute as computeG6 } from './metrics/adp_g6_churn.ts';
import { compute as computeG7 } from './metrics/adp_g7_change_fail_rate.ts';
import { compute as computeG8 } from './metrics/adp_g8_review_rework.ts';
import { compute as computeG9 } from './metrics/adp_g9_ai_attribution.ts';
import { compute as computeC1 } from './metrics/adp_c1_ci_pass_rate.ts';
import { compute as computeC2 } from './metrics/adp_c2_pipeline_duration.ts';
import { compute as computeD1 } from './metrics/adp_d1_spec_coverage.ts';
import { compute as computeI1 } from './metrics/adp_i1_work_mix.ts';
import { compute as computeI2 } from './metrics/adp_i2_throughput.ts';
import { compute as computeI3 } from './metrics/adp_i3_mttr.ts';
import { compute as computeI4 } from './metrics/adp_i4_subtask_split.ts';
import { compute as computeI5 } from './metrics/adp_i5_description_quality.ts';
import { compute as computeG10 } from './metrics/adp_g10_complexity.ts';
import { compute as computeG11 } from './metrics/adp_g11_scale.ts';
import { compute as computeG12 } from './metrics/adp_g12_deps.ts';
import { compute as computeG13 } from './metrics/adp_g13_doc_coverage.ts';
import { compute as computeG14 } from './metrics/adp_g14_rework_rate.ts';
import { compute as computeG15 } from './metrics/adp_g15_onboarding_ease.ts';
// Adding a metric module is a one-line change per import + one entry in METRICS below.

import type { MetricResult } from './metrics/_base.ts';
import { loadStandards, metaNumber } from './metrics/_base.ts';

// ---------------------------------------------------------------------------
// Org rollup
// ---------------------------------------------------------------------------
import { rollup as orgRollup } from './metrics/org_rollup.ts';
import type { PerRepoInput, PerRepoDelivery } from './metrics/org_rollup.ts';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
import { renderMarkdown, renderHtml } from './render.ts';
import type { AuditJson } from './render.ts';

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------
import { progress } from './progress.ts';

// ---------------------------------------------------------------------------
// audit-core (deterministic single-pass audit)
// ---------------------------------------------------------------------------
import { auditCore, aggregate } from './audit_core.ts';

/** Resolve the skill root (where references/ lives) from the bundle location. */
function resolveSkillRoot(): string {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  return cliDir.endsWith('/dist') || cliDir.endsWith('\\dist')
    ? dirname(cliDir)
    : cliDir;
}

// MetricFn may return a MetricResult synchronously or a Promise<MetricResult>
// (adp_g10_complexity is async — requires wasm init).
type MetricFn = (
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>,
  repoPath?: string
) => MetricResult | Promise<MetricResult>;

export const METRICS: Record<string, MetricFn> = {
  adp_g1_tooling_depth: computeG1,
  adp_g2_contributors: computeG2,
  adp_g3_deploy_frequency: computeG3,
  adp_g4_lead_time: computeG4,
  adp_g5_pr_cycle_time: computeG5,
  adp_g6_churn: computeG6,
  adp_g7_change_fail_rate: computeG7,
  adp_g8_review_rework: computeG8,
  adp_g9_ai_attribution: computeG9,
  adp_c1_ci_pass_rate: computeC1,
  adp_c2_pipeline_duration: computeC2,
  adp_d1_spec_coverage: computeD1,
  adp_i1_work_mix: computeI1,
  adp_i2_throughput: computeI2,
  adp_i3_mttr: computeI3,
  adp_i4_subtask_split: computeI4,
  adp_i5_description_quality: computeI5,
  adp_g10_complexity: computeG10,
  adp_g11_scale: computeG11,
  adp_g12_deps: computeG12,
  adp_g13_doc_coverage: computeG13,
  adp_g14_rework_rate: computeG14,
  adp_g15_onboarding_ease: computeG15,
};

// ---------------------------------------------------------------------------
// Default period
// ---------------------------------------------------------------------------
// TODO: accept period from a CLI flag or env var (e.g. AWOS_PERIOD_JSON) so
// the orchestrator can pass real values.  For now the orchestrator runs with
// this default and overrides values via the collector's own defaults.
import type { Period } from './collectors/_base.ts';

/** Build the collection Period from standards.toml [meta] (the source of truth). */
function periodFromMeta(standards: Record<string, unknown>): Period {
  return {
    bucket_days: 30,
    lookback_days: metaNumber(standards, 'max_lookback_days', 90),
    history_available_days: 0,
  };
}

/** Git collector tunables from standards.toml [meta] (the source of truth). */
function gitOptsFromMeta(standards: Record<string, unknown>) {
  return {
    activeContributorThreshold: metaNumber(
      standards,
      'active_contributor_threshold',
      ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT
    ),
    reworkHorizonDays: metaNumber(
      standards,
      'rework_horizon_days',
      REWORK_HORIZON_DAYS_DEFAULT
    ),
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// rollup helpers — read one repo's FULL audit into a rich PerRepoInput.
// ---------------------------------------------------------------------------

/**
 * Delivery check_id → the PerRepoDelivery field it feeds.
 * Only the git-sourced DORA metrics feed the deterministic rollup. Cycle-time
 * and MTTR are connector-gated (tracker / incident) and never derived from git,
 * so they are intentionally absent here — the deterministic org headline omits
 * them.
 */
const DELIVERY_CHECK_IDS: Array<[string, keyof PerRepoDelivery]> = [
  ['DF-01', 'deploy_freq'],
  ['DF-06', 'rework_rate'],
  ['DF-02', 'lead_time'],
  ['DF-04', 'change_fail'],
];

/** AI-tooling category codes (101–106); any awarded → has_ai_tooling. */
const AI_TOOLING_CODES = new Set([101, 102, 103, 104, 105, 106]);

interface AuditCheck {
  check_id?: string;
  code?: number[];
  status?: string;
  value?: unknown;
  weight_awarded?: number;
  definition?: string;
}

interface AuditDimension {
  dimension?: string;
  checks?: AuditCheck[];
}

interface AuditJson {
  audit_total?: number;
  coverage?: number;
  dimensions?: AuditDimension[];
  sources?: Array<{ source?: string; available?: boolean }>;
  tech_stack?: {
    languages: Array<{ name: string }>;
    agent_tools: Array<{ name: string }>;
    ci: Array<{ name: string }>;
    frameworks: Array<{ name: string }>;
  };
  linked_repos?: Array<{ name: string; via?: string; kind?: string }>;
}

/** Coerce a check value to a finite number, else null (covers SKIP/null/NaN). */
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Read <repoDir>/audit.json + <repoDir>/collected/git.json and derive a rich
 * PerRepoInput. Returns null (logging to stderr) when audit.json is missing or
 * unparseable, so one bad repo never crashes the whole rollup.
 */
function readPerRepoAudit(
  repoDir: string,
  repoName: string
): PerRepoInput | null {
  const auditPath = join(repoDir, 'audit.json');
  let audit: AuditJson;
  try {
    audit = JSON.parse(readFileSync(auditPath, 'utf8')) as AuditJson;
  } catch {
    process.stderr.write(
      `rollup: skipping ${repoName} — missing or unparseable audit.json\n`
    );
    return null;
  }

  // Flatten every check once; index by check_id and scan for AI-tooling codes.
  const checks: AuditCheck[] = (audit.dimensions ?? []).flatMap(
    (d) => d.checks ?? []
  );
  const byCheckId = new Map<string, AuditCheck>();
  let hasAiTooling = false;
  for (const c of checks) {
    if (c.check_id && !byCheckId.has(c.check_id)) byCheckId.set(c.check_id, c);
    const awarded = (c.weight_awarded ?? 0) > 0 || c.status === 'PASS';
    if (awarded && (c.code ?? []).some((code) => AI_TOOLING_CODES.has(code)))
      hasAiTooling = true;
  }

  // Build the compact checks list for cross-repo gap aggregation (Task 5.5).
  // Iterate dimensions so each check record carries its dimension slug.
  const checksForGaps: Array<{
    check_id: string;
    dimension: string;
    definition: string;
    status: string;
  }> = [];
  for (const dim of audit.dimensions ?? []) {
    const dimSlug = dim.dimension ?? '';
    for (const c of dim.checks ?? []) {
      if (!c.check_id) continue;
      checksForGaps.push({
        check_id: c.check_id,
        dimension: dimSlug,
        definition: c.definition ?? '',
        status: c.status ?? '',
      });
    }
  }

  // Delivery check values by check_id (null when absent / SKIP / null value).
  const delivery: PerRepoDelivery = {};
  for (const [checkId, field] of DELIVERY_CHECK_IDS) {
    delivery[field] = numOrNull(byCheckId.get(checkId)?.value);
  }

  // Merges/LOC per active contributor from the git artifact (best-effort).
  const gitPath = join(repoDir, 'collected', 'git.json');
  if (existsSync(gitPath)) {
    try {
      const git = JSON.parse(readFileSync(gitPath, 'utf8')) as {
        raw?: { window_stats?: Record<string, unknown> };
      };
      const ws = git.raw?.window_stats ?? {};
      delivery.merges_per_active = numOrNull(ws.merges_per_active);
      delivery.loc_per_active = numOrNull(ws.loc_per_active);
    } catch {
      process.stderr.write(
        `rollup: ${repoName} — unparseable collected/git.json, dropping per-active stats\n`
      );
    }
  } else {
    process.stderr.write(
      `rollup: ${repoName} — no collected/git.json, per-active stats unavailable\n`
    );
  }

  // Legacy summary fields derived from the audit (no flat <repo>.json needed).
  const auditTotal = numOrNull(audit.audit_total) ?? 0;
  const sourcesReachable = (audit.sources ?? [])
    .filter((s) => s.available)
    .map((s) => s.source ?? '')
    .filter((s) => s.length > 0);
  const contributors = numOrNull(byCheckId.get('DESC-01')?.value);

  return {
    repo: repoName,
    contributors: contributors ?? undefined,
    awarded_weight: auditTotal,
    sources_reachable: sourcesReachable,
    has_ai_tooling: hasAiTooling,
    audit_total: auditTotal,
    coverage: numOrNull(audit.coverage) ?? undefined,
    delivery,
    tech_stack: audit.tech_stack,
    linked_repos: audit.linked_repos,
    checks: checksForGaps,
  };
}

async function main(): Promise<void> {
  const [, , command, arg1, arg2] = process.argv;

  if (!command) {
    printJson({
      error: 'no command given',
      usage:
        'collect|detect|metric|standards|progress|rollup|render|aggregate|audit-core <arg> [repoPath]',
    });
    process.exit(1);
  }

  switch (command) {
    case 'collect': {
      const source = arg1;
      const repoPath = arg2;
      if (!source || !repoPath) {
        printJson({ error: 'collect requires <source> and <repoPath>' });
        process.exit(1);
      }
      const fn = COLLECTORS[source];
      if (!fn) {
        printJson({
          error: `unknown collector source "${source}"`,
          known: Object.keys(COLLECTORS),
        });
        process.exit(1);
      }
      // Period + git tunables come from standards.toml [meta], never hardcoded.
      const collectStandards = loadStandards(
        join(resolveSkillRoot(), 'references', 'standards.toml')
      );
      printJson(
        fn(
          repoPath,
          periodFromMeta(collectStandards),
          gitOptsFromMeta(collectStandards)
        )
      );
      break;
    }

    case 'detect': {
      const codeStr = arg1;
      const repoPath = arg2;
      if (!codeStr || !repoPath) {
        printJson({ error: 'detect requires <code> and <repoPath>' });
        process.exit(1);
      }
      const code = Number(codeStr);
      if (!Number.isInteger(code)) {
        printJson({
          error: `detector code must be an integer, got "${codeStr}"`,
        });
        process.exit(1);
      }
      const fn = DETECTORS[code];
      if (!fn) {
        printJson({
          error: `unknown detector code ${code}`,
          known: Object.keys(DETECTORS)
            .map(Number)
            .sort((a, b) => a - b),
        });
        process.exit(1);
      }
      printJson(fn(repoPath));
      break;
    }

    case 'standards': {
      const tomlPath = arg1;
      if (!tomlPath) {
        printJson({ error: 'standards requires <path-to-standards.toml>' });
        process.exit(1);
      }
      let raw: string;
      try {
        raw = readFileSync(tomlPath, 'utf8');
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        printJson({
          error: `cannot read standards file: ${e.message}`,
          path: tomlPath,
        });
        process.exit(1);
      }
      const parsed = parseToml(raw);
      printJson(parsed);
      break;
    }

    case 'metric': {
      const id = arg1;
      const repoPath = arg2;
      // Optional 3rd argument: a pre-populated collected/ directory.
      // When provided, no inline collection is performed — the metric reads
      // the existing <collectedDir>/<source>.json artifacts directly.
      // This is the "query-once" path used by the ai-sdlc-adoption orchestrator.
      const [, , , , , arg3] = process.argv;
      const preCollectedDir: string | undefined = arg3;

      if (!id || !repoPath) {
        printJson({ error: 'metric requires <id> and <repoPath>' });
        process.exit(1);
      }
      const metricFn = METRICS[id];
      if (!metricFn) {
        printJson({
          error: `unknown metric "${id}"`,
          known: Object.keys(METRICS).sort(),
        });
        process.exit(1);
      }

      // Load standards up front — the Period and git tunables come from its
      // [meta] table (source of truth), and the metric needs it for scoring.
      const standardsPath = join(
        resolveSkillRoot(),
        'references',
        'standards.toml'
      );
      const standards = loadStandards(standardsPath);
      const period = periodFromMeta(standards);
      const gitOpts = gitOptsFromMeta(standards);

      // Scale-based metrics (G10/G11/G12) scan the repo directly and do not
      // need a collector artifact.  They receive repoPath as the 4th argument.
      const isScaleMetric =
        id === 'adp_g10_complexity' ||
        id === 'adp_g11_scale' ||
        id === 'adp_g12_deps';

      let collectedDir: string;

      if (preCollectedDir) {
        // Query-once path: use the caller-supplied collected/ directory.
        // No inline collection — artifacts were already written by `collect` verbs.
        collectedDir = preCollectedDir;
      } else if (isScaleMetric) {
        // Scale metrics don't need a collector artifact — they scan repoPath directly.
        // Use repoPath as collectedDir; the metric ignores it and uses the override.
        collectedDir = repoPath;
      } else {
        // Inline path (backward-compatible): run required collectors into a temp dir.
        const tmpRoot = mkdtempSync(join(tmpdir(), 'awos-metric-'));
        collectedDir = join(tmpRoot, 'collected');
        // Git collector is always run for ADP-G* metrics.
        const gitArtifact = collectGit(repoPath, period, gitOpts);
        writeArtifact(gitArtifact as { source: string }, collectedDir);
        // CI collector is run for ADP-C* metrics.
        if (id.startsWith('adp_c')) {
          const ciArtifact = collectCi(repoPath, period);
          writeArtifact(ciArtifact as { source: string }, collectedDir);
        }
        // Docs collector is run for ADP-D* metrics.
        if (id.startsWith('adp_d')) {
          const docsArtifact = collectDocs(repoPath, period);
          writeArtifact(docsArtifact as { source: string }, collectedDir);
        }
        // Tracker collector is run for ADP-I* metrics (also git for MTTR proxy).
        if (id.startsWith('adp_i')) {
          const trackerArtifact = collectTracker(repoPath, period);
          writeArtifact(trackerArtifact as { source: string }, collectedDir);
        }
      }

      // Await in case the metric is async (e.g. adp_g10_complexity uses wasm init).
      const result = await metricFn(collectedDir, standards, {}, repoPath);
      printJson(result);
      break;
    }

    case 'rollup': {
      // Aggregate the FULL per-repo audits into ≤3 portfolio metrics, an org
      // headline (average delivery matrix), and enriched per-repo rows.
      //
      // Usage:
      //   node dist/cli.js rollup <per-repo-dir>
      //
      // <per-repo-dir> holds one SUBDIRECTORY per repo (as written by SKILL.md
      // Step 6's org branch): <per-repo-dir>/<repo>/audit.json plus
      // <per-repo-dir>/<repo>/collected/git.json. For each repo we read the
      // full audit — audit_total, coverage, the six delivery check values by
      // check_id — and the git artifact's per-active-contributor stats, then
      // derive the legacy summary fields so a flat <repo>.json is no longer
      // required. A repo dir missing either artifact is skipped (logged to
      // stderr), never crashing the whole rollup.
      const dirArg = arg1;
      if (!dirArg) {
        printJson({
          error: 'rollup requires <per-repo-dir>',
          usage: 'node dist/cli.js rollup <per-repo-dir>',
        });
        process.exit(1);
      }
      const { readdirSync: rd, statSync: st } = await import('node:fs');
      let entries: string[];
      try {
        entries = rd(dirArg);
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        printJson({
          error: `cannot read rollup directory: ${e.message}`,
          dir: dirArg,
        });
        process.exit(1);
      }
      const perRepoResults: PerRepoInput[] = [];
      for (const entry of entries) {
        const repoDir = join(dirArg, entry);
        // Only descend into subdirectories (each a repo).
        try {
          if (!st(repoDir).isDirectory()) continue;
        } catch {
          continue;
        }
        const input = readPerRepoAudit(repoDir, entry);
        if (input) perRepoResults.push(input);
      }
      // Load standards for future standards-aware normalization.
      const cliDirR = dirname(fileURLToPath(import.meta.url));
      const skillRootR =
        cliDirR.endsWith('/dist') || cliDirR.endsWith('\\dist')
          ? dirname(cliDirR)
          : cliDirR;
      const standardsPathR = join(skillRootR, 'references', 'standards.toml');
      let standardsR: Record<string, unknown> = {};
      try {
        standardsR = loadStandards(standardsPathR);
      } catch {
        // Standards are optional for rollup — compute without weighting.
      }
      printJson(orgRollup(perRepoResults, standardsR));
      break;
    }

    case 'progress': {
      const elapsedStr = arg1;
      const doneStr = arg2;
      const [, , , , , totalStr] = process.argv;
      if (!elapsedStr || !doneStr || !totalStr) {
        printJson({
          error: 'progress requires <elapsed_seconds> <done> <total>',
        });
        process.exit(1);
      }
      const elapsed_seconds = Number(elapsedStr);
      const done = Number(doneStr);
      const total = Number(totalStr);
      if (isNaN(elapsed_seconds) || isNaN(done) || isNaN(total)) {
        printJson({
          error: 'progress: all arguments must be numbers',
        });
        process.exit(1);
      }
      printJson(progress({ elapsed_seconds, done, total }));
      break;
    }

    case 'render': {
      // Render an aggregated audit JSON → report.md or report.html.
      //
      // Usage:
      //   node dist/cli.js render <audit.json> --format md
      //   node dist/cli.js render <audit.json> --format html
      //
      // The audit JSON is the single source of truth (produced by SKILL.md
      // Step 6). The renderer is pure and deterministic — no clocks, no LLM.
      const auditPath = arg1;
      if (!auditPath) {
        printJson({
          error: 'render requires <audit.json>',
          usage: 'node dist/cli.js render <audit.json> --format md|html',
        });
        process.exit(1);
      }
      // Parse --format flag from remaining argv
      const remainingArgs = process.argv.slice(4);
      const fmtIdx = remainingArgs.indexOf('--format');
      const format = fmtIdx !== -1 ? remainingArgs[fmtIdx + 1] : 'md';
      if (format !== 'md' && format !== 'html' && format !== 'both') {
        printJson({
          error: `render --format must be "md", "html", or "both", got "${format}"`,
        });
        process.exit(1);
      }
      // `--format both` writes report.md + report.html into --out-dir in one
      // process (single spawn instead of two). Single-format modes keep writing
      // to stdout for back-compat.
      const outDirIdx = remainingArgs.indexOf('--out-dir');
      const outDirArg =
        outDirIdx !== -1 ? remainingArgs[outDirIdx + 1] : undefined;
      if (format === 'both' && !outDirArg) {
        printJson({
          error: 'render --format both requires --out-dir <dir>',
          usage:
            'node dist/cli.js render <audit.json> --format both --out-dir <dir>',
        });
        process.exit(1);
      }
      let rawAudit: string;
      try {
        rawAudit = readFileSync(auditPath, 'utf8');
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        printJson({
          error: `cannot read audit JSON: ${e.message}`,
          path: auditPath,
        });
        process.exit(1);
      }
      let audit: AuditJson;
      try {
        audit = JSON.parse(rawAudit) as AuditJson;
      } catch (err: unknown) {
        const e = err as Error;
        printJson({
          error: `audit JSON is not valid JSON: ${e.message}`,
          path: auditPath,
        });
        process.exit(1);
      }
      if (format === 'both') {
        const dir = outDirArg as string;
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'report.md'), renderMarkdown(audit) + '\n');
        writeFileSync(join(dir, 'report.html'), renderHtml(audit) + '\n');
        printJson({
          rendered: ['report.md', 'report.html'],
          out_dir: dir,
        });
        break;
      }
      const output =
        format === 'html' ? renderHtml(audit) : renderMarkdown(audit);
      process.stdout.write(output + '\n');
      break;
    }

    case 'audit-core': {
      // Deterministic single-pass audit: runs every detected/computed category
      // and writes <out>/<dimension>.json + <out>/audit.json. Judgment categories
      // are emitted as PENDING_JUDGMENT; connector metrics SKIP without a connector.
      const repoPath = arg1;
      const outDir = arg2;
      if (!repoPath || !outDir) {
        printJson({ error: 'audit-core requires <repoPath> <outDir>' });
        process.exit(1);
      }
      const standardsPath = join(
        resolveSkillRoot(),
        'references',
        'standards.toml'
      );
      const summary = await auditCore(
        repoPath,
        outDir,
        DETECTORS,
        METRICS,
        standardsPath
      );
      printJson(summary);
      break;
    }

    case 'enrich': {
      // Re-score a completed audit against the already-populated collected/ dir,
      // in ONE pass. After the orchestrator fetches connectors and writes
      // collected/<source>.json, `enrich` re-runs every detector+metric reading
      // those artifacts (connector metrics now score instead of SKIP) and
      // rewrites the per-dimension JSON + audit.json — replacing the old loop of
      // one `node metric <id>` spawn per connector metric. Judgment checks are
      // (re)emitted as PENDING_JUDGMENT, so run enrich BEFORE the judgment patch.
      const repoPath = arg1;
      const outDir = arg2;
      if (!repoPath || !outDir) {
        printJson({ error: 'enrich requires <repoPath> <outDir>' });
        process.exit(1);
      }
      const standardsPath = join(
        resolveSkillRoot(),
        'references',
        'standards.toml'
      );
      const summary = await auditCore(
        repoPath,
        outDir,
        DETECTORS,
        METRICS,
        standardsPath,
        join(outDir, 'collected')
      );
      printJson(summary);
      break;
    }

    case 'aggregate': {
      // Re-sum audit.json from the per-dimension files after judgment/connector
      // patches. Preserves authored report blocks; run before render.
      const dir = arg1;
      if (!dir) {
        printJson({ error: 'aggregate requires <auditsDir>' });
        process.exit(1);
      }
      aggregate(dir);
      printJson({ aggregated: dir });
      break;
    }

    default: {
      printJson({
        error: `unknown command "${command}"`,
        usage:
          'collect|detect|metric|standards|progress|rollup|render|aggregate|audit-core <arg> [repoPath]',
      });
      process.exit(1);
    }
  }
}

// Only run as CLI entry point — skip when imported as a module (e.g. by tests).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    // When bundled as dist/cli.js the resolved path is the bundle itself.
    process.argv[1].endsWith('/dist/cli.js') ||
    process.argv[1].endsWith('\\dist\\cli.js'));

if (isMain) {
  main().catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
  });
}
