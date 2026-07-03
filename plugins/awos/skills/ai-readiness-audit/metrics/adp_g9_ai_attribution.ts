/**
 * adp_g9_ai_attribution — AI-attributed change share (lower bound).
 *
 * kind: "computed"
 * value: ai_marked_commits / total_commits (fraction 0–1), or null when no commits
 * categories_awarded: [901] when data is available
 * reliability_default: "minimal" — always a lower bound: attribution markers
 *   (Co-authored-by: Claude, Co-authored-by: assistant, Co-authored-by: claude@anthropic)
 *   are easily omitted or disabled; true AI-assisted share >= shown value.
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: ai_marked_commits (number), total_commits (number)
 *
 * SKIP: if git.json is absent or total_commits is 0.
 */
import {
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import { clamp01 } from './_score.ts';

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return skipMetric(
      'adp_g9_ai_attribution',
      'computed',
      'minimal',
      'git',
      read.error
    );
  }

  const artifact = read.artifact;
  const raw = artifact?.raw;
  if (
    !raw ||
    typeof raw.total_commits !== 'number' ||
    raw.total_commits === 0
  ) {
    return skipMetric('adp_g9_ai_attribution', 'computed', 'minimal', 'git');
  }

  const totalCommits: number = raw.total_commits;
  const aiMarkedCommits: number = raw.ai_marked_commits ?? 0;
  const attributionRate = aiMarkedCommits / totalCommits;

  // Reliability is "minimal" — lower bound: attribution markers are easily
  // omitted or disabled by developers or AI tools. True AI-assisted share
  // is >= the measured value.
  const reliability = computeReliability('minimal', ['git'], []);

  const expression = `${aiMarkedCommits}/${totalCommits} commits with AI markers = ${(attributionRate * 100).toFixed(1)}% (lower bound)`;
  return makeMetricResult(
    'adp_g9_ai_attribution',
    attributionRate,
    'computed',
    [901],
    reliability,
    ['git'],
    [],
    { expression, score: clamp01(attributionRate), confidence: 1.0 }
  );
}
