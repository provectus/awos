/**
 * _code_host.ts — shared reader for the orchestrator-fetched code-host
 * connector artifact (collected/code_host.json).
 *
 * The code host (GitHub/GitLab/Azure DevOps via `gh`/`glab`/MCP) is the real
 * source for PR timings on squash-merge repos, where git history alone cannot
 * reconstruct branch lifetimes. The orchestrator fetches merged-PR records and
 * writes them in the shape documented in references/connector-shapes.md →
 * "Code host (merged PRs)":
 *
 *   raw.prs: Array<{
 *     number?: number,
 *     created_at: string,        // PR opened
 *     merged_at: string,         // PR merged
 *     first_commit_at?: string,  // earliest commit authored on the PR
 *     commit_count?: number,     // commits on the PR at merge time
 *   }>
 *
 * The fetch window is enforced at fetch time (period.lookback_days documents
 * it), so readers use every record in the artifact.
 */
import { readArtifact } from './_base.ts';

export interface CodeHostPr {
  createdMs: number | null;
  mergedMs: number | null;
  firstCommitMs: number | null;
  commitCount: number | null;
}

export interface CodeHostData {
  /** Artifact present with available=true and a prs[] array. */
  available: boolean;
  prs: CodeHostPr[];
}

function toMs(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
}

/** Parse collected/code_host.json into date-normalized PR records.
 * Absent/unavailable/malformed artifacts read as `available: false`. */
export function readCodeHostPrs(collectedDir: string): CodeHostData {
  const read = readArtifact(collectedDir, 'code_host');
  if ('error' in read) return { available: false, prs: [] };
  const art = read.artifact as
    | { available?: boolean; raw?: { prs?: unknown } }
    | undefined;
  const rawPrs = art?.raw?.prs;
  if (!art?.available || !Array.isArray(rawPrs)) {
    return { available: false, prs: [] };
  }
  const prs: CodeHostPr[] = [];
  for (const p of rawPrs) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    prs.push({
      createdMs: toMs(r.created_at),
      mergedMs: toMs(r.merged_at),
      firstCommitMs: toMs(r.first_commit_at),
      commitCount:
        typeof r.commit_count === 'number' && r.commit_count >= 0
          ? r.commit_count
          : null,
    });
  }
  return { available: true, prs };
}

/**
 * Durations (hours) from a PR's start field to its merge, dropping PRs missing
 * either timestamp or with a negative interval. `startField` selects the
 * definition: `firstCommitMs` for lead time (first commit → merge),
 * `createdMs` for cycle time (PR open → merge). Order follows the input.
 */
export function prDurationsHours(
  prs: CodeHostPr[],
  startField: 'firstCommitMs' | 'createdMs'
): number[] {
  const hours: number[] = [];
  for (const p of prs) {
    const start = p[startField];
    if (p.mergedMs === null || start === null) continue;
    const h = (p.mergedMs - start) / 3_600_000;
    if (h >= 0) hours.push(h);
  }
  return hours;
}
