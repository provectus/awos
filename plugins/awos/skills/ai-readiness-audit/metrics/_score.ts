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

/**
 * Declarative score curve for one standards.toml category — the
 * `[category.<key>.scoring]` sub-table. Every metric whose score is not the
 * measured 0..1 fraction itself MUST read its curve from here, so the
 * value→score mapping is reviewable configuration, not code.
 */
export interface ScoringConfig {
  /** Interpolation between anchors: 'linear' or 'log' (x on a log scale). */
  scale: 'linear' | 'log';
  /** Sorted [x, y] anchor points; y is the 0..1 score awarded at value x. */
  anchors: ReadonlyArray<{ x: number; y: number }>;
  /** What x is measured in (documentation for reviewers). */
  anchor_unit?: string;
  /** 'published' = anchors transcribe numbers from the cited url;
   *  'derived' = boundary values come from the cited source, the score at
   *  each boundary is AWOS calibration;
   *  'heuristic' = the cited source publishes no numbers — anchors are AWOS
   *  judgment and say so. */
  basis: 'published' | 'derived' | 'heuristic';
  /** Required for 'derived'/'heuristic': what part is sourced vs invented. */
  basis_note?: string;
}

/**
 * Read the `[category.<key>.scoring]` table from parsed standards.toml.
 * Throws when the table is missing or malformed — a banded metric with no
 * declared curve means its numbers were made up in code, which is exactly
 * the state this guard exists to keep out of the plugin.
 */
export function scoringFor(
  standards: Record<string, unknown>,
  categoryKey: string
): ScoringConfig {
  const cats = (standards['category'] ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const raw = cats[categoryKey]?.['scoring'] as
    | Record<string, unknown>
    | undefined;
  if (!raw) {
    throw new Error(
      `standards.toml [category.${categoryKey}] has no [category.${categoryKey}.scoring] table — ` +
        `banded metrics must declare their score curve in standards.toml ` +
        `(scale, anchors = [[x, y], …], basis, basis_note), not hardcode it. ` +
        `Decide which published values the curve should transcribe (see the category's url) ` +
        `or mark it basis = "heuristic" with a basis_note.`
    );
  }
  const scale = raw['scale'];
  if (scale !== 'linear' && scale !== 'log') {
    throw new Error(
      `[category.${categoryKey}.scoring] scale must be "linear" or "log", got ${JSON.stringify(scale)}`
    );
  }
  const basis = raw['basis'];
  if (basis !== 'published' && basis !== 'derived' && basis !== 'heuristic') {
    throw new Error(
      `[category.${categoryKey}.scoring] basis must be "published", "derived", or "heuristic", got ${JSON.stringify(basis)}`
    );
  }
  const pairs = raw['anchors'];
  if (!Array.isArray(pairs) || pairs.length < 2) {
    throw new Error(
      `[category.${categoryKey}.scoring] anchors must be an array of at least two [x, y] pairs`
    );
  }
  const anchors = pairs.map((p, i) => {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      typeof p[0] !== 'number' ||
      typeof p[1] !== 'number'
    ) {
      throw new Error(
        `[category.${categoryKey}.scoring] anchors[${i}] must be a numeric [x, y] pair`
      );
    }
    return { x: p[0], y: p[1] };
  });
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].x <= anchors[i - 1].x) {
      throw new Error(
        `[category.${categoryKey}.scoring] anchors must be strictly increasing in x`
      );
    }
  }
  return {
    scale,
    anchors,
    anchor_unit: raw['anchor_unit'] as string | undefined,
    basis,
    basis_note: raw['basis_note'] as string | undefined,
  };
}

/** Score a measured value through a category's declared curve, clamped to [0,1]. */
export function scoreFromConfig(x: number, cfg: ScoringConfig): number {
  return clamp01(bandScore(x, cfg.anchors, cfg.scale));
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
