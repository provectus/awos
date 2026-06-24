#!/usr/bin/env node
/**
 * cli.ts — single CLI dispatcher for the ai-readiness-audit engine.
 *
 * Bundled by build-engine.mjs → dist/cli.js (all imports inlined, no external deps).
 *
 * Usage:
 *   node dist/cli.js collect <source> <repoPath>
 *   node dist/cli.js detect  <code>   <repoPath>
 *   node dist/cli.js metric  <id>     <repoPath>
 */

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
// TODO: when additional detector modules land (e.g. B.7 dimensions), add one
// import line per module and spread it into DETECTORS below:
//   import { DETECTORS as FOO_DETECTORS } from './detectors/foo.ts';
//
// Adding a detector module is a one-line change per import + one spread below.

import { makeResult, type DetectorResult } from './detectors/_base.ts';

const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => DetectorResult
> = {
  ...SBP_DETECTORS,
  ...CODE_ARCH_DETECTORS,
  ...SDD_DETECTORS,
  // ...FOO_DETECTORS,  // ← template for future modules
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
        usage: 'collect|detect|metric <arg> <repoPath>',
      });
      process.exit(1);
    }
  }
}

main();
