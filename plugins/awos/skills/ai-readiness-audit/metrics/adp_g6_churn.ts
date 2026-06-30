/**
 * adp_g6_churn — Code churn metric.
 *
 * kind: "computed"
 * value: total churn (insertions + deletions) across all history in numstat_totals
 * categories_awarded: [601] when data is available
 * reliability_default: "not-reliable" (raw churn total across all history;
 *   direction without context — large insertions might indicate healthy growth
 *   or uncontrolled sprawl; useful as a relative trend, not an absolute signal)
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: numstat_totals ({ added: number; deleted: number })
 *
 * SKIP: if git.json is absent or numstat_totals is missing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g6_churn',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const artifact = JSON.parse(readFileSync(gitPath, 'utf8'));
  const raw = artifact?.raw;
  if (
    !raw ||
    typeof raw.numstat_totals !== 'object' ||
    raw.numstat_totals === null
  ) {
    return makeMetricResult(
      'adp_g6_churn',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const { added, deleted } = raw.numstat_totals as {
    added: number;
    deleted: number;
  };
  const totalChurn = (added ?? 0) + (deleted ?? 0);

  const reliability = computeReliability('not-reliable', ['git'], []);

  const expression = `${added} added + ${deleted} deleted = ${totalChurn} total churn lines`;
  return makeMetricResult(
    'adp_g6_churn',
    totalChurn,
    'computed',
    [601],
    reliability,
    ['git'],
    [],
    null,
    undefined,
    expression,
    1.0,
    1.0
  );
}
