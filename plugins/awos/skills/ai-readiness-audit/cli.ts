#!/usr/bin/env node
/**
 * cli.ts — single CLI dispatcher for the ai-readiness-audit engine.
 *
 * Bundled by build-engine.mjs → dist/cli.js (all imports inlined, no external deps).
 *
 * Usage:
 *   node dist/cli.js collect   <source>           <repoPath>
 *   node dist/cli.js detect    <code>             <repoPath>
 *   node dist/cli.js metric    <id>               <repoPath>
 *   node dist/cli.js standards <path-to-toml>
 */

// ---------------------------------------------------------------------------
// Standards parser (smol-toml — bundled, no Python required)
// ---------------------------------------------------------------------------
import { parse as parseToml } from 'smol-toml';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------
import { collect as collectGit } from './collectors/git.ts';
import { collect as collectCi } from './collectors/ci.ts';
import { collect as collectTracker } from './collectors/tracker.ts';
import { collect as collectDocs } from './collectors/docs.ts';

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

function main(): void {
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
      // No metric modules exist yet.  Print a clear error and exit non-zero.
      // TODO: wire metric modules here when they land.
      const id = arg1;
      printJson({
        error: `unknown metric "${id ?? '(none)'}"`,
        status: 'ERROR',
        note: 'metric modules are not yet implemented; they will be wired here when they land',
      });
      process.exit(1);
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
// fileURLToPath is safe to call here because cli.ts always runs under Node/tsx.
import { fileURLToPath } from 'node:url';

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    // When bundled as dist/cli.js the resolved path is the bundle itself.
    process.argv[1].endsWith('/dist/cli.js') ||
    process.argv[1].endsWith('\\dist\\cli.js'));

if (isMain) {
  main();
}
