/**
 * Prevention linkage — the derived view over the prevention-coverage
 * dimension. Joins each cluster's PRV check pair (enforcement + instruction)
 * against the source-dimension checks it covers, producing the tier
 * classification, the at-risk list, and the unguarded-passes fragility
 * signal.
 *
 * Pure functions over already-built dimension objects: no filesystem, no
 * standards access. The PRV checks are self-describing (buildCheck stamps
 * `cluster` / `covers_checks` / `prevention_kind` from standards.toml), so
 * both audit-core and aggregate() can recompute the block — aggregate() runs
 * after patch-judgment, which is how `pending` tiers finalize with no extra
 * state.
 */

import type {
  Check,
  CheckStatus,
  PreventionBlock,
  PreventionCluster,
  PreventionTier,
} from './artifact_types.ts';

/** The slice of a dimension artifact the linkage pass needs. */
export interface PreventionDimensionInput {
  dimension: string;
  checks: Check[];
}

const PREVENTION_DIMENSION = 'prevention-coverage';

/** "secrets-hygiene" → "Secrets hygiene" */
function clusterTitle(slug: string): string {
  const words = slug.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isPartialStatus(status: CheckStatus): boolean {
  return status === 'WARN' || status === 'PARTIAL';
}

function evidenceHead(check: Check): string | undefined {
  const head = check.evidence?.[0];
  if (!head) return undefined;
  return head.length > 160 ? `${head.slice(0, 157)}…` : head;
}

/**
 * Derive the prevention block from the dimension set. Returns null when no
 * PRV checks exist — audits produced before the prevention-coverage dimension
 * (or with it fully skipped) carry no block rather than a fabricated one.
 */
export function computePrevention(
  dimensions: PreventionDimensionInput[]
): PreventionBlock | null {
  const prvDim = dimensions.find((d) => d.dimension === PREVENTION_DIMENSION);
  const prvChecks = (prvDim?.checks ?? []).filter((c) => c.cluster);
  if (prvChecks.length === 0) return null;

  // Group the pair per cluster, preserving standards.toml order (order of
  // first appearance in the PRV dimension's checks array).
  const clusterOrder: string[] = [];
  const pairs = new Map<string, { enforcement?: Check; instruction?: Check }>();
  for (const c of prvChecks) {
    const slug = c.cluster!;
    if (!pairs.has(slug)) {
      pairs.set(slug, {});
      clusterOrder.push(slug);
    }
    const pair = pairs.get(slug)!;
    if (c.prevention_kind === 'instruction') pair.instruction = c;
    else pair.enforcement = c;
  }

  // Index every non-PRV check by check_id for the covers join.
  const byCheckId = new Map<string, { dimension: string; check: Check }>();
  for (const d of dimensions) {
    if (d.dimension === PREVENTION_DIMENSION) continue;
    for (const c of d.checks ?? []) {
      if (c.check_id)
        byCheckId.set(c.check_id, { dimension: d.dimension, check: c });
    }
  }

  const clusters: PreventionCluster[] = [];
  const summary = {
    enforced: 0,
    instructed: 0,
    absent: 0,
    pending: 0,
    at_risk_count: 0,
    unguarded_pass_count: 0,
  };

  for (const slug of clusterOrder) {
    const { enforcement, instruction } = pairs.get(slug)!;
    // A half can be missing on a hand-damaged artifact; treat missing as SKIP
    // so the other half still classifies the cluster.
    const eStatus: CheckStatus = enforcement?.status ?? 'SKIP';
    const iStatus: CheckStatus = instruction?.status ?? 'SKIP';

    // Both halves gated off (applies_when false) — the cluster has no
    // measurable surface in this repo; omit it entirely.
    if (eStatus === 'SKIP' && iStatus === 'SKIP') continue;

    let tier: PreventionTier;
    let partial = false;
    if ((enforcement?.weight_awarded ?? 0) > 0) {
      tier = 'enforced';
      partial = isPartialStatus(eStatus);
    } else if (iStatus === 'PENDING_JUDGMENT') {
      tier = 'pending';
    } else if ((instruction?.weight_awarded ?? 0) > 0) {
      tier = 'instructed';
      partial = isPartialStatus(iStatus);
    } else {
      tier = 'absent';
    }

    const covers = enforcement?.covers_checks ?? [];
    const at_risk: PreventionCluster['at_risk'] = [];
    const unguarded_passes: string[] = [];
    for (const coveredId of covers) {
      const hit = byCheckId.get(coveredId);
      // Unknown id (whole category absent from this audit) or a check with
      // no applicable surface — nothing to classify.
      if (!hit) continue;
      const status = hit.check.status;
      if (status === 'FAIL' || status === 'WARN' || status === 'PARTIAL') {
        at_risk.push({ check_id: coveredId, dimension: hit.dimension, status });
      } else if (status === 'PASS' && tier === 'absent') {
        // The fragility signal: passing today with nothing preventing
        // regression. Deferred for `pending` clusters — they may still turn
        // out instructed.
        unguarded_passes.push(coveredId);
      }
    }

    summary[tier] += 1;
    summary.at_risk_count += at_risk.length;
    summary.unguarded_pass_count += unguarded_passes.length;

    clusters.push({
      cluster: slug,
      title: clusterTitle(slug),
      tier,
      partial,
      enforcement: {
        check_id: enforcement?.check_id ?? '',
        status: eStatus,
        ...(enforcement && evidenceHead(enforcement)
          ? { evidence_head: evidenceHead(enforcement) }
          : {}),
      },
      instruction: {
        check_id: instruction?.check_id ?? '',
        status: iStatus,
        ...(instruction && evidenceHead(instruction)
          ? { evidence_head: evidenceHead(instruction) }
          : {}),
      },
      covers_checks: covers,
      at_risk,
      unguarded_passes,
    });
  }

  if (clusters.length === 0) return null;
  return { clusters, summary };
}

/**
 * Stamp `check.prevention = { cluster, tier }` on every covered, applicable
 * source-dimension check (in-memory objects only — callers control which
 * artifact the annotation lands in; by design that is audit.json, never the
 * per-dimension files).
 */
export function annotateCoveredChecks(
  dimensions: PreventionDimensionInput[],
  block: PreventionBlock
): void {
  const tierByCoveredId = new Map<
    string,
    { cluster: string; tier: PreventionTier }
  >();
  for (const cluster of block.clusters) {
    for (const id of cluster.covers_checks) {
      tierByCoveredId.set(id, { cluster: cluster.cluster, tier: cluster.tier });
    }
  }
  for (const d of dimensions) {
    if (d.dimension === PREVENTION_DIMENSION) continue;
    for (const c of d.checks ?? []) {
      if (c.status === 'SKIP') continue;
      const annotation = c.check_id
        ? tierByCoveredId.get(c.check_id)
        : undefined;
      if (annotation) c.prevention = { ...annotation };
    }
  }
}
