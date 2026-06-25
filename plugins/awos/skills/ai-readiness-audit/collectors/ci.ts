import { makeArtifact, type Period } from './_base.ts';
import { detectCiConfigPath } from '../ci_platforms.ts';

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
  const configPath = detectCiConfigPath(repoPath);
  const hasConfig = configPath !== null;
  const hasConnector = connector !== undefined && connector !== null;

  if (!hasConfig && !hasConnector) {
    return makeArtifact(
      'ci',
      false,
      'no CI config (GitHub Actions, GitLab, Jenkins, CircleCI, Azure Pipelines, Buildkite, Drone, TeamCity, Travis, Bitbucket) or connector found',
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
