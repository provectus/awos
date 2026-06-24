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
 *   CLAUDE.md or AGENTS.md  → 101
 *   .claude/skills           → 102
 *   .claude/commands         → 103
 *   .claude/hooks            → 104
 *   .mcp.json                → 105
 *   spec signals (context/,
 *     .awos/, or scripts/)   → 106 (inferred from tooling_paths)
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

// Tooling path → category code mapping.
// Order matters only for readability; all are checked independently.
const TOOLING_MAP: Array<{ paths: string[]; code: number }> = [
  { paths: ['CLAUDE.md', 'AGENTS.md'], code: 101 },
  { paths: ['.claude/skills'], code: 102 },
  { paths: ['.claude/commands'], code: 103 },
  { paths: ['.claude/hooks'], code: 104 },
  { paths: ['.mcp.json'], code: 105 },
  // Code 106: spec signals — context/, .awos/, or scripts/ in tooling_paths
  // (git collector does not include these but we detect them via the paths list)
  {
    paths: ['context/', '.awos/', 'scripts/', 'context', '.awos', 'scripts'],
    code: 106,
  },
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

  return makeMetricResult(
    'adp_g1_tooling_depth',
    coverage,
    'coverage',
    awarded,
    reliability,
    ['git'],
    []
  );
}
