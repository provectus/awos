/**
 * ai_attribution — AI-attributed change share (lower bound).
 *
 * kind: "computed"
 * value: AI-marked commits / total commits (fraction 0–1) over the audit
 *   window — measures CURRENT attribution practice. All-history totals would
 *   let years of pre-AI commits dilute the denominator forever, making the
 *   number nearly immovable no matter how the team works today.
 * categories_awarded: [901] when data is available
 * reliability_default: "minimal" — always a lower bound: attribution markers
 *   (Co-authored-by: Claude, Co-authored-by: assistant, Co-authored-by: claude@anthropic)
 *   are easily omitted or disabled; true AI-assisted share >= shown value.
 *
 * Source shape: collectedDir/git.json
 * Input raw fields (preferred): window_stats.trunk_commits,
 *   window_stats.ai_marked_commits — the windowed, trunk-scoped counts.
 * Input raw fields (legacy fallback, pre-window artifacts only):
 *   total_commits, ai_marked_commits — all-history counts.
 *
 * SKIP: if git.json is absent or the usable commit count is 0.
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
      'ai_attribution',
      'computed',
      'minimal',
      'git',
      read.error
    );
  }

  const artifact = read.artifact;
  const raw = artifact?.raw;
  const ws = raw?.window_stats;

  // Prefer the windowed, trunk-scoped counts; fall back to the all-history
  // totals only for pre-window artifacts that lack the fields.
  const windowed = typeof ws?.trunk_commits === 'number';
  const totalCommits: number = windowed
    ? ws.trunk_commits
    : typeof raw?.total_commits === 'number'
      ? raw.total_commits
      : 0;
  if (!raw || totalCommits === 0) {
    return skipMetric('ai_attribution', 'computed', 'minimal', 'git');
  }

  const aiMarkedCommits: number =
    (windowed ? ws.ai_marked_commits : raw.ai_marked_commits) ?? 0;
  const attributionRate = aiMarkedCommits / totalCommits;

  // Reliability is "minimal" — lower bound: attribution markers are easily
  // omitted or disabled by developers or AI tools. True AI-assisted share
  // is >= the measured value.
  const reliability = computeReliability('minimal', ['git'], []);

  const windowLabel = windowed
    ? ` in the last ${ws.window_days} days`
    : ' (all history)';
  const expression = `${aiMarkedCommits}/${totalCommits} commits${windowLabel} with AI markers = ${(attributionRate * 100).toFixed(1)}% (lower bound)`;
  return makeMetricResult(
    'ai_attribution',
    attributionRate,
    'computed',
    [901],
    reliability,
    ['git'],
    [],
    { expression, score: clamp01(attributionRate), confidence: 1.0 }
  );
}
