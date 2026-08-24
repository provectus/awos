import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Period {
  bucket_days: number;
  lookback_days: number;
  history_available_days: number;
}

export function makeArtifact<R>(
  source: string,
  available: boolean,
  reasonIfAbsent: string | null,
  period: Period,
  raw: R
) {
  return {
    source,
    available: Boolean(available),
    reason_if_absent: reasonIfAbsent,
    period: {
      bucket_days: period.bucket_days,
      lookback_days: period.lookback_days,
      history_available_days: period.history_available_days,
    },
    raw,
  };
}

export function writeArtifact(
  artifact: { source: string },
  outDir: string
): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${artifact.source}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}

// ---------------------------------------------------------------------------
// Shared numeric / windowing helpers
//
// These live in the COLLECTOR base rather than under metrics/ because both
// layers need them and the dependency only runs one way: metrics/ imports from
// collectors/ (metrics/mttr.ts reads collectors/incidents.ts), so a collector
// importing from metrics/ would invert the layering. Before this, each layer
// carried its own copy and they had already drifted.
// ---------------------------------------------------------------------------

/** Median of a numeric array (sorts a copy). Returns null for empty input. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface WindowClamp<T> {
  /** Records inside the window (plus records with no parseable timestamp). */
  kept: T[];
  /** Records older than the window, excluded from the metric. */
  dropped: number;
}

/**
 * Clamp connector records (CI runs, tracker tickets, incidents) to the audit
 * window, anchored to the NEWEST record timestamp — mirroring the git
 * collector, which anchors its window to the newest commit — so the result is
 * deterministic for a given artifact. Connectors routinely over-fetch (e.g.
 * `gh run list --limit 500` reaching months back, or an all-time incident
 * export); without this clamp that history would leak into metrics that must
 * measure the last `[meta].max_lookback_days` only. Records with no parseable
 * timestamp are kept: they cannot be judged against the window, and silently
 * dropping them would misreport the sample.
 *
 * A falsy or non-positive `days` means no clamp — callers whose window is
 * optional get everything back rather than nothing.
 */
export function clampToWindow<T>(
  records: T[],
  days: number | null | undefined,
  tsOf: (r: T) => unknown
): WindowClamp<T> {
  if (!days || days <= 0) return { kept: records, dropped: 0 };
  let anchor = -Infinity;
  const stamps = records.map((r) => {
    const t = Date.parse(String(tsOf(r) ?? ''));
    if (Number.isFinite(t) && t > anchor) anchor = t;
    return t;
  });
  if (!Number.isFinite(anchor)) return { kept: records, dropped: 0 };
  const since = anchor - days * 86_400_000;
  const kept: T[] = [];
  let dropped = 0;
  records.forEach((r, i) => {
    if (Number.isFinite(stamps[i]) && stamps[i] < since) dropped++;
    else kept.push(r);
  });
  return { kept, dropped };
}
