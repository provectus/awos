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
    if (existsSync(join(repoPath, candidate))) return candidate;
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
 * True when a repo-relative path lives inside a known CI directory. Handles both
 * POSIX and Windows path separators so it works on `relative()` output anywhere.
 */
export function isCiWorkflowPath(rel: string): boolean {
  return CI_DIRS.some(
    (dir) => rel.startsWith(`${dir}/`) || rel.startsWith(`${dir}\\`)
  );
}
