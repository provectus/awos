/**
 * Shared interpolation helpers for per-metric score computation.
 *
 * All functions are pure (no I/O) and operate on plain numbers.
 */

/**
 * Linear interpolation: map x from [x0,x1] to [y0,y1].
 * Does not clamp; caller should clamp if needed.
 */
export function linterp(
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  if (x1 === x0) return y0;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/**
 * Log-interpolation: map x from [x0,x1] (log scale) to [y0,y1] (linear scale).
 * x, x0, x1 must be > 0.
 * Useful when the underlying measurement spans multiple orders of magnitude.
 */
export function loginterp(
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  if (x <= 0 || x0 <= 0 || x1 <= 0) return y0;
  return linterp(Math.log(x), Math.log(x0), y0, Math.log(x1), y1);
}

/**
 * Piecewise interpolation over a sorted array of {x, y} anchors.
 * scale: 'linear' → linterp within each segment; 'log' → loginterp.
 * Clamps to y of the first/last anchor when x is out of range.
 */
export function bandScore(
  x: number,
  anchors: ReadonlyArray<{ x: number; y: number }>,
  scale: 'linear' | 'log' = 'linear'
): number {
  if (anchors.length === 0) return 0;
  if (x <= anchors[0].x) return anchors[0].y;
  if (x >= anchors[anchors.length - 1].x) return anchors[anchors.length - 1].y;
  for (let i = 0; i < anchors.length - 1; i++) {
    const lo = anchors[i],
      hi = anchors[i + 1];
    if (x >= lo.x && x <= hi.x) {
      return scale === 'log'
        ? loginterp(x, lo.x, lo.y, hi.x, hi.y)
        : linterp(x, lo.x, lo.y, hi.x, hi.y);
    }
  }
  return anchors[anchors.length - 1].y;
}

/** Clamp a number to [0, 1]. */
export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Median of a numeric array (sorts a copy). Returns null for empty input. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Arithmetic mean of a non-empty numeric array. */
export function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Round to one decimal place (weights and scores are reported at 0.1 granularity). */
export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
