/**
 * adp_g15_onboarding_ease — onboarding enabler presence (proxy for DX Core 4 time-to-10th-PR).
 *
 * DX Core 4 definition: "Time to 10th PR — the average time it takes a new engineer to merge
 * their 10th pull request. Reflects onboarding ramp-up speed and effectiveness of developer
 * enablement." (GetDX, 2024 — https://getdx.com/blog/software-development-metrics/)
 *
 * This metric measures ENABLER PRESENCE as a deterministic, always-available proxy for that
 * outcome. The median first-commit-to-first-merge ramp-time component described in the task
 * brief is intentionally omitted: it is noisy, overlaps lead-time (adp_g4) / review rework
 * (adp_g8), and is not reliably available. Enabler presence is the stable, filesystem-only
 * signal.
 *
 * Four boolean enabler signals (each worth 0.25 of the value):
 *
 *   1. README setup steps — README.md / README / readme.md contains a recognizable
 *      setup/install/getting-started/usage/quickstart heading OR a common bootstrap command
 *      (npm install, yarn, pnpm install, make, docker compose/docker-compose, pip install,
 *      poetry install, ./gradlew, bundle install, go build/go run, cargo build, uv sync).
 *
 *   2. Agent context file — topology['has_agent_instruction_files'] is truthy; or CLAUDE.md
 *      or AGENTS.md is present at the repo root. Reflects AI-agent-first onboarding support.
 *
 *   3. .env example — .env.example, .env.sample, .env.template, or .env.dist is present.
 *      Prevents "it works on my machine" environment-variable friction.
 *
 *   4. One-command bootstrap — Makefile, makefile, justfile, Justfile, Taskfile.yml/.yaml,
 *      docker-compose.yml/.yaml, compose.yml, or scripts/setup.sh / scripts/bootstrap.sh /
 *      setup.sh / bootstrap.sh is present; or package.json whose scripts contains "setup",
 *      "bootstrap", or "dev".
 *
 * value = present_count / 4  (0..1)
 * band  = 'good' (≥0.75) / 'watch' (≥0.5) / 'concerning' (<0.5)
 * score = clamp01(bandScore(value, ANCHORS, 'linear')) — higher = better
 *
 * Awards code 1501. reliability "minimal" (lower-bound filesystem signal only).
 *
 * SKIP only when repoPath does not exist. A repo with 0 enablers yields value 0 /
 * band "concerning" / status OK — never SKIP for a missing enabler.
 *
 * Band thresholds (AWOS heuristics — no published DX Core 4 numeric targets):
 *   ≥0.75 → good        (3–4 enablers present)
 *   ≥0.50 → watch       (2 enablers present)
 *    <0.50 → concerning  (0–1 enabler present)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

// ---------------------------------------------------------------------------
// Band anchors (linear piecewise, increasing — higher enabler count → higher score)
// ---------------------------------------------------------------------------

const ANCHORS = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 0.75, y: 0.8 },
  { x: 1, y: 1 },
];

/** AWOS heuristic band label (no published DX Core 4 thresholds). */
function onboardingBand(value: number): string {
  if (value >= 0.75) return 'good';
  if (value >= 0.5) return 'watch';
  return 'concerning';
}

// ---------------------------------------------------------------------------
// Signal 1 helpers — README detection
// ---------------------------------------------------------------------------

const README_NAMES = ['README.md', 'README', 'readme.md'];

/** Heading keywords that indicate setup guidance. */
const SETUP_HEADING_RE =
  /#{1,6}\s*(setup|install(?:ation)?|getting[- ]started|usage|quick[- ]?start)/i;

/** Bootstrap command patterns (case-insensitive). */
const BOOTSTRAP_CMD_RE =
  /npm install|yarn(?:\s|$)|pnpm install|(?<!\w)make(?!\w)|docker[\s-]compose|pip install|poetry install|\.\/gradlew|bundle install|go build|go run|cargo build|uv sync/i;

/** Max README bytes to read (guard against oversized files). */
const MAX_README_BYTES = 64 * 1024; // 64 KiB

function hasReadmeSetupSteps(repoPath: string): boolean {
  for (const name of README_NAMES) {
    const p = join(repoPath, name);
    if (!existsSync(p)) continue;
    let content: string;
    try {
      const buf = readFileSync(p);
      if (buf.length > MAX_README_BYTES) {
        // Only scan the first 64 KiB
        content = buf.subarray(0, MAX_README_BYTES).toString('utf8');
      } else {
        content = buf.toString('utf8');
      }
    } catch {
      continue;
    }
    if (SETUP_HEADING_RE.test(content) || BOOTSTRAP_CMD_RE.test(content)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Signal 2 helpers — agent context file
// ---------------------------------------------------------------------------

const AGENT_CONTEXT_FILES = ['CLAUDE.md', 'AGENTS.md'];

function hasAgentContext(
  repoPath: string,
  topology: Record<string, boolean>
): boolean {
  if (topology['has_agent_instruction_files']) return true;
  return AGENT_CONTEXT_FILES.some((f) => existsSync(join(repoPath, f)));
}

// ---------------------------------------------------------------------------
// Signal 3 helpers — .env example
// ---------------------------------------------------------------------------

const ENV_EXAMPLE_FILES = [
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.dist',
];

function hasEnvExample(repoPath: string): boolean {
  return ENV_EXAMPLE_FILES.some((f) => existsSync(join(repoPath, f)));
}

// ---------------------------------------------------------------------------
// Signal 4 helpers — one-command bootstrap
// ---------------------------------------------------------------------------

const BOOTSTRAP_FILES = [
  'Makefile',
  'makefile',
  'justfile',
  'Justfile',
  'Taskfile.yml',
  'Taskfile.yaml',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'scripts/setup.sh',
  'scripts/bootstrap.sh',
  'setup.sh',
  'bootstrap.sh',
];

const BOOTSTRAP_SCRIPT_KEYS = ['setup', 'bootstrap', 'dev'];

function hasBootstrapCommand(repoPath: string): boolean {
  if (BOOTSTRAP_FILES.some((f) => existsSync(join(repoPath, f)))) return true;

  const pkgPath = join(repoPath, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<
      string,
      unknown
    >;
    const scripts = pkg['scripts'] as Record<string, unknown> | undefined;
    if (!scripts) return false;
    return BOOTSTRAP_SCRIPT_KEYS.some((k) => k in scripts);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Skip result
// ---------------------------------------------------------------------------

function makeSkip(): MetricResult {
  return skipMetric('adp_g15_onboarding_ease', 'computed', 'minimal', 'git');
}

// ---------------------------------------------------------------------------
// Main compute (sync — filesystem only)
// ---------------------------------------------------------------------------

export function compute(
  _collectedDir: string,
  _standards: Record<string, unknown>,
  topology: Record<string, boolean>,
  repoPathOverride?: string
): MetricResult {
  const repoPath = repoPathOverride ?? _collectedDir;
  if (!existsSync(repoPath)) return makeSkip();

  const signals = {
    readme: hasReadmeSetupSteps(repoPath),
    agentContext: hasAgentContext(repoPath, topology),
    envExample: hasEnvExample(repoPath),
    bootstrap: hasBootstrapCommand(repoPath),
  };

  const present = Object.values(signals).filter(Boolean).length;
  const value = present / 4;
  const band = onboardingBand(value);
  const score = clamp01(bandScore(value, ANCHORS, 'linear'));

  const enablerLabels: string[] = [];
  if (signals.readme) enablerLabels.push('README setup');
  if (signals.agentContext) enablerLabels.push('agent context');
  if (signals.envExample) enablerLabels.push('.env example');
  if (signals.bootstrap) enablerLabels.push('bootstrap');

  const expression =
    `${present}/4 onboarding enablers` +
    (enablerLabels.length > 0 ? ` (${enablerLabels.join(', ')})` : '') +
    ` = ${Math.round(value * 100)}% (${band})`;

  return makeMetricResult(
    'adp_g15_onboarding_ease',
    value,
    'computed',
    [1501],
    computeReliability('minimal', ['git'], []),
    ['git'],
    [],
    { band, unit: 'ratio', expression, score }
  );
}
