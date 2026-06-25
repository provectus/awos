// ---------------------------------------------------------------------------
// audit-core — deterministic, repo-path-only audit pass.
//
// Runs every `detected`/`computed` category across all dimensions in ONE
// process and writes the per-dimension JSON artifacts + the aggregated
// audit.json — the same shapes the orchestrator used to assemble from 11
// subagents. The LLM is left only the irreducible slice: the 5 `judgment`
// categories (emitted here as status PENDING_JUDGMENT) and the tracker/docs
// connector metrics (which SKIP when no connector artifact is present).
//
// Routing (no hardcoded dimension list — derived from the registries):
//   judgment            → PENDING_JUDGMENT (LLM fills later)
//   DETECTORS[code]     → run the detector (repo path only)
//   METRICS[metric]     → run the metric once; it reports categories_awarded
//
// Topology flags are computed deterministically (topology.ts) and gate each
// category's `applies_when` — a category whose flag is false is SKIP (excluded
// from the coverage denominator), never run. check_id comes from the dimension
// .md files (the `### XXX-NN:` heading), so the artifacts match the renderer's
// expectations. The only LLM-dependent inputs left out here are connectors
// (tracker/docs default to absent → those metrics SKIP) and the 5 judgments.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

import { loadStandards } from './metrics/_base.ts';
import { computeTopology, type TopologyFlags } from './topology.ts';
import type { DetectorResult } from './detectors/_base.ts';
import type { MetricResult } from './metrics/_base.ts';
import type { Period } from './collectors/_base.ts';
import { writeArtifact } from './collectors/_base.ts';
import { collect as collectGit } from './collectors/git.ts';
import { collect as collectCi } from './collectors/ci.ts';
import { collect as collectTracker } from './collectors/tracker.ts';
import { collect as collectDocs } from './collectors/docs.ts';

const PERIOD: Period = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

type DetectorFn = (repoPath: string, params?: unknown) => DetectorResult;
type MetricFn = (
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>,
  repoPath?: string
) => MetricResult | Promise<MetricResult>;

interface Category {
  code: number;
  metric?: string;
  dimension: string;
  weight: number;
  method: string;
  definition?: string;
  applies_when?: string;
  reliability_default?: string;
  source?: string;
  source_year?: number;
}

interface CheckRecord {
  check_id: string;
  code: number[];
  method: string;
  status: string;
  value: unknown;
  evidence: string[];
  weight_awarded: number;
  weight_max: number;
  applies: boolean;
  reliability: { tag: string; confidence: string; note: string | null };
  source: string;
  definition: string;
  hint: string;
  plain: string;
}

export interface AuditCoreSummary {
  audit_total: number;
  categories: number;
  detected: number;
  computed: number;
  judgment_pending: number;
  skipped: number;
  duration_ms: number;
}

export async function auditCore(
  repoPath: string,
  outDir: string,
  detectors: Record<number, DetectorFn>,
  metrics: Record<string, MetricFn>,
  standardsPath: string
): Promise<AuditCoreSummary> {
  const start = Date.now();
  const standards = loadStandards(standardsPath);
  const cats = standards.category as Record<string, Category>;
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(outDir, { recursive: true });

  // Map category code → human check_id (e.g. 2600 → "SEC-01") from the
  // dimension .md files, so artifacts carry the same ids the renderer expects.
  const skillRoot = dirname(dirname(standardsPath));
  const checkIdByCode = parseCheckIds(join(skillRoot, 'dimensions'));

  // 1. Deterministic collectors → collected/ artifacts. git is always present;
  //    ci self-probes; tracker/docs emit available:false without a connector.
  const collectedDir = join(outDir, 'collected');
  for (const art of [
    collectGit(repoPath, PERIOD),
    collectCi(repoPath, PERIOD),
    collectTracker(repoPath, PERIOD),
    collectDocs(repoPath, PERIOD),
  ]) {
    writeArtifact(art as { source: string }, collectedDir);
  }

  // 2. Deterministic topology flags. Connector-dependent flags default to
  //    absent; the orchestrator re-runs with connectors during the patch phase.
  const topology: TopologyFlags = computeTopology(repoPath);

  // 3. Run each metric once. A metric reports the category codes it awarded
  //    (PASS) and whether it ran (OK) or skipped (no sources).
  const metricIds = new Set<string>();
  for (const c of Object.values(cats)) {
    if (c.dimension === 'org-portfolio' || c.method === 'judgment') continue;
    if (detectors[c.code] === undefined && c.metric) metricIds.add(c.metric);
  }
  const awarded = new Set<number>();
  const skippedByMetric = new Set<number>();
  for (const id of metricIds) {
    const fn = metrics[id];
    if (!fn) continue;
    let res: MetricResult;
    try {
      res = await fn(collectedDir, standards, topology, repoPath);
    } catch (err) {
      process.stderr.write(`audit-core: metric ${id} threw: ${String(err)}\n`);
      continue;
    }
    for (const code of (res.categories_awarded ?? []) as number[]) {
      awarded.add(code);
    }
    if (res.status === 'SKIP') {
      for (const c of Object.values(cats)) {
        if (c.metric === id) skippedByMetric.add(c.code);
      }
    }
  }

  // 4. Build a check record for every scored category, grouped by dimension.
  const byDimension: Record<string, CheckRecord[]> = {};
  let detected = 0;
  let computed = 0;
  let judgmentPending = 0;
  let skipped = 0;

  for (const [key, c] of Object.entries(cats)) {
    if (c.dimension === 'org-portfolio') continue;
    const rec = buildCheck(
      key,
      c,
      detectors,
      repoPath,
      awarded,
      skippedByMetric,
      topology,
      checkIdByCode
    );
    (byDimension[c.dimension] ??= []).push(rec);
    if (rec.status === 'PENDING_JUDGMENT') judgmentPending++;
    else if (rec.status === 'SKIP') skipped++;
    else if (c.method === 'computed') computed++;
    else detected++;
  }

  // 5. Per-dimension JSON + aggregated audit.json.
  let auditTotal = 0;
  let auditApplicable = 0;
  const dimensions: unknown[] = [];
  for (const [dimension, checks] of Object.entries(byDimension)) {
    const score = checks.reduce((s, c) => s + c.weight_awarded, 0);
    const applicable = checks
      .filter((c) => c.applies)
      .reduce((s, c) => s + c.weight_max, 0);
    auditTotal += score;
    auditApplicable += applicable;
    const dim = {
      dimension,
      date,
      score,
      coverage: applicable > 0 ? score / applicable : 0,
      checks,
    };
    writeFileSync(join(outDir, `${dimension}.json`), JSON.stringify(dim, null, 2));
    dimensions.push(dim);
  }

  const audit = {
    date,
    project: basename(repoPath),
    audit_total: auditTotal,
    coverage: auditApplicable > 0 ? auditTotal / auditApplicable : 0,
    dimensions,
  };
  writeFileSync(join(outDir, 'audit.json'), JSON.stringify(audit, null, 2));

  return {
    audit_total: auditTotal,
    categories: detected + computed + judgmentPending + skipped,
    detected,
    computed,
    judgment_pending: judgmentPending,
    skipped,
    duration_ms: Date.now() - start,
  };
}

/**
 * Parse `### XXX-NN:` headings and their `**Category:** <codes>` lines from
 * every dimension .md file, returning a code → check_id map.
 */
/**
 * Re-aggregate audit.json from the per-dimension <name>.json files in `outDir`,
 * recomputing each dimension's score/coverage from its (possibly patched) checks
 * and the audit totals. Preserves the project/date and any authored report
 * blocks (headline/insights/recommendations) already on audit.json. Run after
 * the orchestrator patches judgment or connector checks, before rendering.
 */
export function aggregate(outDir: string): void {
  const files = readdirSync(outDir).filter(
    (f) => f.endsWith('.json') && f !== 'audit.json' && f !== 'org-portfolio.json'
  );
  let total = 0;
  let applicable = 0;
  const dimensions: Record<string, unknown>[] = [];
  for (const f of files) {
    let dim: Record<string, unknown>;
    try {
      dim = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
    } catch {
      continue;
    }
    const checks = dim.checks as CheckRecord[] | undefined;
    if (!Array.isArray(checks)) continue;
    const score = checks.reduce((s, c) => s + (c.weight_awarded || 0), 0);
    const appl = checks
      .filter((c) => c.applies)
      .reduce((s, c) => s + (c.weight_max || 0), 0);
    dim.score = score;
    dim.coverage = appl > 0 ? score / appl : 0;
    writeFileSync(join(outDir, f), JSON.stringify(dim, null, 2));
    total += score;
    applicable += appl;
    dimensions.push(dim);
  }
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf8'));
  } catch {
    /* no prior audit.json */
  }
  const audit: Record<string, unknown> = {
    date: existing.date ?? new Date().toISOString().slice(0, 10),
    project: existing.project ?? basename(outDir),
    audit_total: total,
    coverage: applicable > 0 ? total / applicable : 0,
    dimensions,
  };
  for (const block of ['headline', 'insights', 'recommendations']) {
    if (existing[block] !== undefined) audit[block] = existing[block];
  }
  writeFileSync(join(outDir, 'audit.json'), JSON.stringify(audit, null, 2));
}

function parseCheckIds(dimensionsDir: string): Map<number, string> {
  const map = new Map<number, string>();
  let files: string[];
  try {
    files = readdirSync(dimensionsDir).filter((f) => f.endsWith('.md'));
  } catch {
    return map;
  }
  const headingRe = /^###\s+([A-Z]+-\d+)\s*:/;
  const categoryRe = /^[-*]\s*\*\*Category:\*\*\s*([\d,\s]+)/;
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(dimensionsDir, file), 'utf8');
    } catch {
      continue;
    }
    let current: string | null = null;
    for (const line of text.split('\n')) {
      const h = line.match(headingRe);
      if (h) {
        current = h[1];
        continue;
      }
      const cat = line.match(categoryRe);
      if (cat && current) {
        for (const codeStr of cat[1].split(',')) {
          const code = Number(codeStr.trim());
          if (Number.isInteger(code) && !map.has(code)) map.set(code, current);
        }
      }
    }
  }
  return map;
}

/** Evaluate a category's applies_when against topology flags. */
function appliesGatedOff(c: Category, topology: TopologyFlags): boolean {
  const aw = c.applies_when;
  if (!aw || aw === 'always') return false;
  const m = aw.match(/^topology\.(.+)$/);
  return m ? !topology[m[1]] : false;
}

function buildCheck(
  key: string,
  c: Category,
  detectors: Record<number, DetectorFn>,
  repoPath: string,
  awarded: Set<number>,
  skippedByMetric: Set<number>,
  topology: TopologyFlags,
  checkIdByCode: Map<number, string>
): CheckRecord {
  let status: string;
  let value: unknown = null;
  let evidence: string[] = [];

  if (appliesGatedOff(c, topology)) {
    // applies_when topology flag is false → category does not apply.
    status = 'SKIP';
    value = `applies_when ${c.applies_when} is false`;
  } else if (c.method === 'judgment') {
    status = 'PENDING_JUDGMENT';
  } else if (detectors[c.code] !== undefined) {
    let r: DetectorResult;
    try {
      r = detectors[c.code](repoPath);
    } catch (err) {
      r = { status: 'FAIL', value: `detector-error: ${String(err)}`, evidence: [], method: c.method };
    }
    status = r.status;
    value = r.value;
    evidence = r.evidence;
  } else {
    // metric-routed: PASS if the metric awarded this code; SKIP if its metric
    // had no sources; otherwise the criterion ran but was not met.
    if (awarded.has(c.code)) status = 'PASS';
    else if (skippedByMetric.has(c.code)) status = 'SKIP';
    else status = 'FAIL';
  }

  const applies = status !== 'SKIP';
  const weightAwarded = status === 'PASS' ? c.weight : 0;
  return {
    check_id: checkIdByCode.get(c.code) ?? key,
    code: [c.code],
    method: c.method,
    status,
    value,
    evidence,
    weight_awarded: weightAwarded,
    weight_max: c.weight,
    applies,
    reliability: {
      tag: c.reliability_default ?? 'unknown',
      confidence: c.method === 'judgment' ? 'medium' : 'high',
      note: null,
    },
    source: c.source ?? '',
    definition: c.definition ?? '',
    hint: `${c.definition ?? ''} · ${c.method} · ${c.source ?? ''} (${c.source_year ?? ''})`,
    plain: c.definition ?? '',
  };
}
