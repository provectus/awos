/**
 * progress.ts — pure progress/ETA helper for the ai-readiness-audit engine.
 *
 * Wall-clock UX helper only — not a scored metric.
 * The caller subtracts any user-wait time before passing elapsed_seconds
 * so this function is fully deterministic and testable.
 */

export interface ProgressInput {
  /** Wall-clock seconds elapsed (caller excludes user-wait time). */
  elapsed_seconds: number;
  /** Number of dimensions completed so far. */
  done: number;
  /** Total number of dimensions to run. */
  total: number;
}

export interface ProgressResult {
  /** Fraction complete: done/total (0–1). Always 0 when total is 0. */
  pct: number;
  /**
   * Estimated seconds remaining.
   * null  → not enough data yet (done === 0).
   * 0     → all done (done === total).
   * >0    → projected time remaining based on current pace.
   */
  eta_seconds: number | null;
  /** Echo of the caller-supplied elapsed_seconds. */
  elapsed_seconds: number;
}

/**
 * Compute progress percentage and ETA from elapsed time and work counts.
 *
 * @param input.elapsed_seconds - Seconds elapsed (user-wait excluded by caller)
 * @param input.done            - Dimensions finished
 * @param input.total           - Total dimensions
 */
export function progress(input: ProgressInput): ProgressResult {
  const { elapsed_seconds, done, total } = input;

  const pct = total > 0 ? done / total : 0;

  let eta_seconds: number | null;
  if (done === 0) {
    eta_seconds = null;
  } else if (done >= total) {
    eta_seconds = 0;
  } else {
    // pace: seconds per dimension → project remaining dimensions
    eta_seconds = (elapsed_seconds / done) * (total - done);
  }

  return { pct, eta_seconds, elapsed_seconds };
}
