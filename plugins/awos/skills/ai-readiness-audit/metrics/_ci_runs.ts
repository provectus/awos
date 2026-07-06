/**
 * _ci_runs — cross-provider CI run-conclusion classification.
 *
 * Pass rate must be computed over runs that reached a VERDICT on the code.
 * Observed in the wild: a chatty trigger workflow ("Trigger Preview Destroy",
 * 1-second runs whose job-level `if:` almost never fires) filled 456 of 500
 * fetched runs with conclusion "skipped" — the naive successes/total rate
 * reported 7.6% "low" for a repo whose decided runs pass at 86%. Skipped and
 * cancelled runs never built or tested anything; counting them as failures
 * misreports CI health, and their ~1 s durations equally poison the average
 * pipeline duration.
 *
 * Conclusions are normalized (trim/lowercase) and matched against the union
 * of the major providers' vocabularies — GitHub Actions, GitLab, Jenkins,
 * CircleCI, Travis, Buildkite, Azure Pipelines — so the classification is
 * provider-agnostic, not fitted to any one team's stack:
 *   passed     — the pipeline ran and succeeded
 *   failed     — the pipeline ran and did not succeed (incl. timeouts,
 *                startup/config failures, Jenkins UNSTABLE, Azure
 *                partiallySucceeded: all block delivery)
 *   indecisive — no verdict on the code: condition not met (skipped),
 *                superseded/stopped (cancelled/aborted), awaiting gate
 *                (manual/blocked/action_required), or still running
 * Unrecognized conclusions count as indecisive but are tracked separately so
 * the metrics can disclose them instead of silently dropping data.
 */

const PASS_CONCLUSIONS = new Set(['success', 'succeeded', 'passed', 'pass']);

const FAIL_CONCLUSIONS = new Set([
  'failure',
  'failed',
  'fail',
  'error',
  'errored',
  'unstable',
  'timed_out',
  'timedout',
  'startup_failure',
  'infrastructure_failure',
  'partially_succeeded',
  'partiallysucceeded',
]);

const INDECISIVE_CONCLUSIONS = new Set([
  'skipped',
  'cancelled',
  'canceled',
  'aborted',
  'neutral',
  'manual',
  'blocked',
  'not_built',
  'notbuilt',
  'action_required',
  'stale',
  'expired',
  'unauthorized',
  // not-finished statuses that some connectors emit as conclusions
  'in_progress',
  'queued',
  'pending',
  'running',
  'waiting',
  'waiting_for_resource',
  'created',
  'preparing',
  'scheduled',
  '', // missing/null conclusion (run not finished)
]);

export type RunVerdict = 'passed' | 'failed' | 'indecisive';

/**
 * Best-effort creation timestamp of a raw run record, across the field names
 * the sanctioned connectors emit (gh: createdAt; snake_case APIs: created_at;
 * fallbacks: startedAt/started_at, updatedAt/updated_at). Used to clamp the
 * fetched run history to the audit window.
 */
export function runTimestamp(r: unknown): unknown {
  const rec = (r ?? {}) as Record<string, unknown>;
  return (
    rec['createdAt'] ??
    rec['created_at'] ??
    rec['startedAt'] ??
    rec['started_at'] ??
    rec['updatedAt'] ??
    rec['updated_at']
  );
}

export interface RunPartition {
  /** Runs whose durations/verdicts are meaningful: passed + failed. */
  decided: unknown[];
  passed: number;
  failed: number;
  total: number;
  /** Normalized conclusion → count for every excluded (indecisive) run. */
  excluded: Map<string, number>;
  /** Distinct conclusions not in any known vocabulary (subset of excluded). */
  unknown: string[];
}

/** Classify one normalized conclusion string. */
export function classifyConclusion(conclusion: unknown): RunVerdict {
  const c = String(conclusion ?? '')
    .trim()
    .toLowerCase();
  if (PASS_CONCLUSIONS.has(c)) return 'passed';
  if (FAIL_CONCLUSIONS.has(c)) return 'failed';
  return 'indecisive';
}

/** Partition raw run records into decided (passed/failed) vs excluded. */
export function partitionRuns(runs: unknown[]): RunPartition {
  const decided: unknown[] = [];
  let passed = 0;
  let failed = 0;
  const excluded = new Map<string, number>();
  const unknown = new Set<string>();
  for (const r of runs) {
    const rec = (r ?? {}) as Record<string, unknown>;
    const norm = String(rec['conclusion'] ?? '')
      .trim()
      .toLowerCase();
    const verdict = classifyConclusion(norm);
    if (verdict === 'passed') {
      passed++;
      decided.push(r);
    } else if (verdict === 'failed') {
      failed++;
      decided.push(r);
    } else {
      const label = norm === '' ? 'no conclusion' : norm;
      excluded.set(label, (excluded.get(label) ?? 0) + 1);
      if (norm !== '' && !INDECISIVE_CONCLUSIONS.has(norm)) unknown.add(norm);
    }
  }
  return {
    decided,
    passed,
    failed,
    total: runs.length,
    excluded,
    unknown: [...unknown].sort(),
  };
}

/** "456 skipped, 6 cancelled" — largest bucket first, for evidence strings. */
export function describeExcluded(p: RunPartition): string {
  return [...p.excluded.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${n} ${label}`)
    .join(', ');
}
