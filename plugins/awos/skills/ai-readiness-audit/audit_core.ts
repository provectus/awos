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
import {
  computeTopology,
  detectLinkedRepos,
  detectFrameworks,
  type TopologyFlags,
} from './topology.ts';
import { detectLanguages, LANGUAGES } from './languages.ts';
import { detectAgentTools } from './agent_tools.ts';
import { detectCiConfigPath } from './ci_platforms.ts';
import type { DetectorResult } from './detectors/_base.ts';
import { iterFiles, DEFAULT_IGNORE } from './detectors/_base.ts';
import type { MetricResult } from './metrics/_base.ts';
import type { Period } from './collectors/_base.ts';
import { writeArtifact } from './collectors/_base.ts';
import { collect as collectGit } from './collectors/git.ts';
import { collect as collectCi } from './collectors/ci.ts';
import { collect as collectTracker } from './collectors/tracker.ts';
import { collect as collectDocs } from './collectors/docs.ts';

// ---------------------------------------------------------------------------
// CI platform display name — derived from the config path returned by
// detectCiConfigPath so there is a single source of truth for recognised paths.
// ---------------------------------------------------------------------------
function ciDisplayName(configPath: string): string {
  if (configPath.startsWith('.github/workflows')) return 'GitHub Actions';
  if (configPath.startsWith('.circleci')) return 'CircleCI';
  if (configPath.startsWith('.gitlab-ci')) return 'GitLab CI';
  if (
    configPath.startsWith('.azure-pipelines') ||
    configPath.startsWith('azure-pipelines')
  )
    return 'Azure DevOps';
  if (configPath === 'Jenkinsfile') return 'Jenkins';
  if (configPath.startsWith('.travis')) return 'Travis CI';
  if (configPath.startsWith('bitbucket-pipelines'))
    return 'Bitbucket Pipelines';
  if (configPath.startsWith('.buildkite')) return 'Buildkite';
  if (configPath.startsWith('.drone')) return 'Drone';
  if (configPath.startsWith('.teamcity')) return 'TeamCity';
  if (
    configPath.startsWith('.concourse') ||
    configPath.startsWith('ci/pipeline')
  )
    return 'Concourse CI';
  if (configPath.startsWith('.woodpecker')) return 'Woodpecker CI';
  if (configPath.startsWith('pipelines/')) return 'Azure DevOps';
  return configPath;
}

// ---------------------------------------------------------------------------
// Detection conflicts — files claimed by more than one language's sourceGlobs.
// Uses an extension-based approach on the language registry (O(languages²))
// and a limited file scan to stay fast even on large repos.
// ---------------------------------------------------------------------------
function computeDetectionConflicts(
  repoPath: string
): Array<{ file: string; claimedBy: string[] }> {
  // Build extension → language displayName[] map from the language registry.
  const extLangs = new Map<string, string[]>();
  for (const lang of LANGUAGES) {
    for (const glob of lang.sourceGlobs) {
      // Only handle simple *.ext globs (the common case).
      if (!glob.startsWith('*.')) continue;
      const ext = glob.slice(1); // e.g. ".ts"
      const existing = extLangs.get(ext) ?? [];
      if (!existing.includes(lang.displayName)) {
        existing.push(lang.displayName);
        extLangs.set(ext, existing);
      }
    }
  }

  // Collect conflict extensions (registry-level).
  const conflictExts = new Set<string>();
  for (const [ext, langs] of extLangs) {
    if (langs.length > 1) conflictExts.add(ext);
  }
  if (conflictExts.size === 0) return [];

  // Find actual conflicted files in the repo (limited sample).
  const conflicts: Array<{ file: string; claimedBy: string[] }> = [];
  try {
    const conflictGlobs = [...conflictExts].map((ext) => `*${ext}`);
    const files = iterFiles(repoPath, conflictGlobs, DEFAULT_IGNORE).slice(
      0,
      200
    );
    for (const file of files) {
      const dot = file.lastIndexOf('.');
      if (dot === -1) continue;
      const ext = file.slice(dot);
      const langs = extLangs.get(ext);
      if (langs && langs.length > 1) {
        conflicts.push({
          file: file.replace(repoPath + '/', ''),
          claimedBy: langs,
        });
      }
    }
  } catch {
    /* scan errors are non-fatal */
  }
  return conflicts;
}

const PERIOD: Period = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

const COLLECTOR_SOURCES = ['git', 'ci', 'tracker', 'docs'] as const;

type DetectorFn = (repoPath: string, params?: unknown) => DetectorResult;
type MetricFn = (
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>,
  repoPath?: string
) => MetricResult | Promise<MetricResult>;

interface Category {
  code: number;
  check_id?: string;
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
  unit?: string;
  expression?: string;
  source_year?: number;
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

  // Build sources block from collector artifacts.
  const sources = COLLECTOR_SOURCES.map((src) => {
    try {
      const art = JSON.parse(
        readFileSync(join(collectedDir, `${src}.json`), 'utf8')
      );
      return {
        source: src,
        available: Boolean(art.available),
        reason_if_absent: art.reason_if_absent ?? null,
        history_available_days: art.period?.history_available_days ?? null,
      };
    } catch {
      return {
        source: src,
        available: false,
        reason_if_absent: 'collector artifact not found',
        history_available_days: null,
      };
    }
  });

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
  const metricMeta = new Map<number, { unit?: string; expression?: string; value?: unknown; evidence?: string[] }>();
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
      metricMeta.set(code, {
        unit: res.unit,
        expression: res.expression,
        value: res.value,
        evidence: res.expression ? [res.expression] : [],
      });
    }
    if (res.status === 'SKIP') {
      for (const c of Object.values(cats)) {
        if (c.metric === id) skippedByMetric.add(c.code);
      }
    }
    // Store meta for all codes this metric covers (not just awarded).
    for (const c of Object.values(cats)) {
      if (c.metric === id && !metricMeta.has(c.code)) {
        metricMeta.set(c.code, {
          unit: res.unit,
          expression: res.expression,
          value: res.value,
          evidence: res.expression ? [res.expression] : [],
        });
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
      checkIdByCode,
      metricMeta
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
    writeFileSync(
      join(outDir, `${dimension}.json`),
      JSON.stringify(dim, null, 2)
    );
    dimensions.push(dim);
  }

  // Compute linked repos, tech stack, and detection conflicts.
  const linkedRepos = detectLinkedRepos(repoPath);
  const ciPath = detectCiConfigPath(repoPath);
  const techStack = {
    languages: detectLanguages(repoPath).map((l) => ({
      name: l.def.displayName,
      evidence: l.evidence,
    })),
    agent_tools: detectAgentTools(repoPath).map((t) => ({
      name: t.def.displayName,
      evidence: t.evidence,
    })),
    ci: ciPath ? [{ name: ciDisplayName(ciPath), evidence: ciPath }] : [],
    frameworks: detectFrameworks(repoPath).map((f) => ({
      name: f.name,
      evidence: f.evidence,
    })),
  };
  const detectionConflicts = computeDetectionConflicts(repoPath);

  const audit = {
    date,
    project: basename(repoPath),
    audit_total: auditTotal,
    coverage: auditApplicable > 0 ? auditTotal / auditApplicable : 0,
    dimensions,
    sources,
    linked_repos: linkedRepos,
    tech_stack: techStack,
    detection_conflicts: detectionConflicts,
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
    (f) =>
      f.endsWith('.json') && f !== 'audit.json' && f !== 'org-portfolio.json'
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
    // Re-derive applies from status so patched-PASS connector checks count
    // in the denominator — prevents coverage > 1 when a SKIP is patched to PASS.
    for (const c of checks) c.applies = c.status !== 'SKIP';
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

  // Re-derive sources from collected/ artifacts (derived like dimension sums).
  const collectedDirAgg = join(outDir, 'collected');
  const derivedSources = COLLECTOR_SOURCES.map((src) => {
    try {
      const art = JSON.parse(
        readFileSync(join(collectedDirAgg, `${src}.json`), 'utf8')
      );
      return {
        source: src,
        available: Boolean(art.available),
        reason_if_absent: art.reason_if_absent ?? null,
        history_available_days: art.period?.history_available_days ?? null,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  const audit: Record<string, unknown> = {
    date: existing.date ?? new Date().toISOString().slice(0, 10),
    project: existing.project ?? basename(outDir),
    audit_total: total,
    coverage: applicable > 0 ? total / applicable : 0,
    dimensions,
  };
  for (const block of [
    'headline',
    'insights',
    'recommendations',
    'tech_stack',
    'linked_repos',
    'detection_conflicts',
  ]) {
    if (existing[block] !== undefined) audit[block] = existing[block];
  }
  // Prefer re-derived sources when collected/ artifacts are present; fall back
  // to the previously stored sources block so it is never silently dropped.
  if (derivedSources.length > 0) {
    audit.sources = derivedSources;
  } else if (existing.sources !== undefined) {
    audit.sources = existing.sources;
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
  checkIdByCode: Map<number, string>,
  metricMeta?: Map<number, { unit?: string; expression?: string; value?: unknown; evidence?: string[] }>
): CheckRecord {
  let status: string;
  let value: unknown = null;
  let evidence: string[] = [];
  let unit: string | undefined;
  let expression: string | undefined;

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
      r = {
        status: 'FAIL',
        value: `detector-error: ${String(err)}`,
        evidence: [],
        method: c.method,
      };
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
    // Thread unit/expression/value/evidence from the metric result if available.
    const meta = metricMeta?.get(c.code);
    if (meta) {
      unit = meta.unit;
      expression = meta.expression;
      value = meta.value ?? value;
      if (evidence.length === 0 && meta.evidence) evidence = meta.evidence;
    }
  }

  const applies = status !== 'SKIP';
  const weightAwarded = status === 'PASS' ? c.weight : 0;
  const rec: CheckRecord = {
    check_id: c.check_id ?? checkIdByCode.get(c.code) ?? key,
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
    source_year: c.source_year,
  };
  if (unit !== undefined) rec.unit = unit;
  if (expression !== undefined) rec.expression = expression;
  return rec;
}
