import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeArtifact, type Period } from './_base.ts';

// ---------------------------------------------------------------------------
// CI config detection
// ---------------------------------------------------------------------------

/** Paths that indicate a CI configuration file or directory in the repo. */
const CI_CONFIG_CANDIDATES = [
  '.github/workflows',
  '.gitlab-ci.yml',
  'Jenkinsfile',
];

function detectCiConfig(repoPath: string): string | null {
  for (const candidate of CI_CONFIG_CANDIDATES) {
    if (existsSync(join(repoPath, candidate))) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Connector shape
// ---------------------------------------------------------------------------

/** Minimal connector surface. Callers may pass an object fetched from a CI
 *  API. The `runs` array holds pipeline run records (shape is opaque to this
 *  collector). */
export interface CiConnector {
  runs?: unknown[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Raw shape
// ---------------------------------------------------------------------------

export interface CiRaw {
  /** True when a CI config file/directory was found in the repo. */
  config_detected: boolean;
  /** Path of the detected config (relative to repoPath), or null. */
  config_path: string | null;
  /** Run records from the connector, or empty when the connector supplied
   *  no run data (partial state — downgraded reliability, never SKIP). */
  runs: unknown[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect CI data for a repository.
 *
 * Availability rules:
 * - `available=false` + `reason_if_absent` when neither a local CI config nor
 *   a connector is present.
 * - `available=true` when either condition is met. Config-present-but-no-runs
 *   is partial data (downgraded reliability downstream), not an absence.
 */
export function collect(
  repoPath: string,
  period: Period,
  connector?: CiConnector
) {
  const configPath = detectCiConfig(repoPath);
  const hasConfig = configPath !== null;
  const hasConnector = connector !== undefined && connector !== null;

  if (!hasConfig && !hasConnector) {
    return makeArtifact(
      'ci',
      false,
      'no CI config (.github/workflows, .gitlab-ci.yml, Jenkinsfile) or connector found',
      { ...period, history_available_days: period.history_available_days },
      {} as CiRaw
    );
  }

  const runs: unknown[] = connector?.runs ?? [];

  const raw: CiRaw = {
    config_detected: hasConfig,
    config_path: configPath,
    runs,
  };

  return makeArtifact('ci', true, null, period, raw);
}
