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
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------
import { collect as collectGit } from './collectors/git.ts';
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

import { makeResult, type DetectorResult } from './detectors/_base.ts';

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
import { compute as computeG10 } from './metrics/adp_g10_complexity.ts';
import { compute as computeG11 } from './metrics/adp_g11_scale.ts';
import { compute as computeG12 } from './metrics/adp_g12_deps.ts';
// Adding a metric module is a one-line change per import + one entry in METRICS below.

import type { MetricResult } from './metrics/_base.ts';
import { loadStandards } from './metrics/_base.ts';

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
  adp_g10_complexity: computeG10,
  adp_g11_scale: computeG11,
  adp_g12_deps: computeG12,
};

// ---------------------------------------------------------------------------
// Default period
// ---------------------------------------------------------------------------
// TODO: accept period from a CLI flag or env var (e.g. AWOS_PERIOD_JSON) so
// the orchestrator can pass real values.  For now the orchestrator runs with
// this default and overrides values via the collector's own defaults.
import type { Period } from './collectors/_base.ts';

const DEFAULT_PERIOD: Period = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

async function main(): Promise<void> {
  const [, , command, arg1, arg2] = process.argv;

  if (!command) {
    printJson({
      error: 'no command given',
      usage: 'collect|detect|metric <arg> <repoPath>',
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
      printJson(fn(repoPath, DEFAULT_PERIOD));
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
        const gitArtifact = collectGit(repoPath, DEFAULT_PERIOD);
        writeArtifact(gitArtifact as { source: string }, collectedDir);
        // CI collector is run for ADP-C* metrics.
        if (id.startsWith('adp_c')) {
          const ciArtifact = collectCi(repoPath, DEFAULT_PERIOD);
          writeArtifact(ciArtifact as { source: string }, collectedDir);
        }
        // Docs collector is run for ADP-D* metrics.
        if (id.startsWith('adp_d')) {
          const docsArtifact = collectDocs(repoPath, DEFAULT_PERIOD);
          writeArtifact(docsArtifact as { source: string }, collectedDir);
        }
        // Tracker collector is run for ADP-I* metrics (also git for MTTR proxy).
        if (id.startsWith('adp_i')) {
          const trackerArtifact = collectTracker(repoPath, DEFAULT_PERIOD);
          writeArtifact(trackerArtifact as { source: string }, collectedDir);
        }
      }

      // Load standards for category award.
      // import.meta.url resolves to dist/cli.js when bundled, so go one level
      // up from dirname to reach the skill root where references/ lives.
      const cliDir = dirname(fileURLToPath(import.meta.url));
      // When running from source (tsx), cliDir is the skill root itself.
      // When bundled (dist/cli.js), cliDir is dist/ — one level below the skill root.
      const skillRoot =
        cliDir.endsWith('/dist') || cliDir.endsWith('\\dist')
          ? dirname(cliDir)
          : cliDir;
      const standardsPath = join(skillRoot, 'references', 'standards.toml');
      const standards = loadStandards(standardsPath);
      // Await in case the metric is async (e.g. adp_g10_complexity uses wasm init).
      const result = await metricFn(collectedDir, standards, {}, repoPath);
      printJson(result);
      break;
    }

    default: {
      printJson({
        error: `unknown command "${command}"`,
        usage: 'collect|detect|metric|standards <arg> [repoPath]',
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
