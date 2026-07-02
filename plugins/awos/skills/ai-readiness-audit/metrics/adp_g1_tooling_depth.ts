/**
 * adp_g1_tooling_depth — AI tooling coverage metric.
 *
 * kind: "coverage"
 * value: fraction of defined tooling categories that are present (0–1)
 * categories_awarded: codes for each present tooling layer (101–106)
 * reliability: maximal (presence check, bounded above)
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: tooling_paths (string[])
 *
 * Category mapping (tooling_paths → category codes):
 *   101 → ANY instruction file (CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules, …)
 *   102 → ANY skill directory (.claude/skills, …)
 *   103 → ANY rule/command directory (.claude/commands, .cursor/rules, …)
 *   104 → ANY hook path (.claude/hooks, .kiro/hooks, …)
 *   105 → ANY MCP config path (.mcp.json, .cursor/mcp.json, .kiro/settings/mcp.json, …)
 *   106 → spec-driven signals (context/spec, context/, .awos/)
 *
 * SKIP: if git.json is absent or tooling_paths is missing.
 */
import {
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipReliability,
  type MetricResult,
} from './_base.ts';
import {
  ALL_INSTRUCTION_FILES,
  ALL_SKILL_DIRS,
  ALL_RULE_COMMAND_DIRS,
  ALL_HOOK_PATHS,
  ALL_MCP_CONFIG_PATHS,
} from '../agent_tools.ts';

// Tooling path → category code mapping built from the tool registry.
// Code 106 (spec-driven adoption: context/spec, context/, .awos/) is defined
// inline — these paths are AWOS-specific and not in the agent-tools registry.
const TOOLING_MAP: Array<{ paths: string[]; code: number }> = [
  { paths: ALL_INSTRUCTION_FILES, code: 101 },
  { paths: ALL_SKILL_DIRS, code: 102 },
  { paths: ALL_RULE_COMMAND_DIRS, code: 103 },
  { paths: ALL_HOOK_PATHS, code: 104 },
  { paths: ALL_MCP_CONFIG_PATHS, code: 105 },
  // Code 106: spec-driven adoption signals — real spec-workspace content only.
  // A bare context/ is excluded: the audit itself creates context/audits/.
  { paths: ['context/spec', 'context/product', '.awos'], code: 106 },
];

// All defined tooling category codes for coverage denominator.
const ALL_CODES = TOOLING_MAP.map((e) => e.code);

// Human-readable label for each tooling layer — used in per-code evidence strings.
const LAYER_LABELS: Record<number, string> = {
  101: 'AI instruction file (CLAUDE.md / AGENTS.md / GEMINI.md / .cursorrules)',
  102: 'skill directory (.claude/skills or equivalent)',
  103: 'command/rule directory (.claude/commands or equivalent)',
  104: 'hook directory (.claude/hooks or equivalent)',
  105: 'MCP config (.mcp.json or equivalent)',
  106: 'spec-driven signals (context/spec or .awos/)',
};

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return makeMetricResult(
      'adp_g1_tooling_depth',
      null,
      'coverage',
      [],
      skipReliability('maximal', 'git', read.error),
      [],
      ['git']
    );
  }

  const raw = read.artifact?.raw;
  if (!raw || !Array.isArray(raw.tooling_paths)) {
    return makeMetricResult(
      'adp_g1_tooling_depth',
      null,
      'coverage',
      [],
      computeReliability('maximal', [], ['git']),
      [],
      ['git']
    );
  }

  const toolingPaths: string[] = raw.tooling_paths;

  // Determine which category codes are present and build per-code evidence.
  const awarded: number[] = [];
  const evidencePerCode: Record<number, string[]> = {};
  for (const entry of TOOLING_MAP) {
    // Path-boundary match: a registry path matches only itself or paths nested
    // under it ("<p>/..."), never a sibling sharing the prefix (".awos" must
    // not match ".awos-legacy").
    const present = entry.paths.some((p) => {
      const base = p.replace(/\/$/, '');
      return toolingPaths.some(
        (tp) => tp === base || tp.startsWith(base + '/')
      );
    });
    const label = LAYER_LABELS[entry.code] ?? `layer ${entry.code}`;
    if (present) {
      awarded.push(entry.code);
      evidencePerCode[entry.code] = [`layer present: ${label}`];
    } else {
      evidencePerCode[entry.code] = [`layer absent: ${label}`];
    }
  }

  const coverage = ALL_CODES.length > 0 ? awarded.length / ALL_CODES.length : 0;

  const reliability = computeReliability('maximal', ['git'], []);

  const expression = `${awarded.length}/${ALL_CODES.length} tooling layers present = ${(coverage * 100).toFixed(0)}%`;
  return makeMetricResult(
    'adp_g1_tooling_depth',
    coverage,
    'coverage',
    awarded,
    reliability,
    ['git'],
    [],
    null,
    undefined,
    expression,
    undefined,
    undefined,
    undefined,
    evidencePerCode
  );
}
