import { makeArtifact, type Period } from './_base.ts';
import { detectCiConfigPath, ciPlatformName } from '../ci_platforms.ts';

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
  /** Run records from the connector. Non-empty only when `available=true`. */
  runs: unknown[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect CI data for a repository.
 *
 * Availability rules:
 * - `available=false` when no CI config and no connector are present.
 * - `available=false` when a CI config exists but no run history is available
 *   (config-only, or connector returned empty runs). The reason names the
 *   platform and prompts the caller to supply a CI connector.
 * - `available=true` only when actual run records are present.
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

  // Config present but no run data (no connector, or connector has no runs).
  // Detected but not connected — supply a CI connector for pipeline metrics.
  if (runs.length === 0) {
    const platform = configPath ? ciPlatformName(configPath) : 'CI';
    return makeArtifact(
      'ci',
      false,
      `${platform} config detected but no run history — supply a CI connector (e.g. Azure DevOps/GitHub Actions API) for pipeline metrics`,
      period,
      raw
    );
  }

  return makeArtifact('ci', true, null, period, raw);
}
