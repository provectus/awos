// ---------------------------------------------------------------------------
// Canonical CI/CD platform detection — single source of truth.
//
// Consumed by the CI collector (collectors/ci.ts) and the CI-related detectors
// (software_best_practices, supply_chain_security, end_to_end_delivery) so the
// recognised-platform list stays consistent instead of drifting across files.
// Detection is filename/path based (no parsing) — broadening a platform means
// adding its marker here, once.
// ---------------------------------------------------------------------------
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Directories whose presence — or whose contained workflow files — indicates a
 * CI platform. Workflow files typically live inside these (e.g. a repo has many
 * `.github/workflows/*.yml`).
 */
export const CI_DIRS = [
  '.github/workflows', // GitHub Actions
  '.circleci', // CircleCI
  '.azure-pipelines', // Azure Pipelines / Azure DevOps
  '.buildkite', // Buildkite
  '.drone', // Drone (directory variant)
  '.teamcity', // TeamCity
  '.concourse', // Concourse CI
  '.woodpecker', // Woodpecker CI (directory variant)
];

/**
 * Single-file CI configs, typically at the repo root. `.yaml` variants are
 * listed alongside `.yml` because both are valid for every YAML-based platform.
 */
export const CI_FILES = [
  '.gitlab-ci.yml', // GitLab CI
  '.gitlab-ci.yaml',
  'Jenkinsfile', // Jenkins
  'azure-pipelines.yml', // Azure Pipelines (root-file convention)
  'azure-pipelines.yaml',
  '.travis.yml', // Travis CI
  '.travis.yaml',
  'bitbucket-pipelines.yml', // Bitbucket Pipelines
  'bitbucket-pipelines.yaml',
  '.drone.yml', // Drone (single-file variant)
  '.drone.yaml',
  '.woodpecker.yml', // Woodpecker CI (single-file variants)
  '.woodpecker.yaml',
  'ci/pipeline.yml', // Concourse CI pipeline (file convention)
  'ci/pipeline.yaml',
];

/** Every candidate path (dirs + files) for a simple presence gate. */
export const CI_CONFIG_CANDIDATES = [...CI_DIRS, ...CI_FILES];

/**
 * Detect a CI configuration in the repo and return the matched path (relative),
 * or null. Checks the canonical dirs/files plus the Azure DevOps `pipelines/`
 * convention (a `pipelines/` directory containing YAML — content-gated so a
 * generic data-pipeline directory does not falsely register). This is the one
 * place "does this repo have CI?" is decided — collector gate, topology flag,
 * and the SBP detector all route through it.
 */
export function detectCiConfigPath(repoPath: string): string | null {
  for (const candidate of CI_CONFIG_CANDIDATES) {
    const full = join(repoPath, candidate);
    if (!existsSync(full)) continue;
    if (CI_DIRS.includes(candidate)) {
      // Directory candidate: require at least one file inside, so an empty
      // placeholder dir (e.g. a bare `.github/workflows/`) doesn't register as
      // CI. Any file counts — some platforms use non-YAML config (TeamCity
      // `.kts`), so we deliberately don't gate on `.yml`/`.yaml` here.
      try {
        if (readdirSync(full).length > 0) {
          return candidate;
        }
      } catch {
        /* not readable — ignore */
      }
      continue;
    }
    return candidate;
  }
  const pipelines = join(repoPath, 'pipelines');
  try {
    if (
      existsSync(pipelines) &&
      readdirSync(pipelines).some(
        (f) => f.endsWith('.yml') || f.endsWith('.yaml')
      )
    ) {
      return 'pipelines/';
    }
  } catch {
    /* not a readable directory — ignore */
  }
  return null;
}

/**
 * Return a human-readable platform name for a detected CI config path.
 * Used in user-facing messages when a config is found but no run data is present.
 */
export function ciPlatformName(configPath: string): string {
  if (configPath.startsWith('.github/workflows')) return 'GitHub Actions';
  if (configPath.startsWith('.circleci')) return 'CircleCI';
  if (
    configPath.startsWith('.azure-pipelines') ||
    configPath.startsWith('azure-pipelines.')
  )
    return 'Azure Pipelines';
  if (configPath.startsWith('.buildkite')) return 'Buildkite';
  if (configPath.startsWith('.drone')) return 'Drone';
  if (configPath.startsWith('.teamcity')) return 'TeamCity';
  if (
    configPath.startsWith('.concourse') ||
    configPath.startsWith('ci/pipeline.')
  )
    return 'Concourse CI';
  if (configPath.startsWith('.woodpecker')) return 'Woodpecker CI';
  if (configPath.startsWith('.gitlab-ci.')) return 'GitLab CI';
  if (configPath === 'Jenkinsfile') return 'Jenkins';
  if (configPath.startsWith('.travis.')) return 'Travis CI';
  if (configPath.startsWith('bitbucket-pipelines.'))
    return 'Bitbucket Pipelines';
  if (configPath.startsWith('pipelines/')) return 'Azure Pipelines';
  return 'CI';
}

/**
 * True when a repo-relative path lives inside a known CI directory. Handles both
 * POSIX and Windows path separators so it works on `relative()` output anywhere.
 */
export function isCiWorkflowPath(rel: string): boolean {
  return CI_DIRS.some(
    (dir) => rel.startsWith(`${dir}/`) || rel.startsWith(`${dir}\\`)
  );
}
