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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
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
  // Code 106: spec-driven adoption signals — context/spec, context/, or .awos/
  { paths: ['context/spec', 'context', '.awos'], code: 106 },
];

// All defined tooling category codes for coverage denominator.
const ALL_CODES = TOOLING_MAP.map((e) => e.code);

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
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

  const artifact = JSON.parse(readFileSync(gitPath, 'utf8'));
  const raw = artifact?.raw;
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

  // Determine which category codes are present.
  const awarded: number[] = [];
  for (const entry of TOOLING_MAP) {
    const present = entry.paths.some((p) =>
      toolingPaths.some((tp) => tp === p || tp.startsWith(p.replace(/\/$/, '')))
    );
    if (present) {
      awarded.push(entry.code);
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
    undefined,
    expression
  );
}
