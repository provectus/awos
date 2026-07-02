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

import { loadStandards, metaNumber } from './metrics/_base.ts';
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
import {
  collect as collectGit,
  ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT,
  REWORK_HORIZON_DAYS_DEFAULT,
} from './collectors/git.ts';
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

const round1 = (n: number) => Math.round(n * 10) / 10;

// Last-resort lookback window (days) used only when meta.max_lookback_days is
// absent from standards.toml. The source of truth is meta.max_lookback_days.
const MAX_LOOKBACK_DAYS_FALLBACK = 90;

const COLLECTOR_SOURCES = ['git', 'ci', 'tracker', 'docs'] as const;

/** Human-readable label for each source type (used in report tooltips). */
const SOURCE_LABEL_DEFAULTS: Record<string, string> = {
  git: 'git history',
  ci: 'CI runs',
  tracker: 'issue tracker',
  docs: 'docs/wiki',
  scale: 'source code (AST)',
  audit: 'source code',
  incident: 'incident source',
  'org-rollup': 'portfolio',
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
  check_id?: string;
  metric?: string;
  dimension: string;
  weight: number;
  method: string;
  definition?: string;
  /** Optional one-line lead shown inline; the full `definition` stays in the tooltip. */
  summary?: string;
  applies_when?: string;
  reliability_default?: string;
  source?: string;
  sources?: string[];
  url?: string;
  date?: string;
  last_verified?: string;
  threshold?: number;
  threshold_days?: number;
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
  /** Fraction of capability present: ∈ [0,1]. */
  score: number;
  /** Fraction of applicable surface measured: ∈ [0,1]. */
  confidence: number;
  unit?: string;
  expression?: string;
  source_date: string | null;
  source_url: string | null;
  /** Date this check's definition was last verified against its cited source. */
  last_verified: string | null;
  /** Data sources that fed this check (from standards.toml `sources = [...]`). */
  sources: string[];
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
  standardsPath: string,
  // When set, skip the deterministic collectors and score against this already
  // populated collected/ directory instead. This is the `enrich` path: after the
  // orchestrator writes connector artifacts (tracker/docs/ci) into collected/,
  // re-scoring reuses them rather than overwriting them with empty ones.
  collectedDirOverride?: string
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
  //    When collectedDirOverride is set (the `enrich` re-score path), skip
  //    collection entirely and reuse the caller's already-populated artifacts.
  const collectedDir = collectedDirOverride ?? join(outDir, 'collected');
  if (!collectedDirOverride) {
    // All tunables come from standards.toml [meta] — never hardcoded here.
    const period: Period = {
      bucket_days: 30,
      lookback_days: metaNumber(
        standards,
        'max_lookback_days',
        MAX_LOOKBACK_DAYS_FALLBACK
      ),
      history_available_days: 0,
    };
    const gitOpts = {
      activeContributorThreshold: metaNumber(
        standards,
        'active_contributor_threshold',
        ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT
      ),
      reworkHorizonDays: metaNumber(
        standards,
        'rework_horizon_days',
        REWORK_HORIZON_DAYS_DEFAULT
      ),
    };
    for (const art of [
      collectGit(repoPath, period, gitOpts),
      collectCi(repoPath, period),
      collectTracker(repoPath, period),
      collectDocs(repoPath, period),
    ]) {
      writeArtifact(art as { source: string }, collectedDir);
    }
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

  // Build source_windows from collected artifacts for per-dimension provenance.
  // days = period.lookback_days ?? period.history_available_days ?? null
  // label = period.source_label (orchestrator-recorded) if present, else default.
  const sourceWindows: Record<string, { days: number | null; label: string }> =
    {};
  for (const src of COLLECTOR_SOURCES) {
    try {
      const art = JSON.parse(
        readFileSync(join(collectedDir, `${src}.json`), 'utf8')
      );
      const p = (art.period ?? {}) as Record<string, unknown>;
      const days: number | null =
        (p.lookback_days as number | undefined) ??
        (p.history_available_days as number | undefined) ??
        null;
      const label =
        (p.source_label as string | undefined) ??
        SOURCE_LABEL_DEFAULTS[src] ??
        src;
      sourceWindows[src] = { days, label };
    } catch {
      /* artifact absent */
    }
  }

  // 2. Deterministic topology flags. Connector-dependent flags (has_tracker,
  //    has_docs_connector, has_incident_source) are derived from the collected
  //    artifacts' availability: without a connector they are absent (checks
  //    SKIP); once the orchestrator writes an available connector artifact and
  //    `enrich` re-scores, they flip true so the gated categories score.
  const readCollected = (src: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(
        readFileSync(join(collectedDir, `${src}.json`), 'utf8')
      ) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const trackerArt = readCollected('tracker');
  const docsArt = readCollected('docs');
  const topology: TopologyFlags = computeTopology(repoPath, {
    has_tracker: Boolean(trackerArt?.available),
    has_docs_connector: Boolean(docsArt?.available),
    has_incident_source: Boolean(
      trackerArt?.available && trackerArt?.incident_source
    ),
  });

  // 3. Run each metric once. A metric reports the category codes it awarded
  //    (PASS) and whether it ran (OK) or skipped (no sources).
  const metricIds = new Set<string>();
  for (const c of Object.values(cats)) {
    if (c.dimension === 'org-portfolio' || c.method === 'judgment') continue;
    if (detectors[c.code] === undefined && c.metric) metricIds.add(c.metric);
  }
  const awarded = new Set<number>();
  const skippedByMetric = new Set<number>();
  const metricMeta = new Map<
    number,
    {
      unit?: string;
      expression?: string;
      value?: unknown;
      evidence?: string[];
      score?: number;
      confidence?: number;
      /** Reliability note from the metric — surfaces WHY a metric skipped. */
      note?: string | null;
    }
  >();
  const metricResults = await Promise.all(
    [...metricIds].map(async (id) => {
      const fn = metrics[id];
      if (!fn) return null;
      try {
        const res = await fn(collectedDir, standards, topology, repoPath);
        return { id, res };
      } catch (err) {
        process.stderr.write(
          `audit-core: metric ${id} threw: ${String(err)}\n`
        );
        return null;
      }
    })
  );
  for (const item of metricResults) {
    if (!item) continue;
    const { id, res } = item;
    const resEvidencePerCode = res.evidence_per_code as
      | Record<number, string[]>
      | undefined;
    for (const code of (res.categories_awarded ?? []) as number[]) {
      awarded.add(code);
      const perCodeScore = (
        res.score_per_code as Record<number, number> | undefined
      )?.[code];
      const perCodeEvidence = resEvidencePerCode?.[code];
      metricMeta.set(code, {
        unit: res.unit,
        expression: res.expression,
        value: res.value,
        evidence: perCodeEvidence ?? (res.expression ? [res.expression] : []),
        score: perCodeScore ?? res.score,
        confidence: res.confidence,
        note: res.reliability?.note ?? null,
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
        const perCodeScore = (
          res.score_per_code as Record<number, number> | undefined
        )?.[c.code as number];
        const perCodeEvidence = resEvidencePerCode?.[c.code as number];
        metricMeta.set(c.code, {
          unit: res.unit,
          expression: res.expression,
          value: res.value,
          evidence: perCodeEvidence ?? (res.expression ? [res.expression] : []),
          score: perCodeScore ?? res.score,
          confidence: res.confidence,
          note: res.reliability?.note ?? null,
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

  // 5. Per-dimension JSON + aggregated audit.json. Dimensions are emitted in
  //    the presentation order from standards.toml [meta].dimension_order
  //    (industry-standard engineering first, unscored descriptors last); each
  //    per-dimension JSON carries its `order` index plus the title/description
  //    from its dimensions/*.md frontmatter so aggregate/render can preserve
  //    the order and show the description as a tooltip without re-parsing.
  const dimOrder = metaDimensionOrder(standards);
  const dimMeta = parseDimensionMeta(join(skillRoot, 'dimensions'));
  let auditTotal = 0;
  let auditApplicable = 0;
  const dimensions: unknown[] = [];
  const dimNames = Object.keys(byDimension).sort(
    (a, b) => dimOrderIndex(a, dimOrder) - dimOrderIndex(b, dimOrder)
  );
  for (const dimension of dimNames) {
    const checks = byDimension[dimension];
    const score = round1(checks.reduce((s, c) => s + c.weight_awarded, 0));
    const applicable = checks
      .filter((c) => c.applies)
      .reduce((s, c) => s + c.weight_max, 0);
    auditTotal = round1(auditTotal + score);
    auditApplicable += applicable;
    const sourcesUsed = [
      ...new Set(checks.filter((c) => c.applies).flatMap((c) => c.sources)),
    ].sort();
    const meta = dimMeta.get(dimension);
    const dim = {
      dimension,
      date,
      order: dimOrderIndex(dimension, dimOrder),
      ...(meta?.title ? { title: meta.title } : {}),
      ...(meta?.description ? { description: meta.description } : {}),
      score,
      coverage: applicable > 0 ? score / applicable : 0,
      checks,
      sources_used: sourcesUsed,
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

  // Standards provenance for the report: the date the standard was last
  // verified (max last_verified across categories — the coverage headline
  // cites it) and the active-contributor threshold (interpolated into the
  // Reach tooltip so prose never drifts from the data).
  const standardsDate = Object.values(cats)
    .map((c) => c.last_verified ?? '')
    .filter(Boolean)
    .sort()
    .pop();
  const standardsMeta = {
    ...(standardsDate ? { standards_date: standardsDate } : {}),
    active_contributor_threshold: metaNumber(
      standards,
      'active_contributor_threshold',
      ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT
    ),
  };

  const audit: Record<string, unknown> = {
    date,
    project: basename(repoPath),
    audit_total: auditTotal,
    coverage: auditApplicable > 0 ? auditTotal / auditApplicable : 0,
    standards_meta: standardsMeta,
    dimensions,
    sources,
    linked_repos: linkedRepos,
    tech_stack: techStack,
    detection_conflicts: detectionConflicts,
  };
  if (Object.keys(sourceWindows).length > 0)
    audit.source_windows = sourceWindows;
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
    // Re-derive weight_awarded from score (Correction 3) so orchestrator-patched
    // checks that carry an explicit score re-sum correctly. The orchestrator's
    // patches are untrusted input: a score outside [0,1] is clamped (a raw
    // weight written into `score` must not inflate the audit total), and a
    // patch that set status without a score falls back to weight_awarded /
    // status so the patched credit isn't silently zeroed. `score` is written
    // back so the artifact never carries a score that disagrees with its
    // status.
    for (const c of checks) {
      c.applies = c.status !== 'SKIP';
      let s: number;
      if (c.status === 'SKIP') {
        s = 0;
      } else if (typeof c.score === 'number' && c.score > 0) {
        s = c.score;
      } else if (
        ['PASS', 'WARN', 'PARTIAL'].includes(c.status) &&
        (c.weight_max || 0) > 0 &&
        (c.weight_awarded || 0) > 0
      ) {
        s = c.weight_awarded / c.weight_max;
      } else {
        s = c.status === 'PASS' ? 1 : c.status === 'WARN' ? 0.5 : 0;
      }
      if (s < 0 || s > 1) {
        process.stderr.write(
          `aggregate: ${c.check_id} score ${s} out of [0,1] — clamped (bad judgment/connector patch?)\n`
        );
        s = Math.min(1, Math.max(0, s));
      }
      c.score = s;
      c.weight_awarded = Math.round((c.weight_max || 0) * s * 10) / 10;
    }
    const score = round1(
      checks.reduce((s, c) => s + (c.weight_awarded || 0), 0)
    );
    const appl = checks
      .filter((c) => c.applies)
      .reduce((s, c) => s + (c.weight_max || 0), 0);
    dim.score = score;
    dim.coverage = appl > 0 ? score / appl : 0;
    // Re-derive sources_used: union of sources across applicable checks.
    dim.sources_used = [
      ...new Set(
        checks
          .filter((c) => c.applies)
          .flatMap((c) => (c.sources ?? []) as string[])
      ),
    ].sort();
    writeFileSync(join(outDir, f), JSON.stringify(dim, null, 2));
    total = round1(total + score);
    applicable += appl;
    dimensions.push(dim);
  }
  // Restore the presentation order — readdirSync is alphabetical, but each
  // per-dimension JSON carries the `order` index audit-core stamped on it.
  dimensions.sort((a, b) => {
    const ao = typeof a.order === 'number' ? (a.order as number) : 999;
    const bo = typeof b.order === 'number' ? (b.order as number) : 999;
    return ao - bo || String(a.dimension).localeCompare(String(b.dimension));
  });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf8'));
  } catch {
    /* no prior audit.json */
  }

  // Re-derive sources and source_windows from collected/ artifacts.
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

  const derivedSourceWindows: Record<
    string,
    { days: number | null; label: string }
  > = {};
  for (const src of COLLECTOR_SOURCES) {
    try {
      const art = JSON.parse(
        readFileSync(join(collectedDirAgg, `${src}.json`), 'utf8')
      );
      const p = (art.period ?? {}) as Record<string, unknown>;
      const days: number | null =
        (p.lookback_days as number | undefined) ??
        (p.history_available_days as number | undefined) ??
        null;
      const label =
        (p.source_label as string | undefined) ??
        SOURCE_LABEL_DEFAULTS[src] ??
        src;
      derivedSourceWindows[src] = { days, label };
    } catch {
      /* artifact absent */
    }
  }

  const audit: Record<string, unknown> = {
    date: existing.date ?? new Date().toISOString().slice(0, 10),
    project: existing.project ?? basename(outDir),
    audit_total: round1(total),
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
    'standards_meta',
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
  // Same fallback logic for source_windows.
  if (Object.keys(derivedSourceWindows).length > 0) {
    audit.source_windows = derivedSourceWindows;
  } else if (existing.source_windows !== undefined) {
    audit.source_windows = existing.source_windows;
  }
  writeFileSync(join(outDir, 'audit.json'), JSON.stringify(audit, null, 2));
}

export interface JudgmentPatch {
  check_id: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  /** Fraction of capability present ∈ [0,1]; defaults from status (PASS=1, WARN=0.5, else 0). */
  score?: number;
  value?: unknown;
  evidence?: string[];
}

/**
 * Apply the orchestrator's judgment verdicts to the per-dimension JSONs in ONE
 * call, then re-aggregate. Replaces the per-check JSON surgery the model used
 * to do by hand (dozens of serial shell edits — the dominant wall-clock cost
 * of Step 6). Only `method: "judgment"` checks are patchable; anything else is
 * reported and left untouched. Returns a summary for the caller to print.
 */
export function patchJudgments(
  outDir: string,
  patches: JudgmentPatch[]
): { patched: string[]; warnings: string[] } {
  const patched: string[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, JudgmentPatch>();
  for (const p of patches) {
    if (!p || typeof p.check_id !== 'string' || typeof p.status !== 'string') {
      warnings.push(`malformed patch skipped: ${JSON.stringify(p)}`);
      continue;
    }
    byId.set(p.check_id, p);
  }

  const files = readdirSync(outDir).filter(
    (f) =>
      f.endsWith('.json') && f !== 'audit.json' && f !== 'org-portfolio.json'
  );
  for (const f of files) {
    let dim: Record<string, unknown>;
    try {
      dim = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
    } catch {
      continue;
    }
    const checks = dim.checks as CheckRecord[] | undefined;
    if (!Array.isArray(checks)) continue;
    let changed = false;
    for (const c of checks) {
      const p = byId.get(c.check_id);
      if (!p) continue;
      byId.delete(c.check_id);
      if (c.method !== 'judgment') {
        warnings.push(
          `${c.check_id} is method "${c.method}", not judgment — left untouched (connector checks are re-scored by enrich)`
        );
        continue;
      }
      const statusDefault =
        p.status === 'PASS' ? 1 : p.status === 'WARN' ? 0.5 : 0;
      let s = typeof p.score === 'number' ? p.score : statusDefault;
      if (s < 0 || s > 1) {
        warnings.push(
          `${c.check_id}: score ${s} out of [0,1] — clamped (pass a fraction, not a weight)`
        );
        s = Math.min(1, Math.max(0, s));
      }
      if (p.status === 'SKIP') s = 0;
      c.status = p.status;
      c.score = s;
      c.confidence = p.status === 'SKIP' ? 0 : 1;
      c.applies = p.status !== 'SKIP';
      c.weight_awarded = Math.round((c.weight_max || 0) * s * 10) / 10;
      if (p.value !== undefined) c.value = p.value;
      if (Array.isArray(p.evidence)) c.evidence = p.evidence;
      changed = true;
      patched.push(c.check_id);
    }
    if (changed) {
      writeFileSync(join(outDir, f), JSON.stringify(dim, null, 2));
    }
  }
  for (const id of byId.keys()) {
    warnings.push(`${id}: no such check in any dimension artifact — ignored`);
  }

  aggregate(outDir);
  return { patched, warnings };
}

/** Presentation order from standards.toml [meta].dimension_order (empty when absent). */
function metaDimensionOrder(standards: Record<string, unknown>): string[] {
  const meta = standards['meta'] as Record<string, unknown> | undefined;
  const order = meta?.['dimension_order'];
  return Array.isArray(order) ? order.map(String) : [];
}

/** Index of a dimension in the presentation order; unknown dimensions sort last, alphabetically. */
function dimOrderIndex(dimension: string, order: string[]): number {
  const i = order.indexOf(dimension);
  return i === -1 ? order.length : i;
}

/**
 * Parse `title:` and `description:` from every dimensions/*.md frontmatter,
 * keyed by the `name:` field. The description becomes the dimension tooltip in
 * the report. Handles plain values and `>-` folded scalars (single level).
 */
export function parseDimensionMeta(
  dimensionsDir: string
): Map<string, { title?: string; description?: string }> {
  const map = new Map<string, { title?: string; description?: string }>();
  let files: string[];
  try {
    files = readdirSync(dimensionsDir).filter((f) => f.endsWith('.md'));
  } catch {
    return map;
  }
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(dimensionsDir, file), 'utf8');
    } catch {
      continue;
    }
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const lines = fm[1].split('\n');
    const fields: Record<string, string> = {};
    for (let i = 0; i < lines.length; i++) {
      const kv = lines[i].match(/^(name|title|description):\s*(.*)$/);
      if (!kv) continue;
      let value = kv[2].trim();
      if (value === '>-' || value === '>' || value === '') {
        // folded scalar: join the following more-indented lines with spaces
        const parts: string[] = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
          parts.push(lines[++i].trim());
        }
        value = parts.join(' ');
      }
      fields[kv[1]] = value;
    }
    if (fields.name) {
      map.set(fields.name, {
        title: fields.title,
        description: fields.description,
      });
    }
  }
  return map;
}

export function parseCheckIds(dimensionsDir: string): Map<number, string> {
  const map = new Map<number, string>();
  let files: string[];
  try {
    files = readdirSync(dimensionsDir).filter((f) => f.endsWith('.md'));
  } catch {
    return map;
  }
  // Prefix may contain digits after the first letter (E2E-01, E2ED-01).
  const headingRe = /^###\s+([A-Z][A-Z0-9]*-\d+)\s*:/;
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

/**
 * Human-readable reason for a SKIP, shown in the report's evidence column so a
 * skipped check never renders as a bare "—". Prefers naming the missing data
 * source (actionable); falls back to the applies_when condition.
 */
/** Sources a user can actually connect. `audit` (source code) and `scale` are
 * pseudo-sources the engine always has — telling a reader to "connect a audit
 * source" for a topology-gated check was misleading noise. */
const CONNECTABLE_SOURCES = new Set(['tracker', 'docs', 'ci', 'incident']);

function buildSkipReason(c: Category, topology: TopologyFlags): string {
  // Applicability wins: "this check doesn't apply to this repo" is the truth
  // even when the check also lists a connector source.
  if (appliesGatedOff(c, topology) && c.applies_when) {
    return `Not applicable — "${c.applies_when}" is false for this repository.`;
  }
  const connectable = (c.sources ?? []).filter((s) =>
    CONNECTABLE_SOURCES.has(s)
  );
  if (connectable.length > 0) {
    const label = connectable.join('/');
    const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
    return `No ${label} data available — connect ${article} ${label} source (connector or config) to score this check.`;
  }
  return 'Skipped — the required data was not available.';
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
  metricMeta?: Map<
    number,
    {
      unit?: string;
      expression?: string;
      value?: unknown;
      evidence?: string[];
      score?: number;
      confidence?: number;
      note?: string | null;
    }
  >
): CheckRecord {
  let status: string;
  let value: unknown = null;
  let evidence: string[] = [];
  let unit: string | undefined;
  let expression: string | undefined;
  let score = 0;
  let confidence = 0;

  if (appliesGatedOff(c, topology)) {
    // applies_when topology flag is false → category does not apply.
    // A human-readable reason is filled into `evidence` below (see skip-reason block).
    status = 'SKIP';
    // score=0, confidence=0 (already initialised)
  } else if (c.method === 'judgment') {
    status = 'PENDING_JUDGMENT';
    // score=0, confidence=0 until the orchestrator patches this check
  } else if (detectors[c.code] !== undefined) {
    // Detector branch: take status/score/confidence straight from DetectorResult.
    // Pass the category's threshold fields so detectors can read from standards.toml
    // instead of hardcoding threshold values.
    let r: DetectorResult;
    try {
      r = detectors[c.code](repoPath, {
        threshold: c.threshold,
        threshold_days: c.threshold_days,
      });
    } catch (err) {
      r = {
        status: 'FAIL',
        value: `detector-error: ${String(err)}`,
        evidence: [],
        method: c.method,
        score: 0,
        confidence: 1,
      };
    }
    status = r.status;
    value = r.value;
    evidence = r.evidence;
    score = r.score;
    confidence = r.confidence;
  } else {
    // Metric-routed branch (Correction 2): score is gated by applicability —
    // only an AWARDED (PASS) code carries the metric's continuous score.
    let baseStatus: string;
    if (awarded.has(c.code)) baseStatus = 'PASS';
    else if (skippedByMetric.has(c.code)) baseStatus = 'SKIP';
    else baseStatus = 'FAIL';
    const meta = metricMeta?.get(c.code);
    if (meta) {
      unit = meta.unit;
      expression = meta.expression;
      value = meta.value ?? value;
      if (evidence.length === 0 && meta.evidence) evidence = meta.evidence;
    }

    if (baseStatus === 'SKIP') {
      score = 0;
      confidence = 0;
    } else if (baseStatus === 'FAIL') {
      score = 0;
      confidence = meta?.confidence ?? 1;
    } else {
      // awarded
      score = meta?.score ?? 1; // continuous metric score; default 1 (binary-present)
      confidence = meta?.confidence ?? 1;
    }

    // Derive the display badge from the score for awarded continuous metrics:
    if (baseStatus === 'PASS') {
      status = score >= 0.999 ? 'PASS' : score <= 0.001 ? 'FAIL' : 'PARTIAL';
    } else {
      status = baseStatus; // SKIP / FAIL unchanged
    }
  }

  // Weight-0 categories are informational descriptors: they carry a value but
  // no judgment, so a PASS/FAIL/PARTIAL badge would misread as an assessment.
  // INFO replaces any evaluated status (SKIP keeps its meaning).
  if (c.weight === 0 && status !== 'SKIP' && status !== 'PENDING_JUDGMENT') {
    status = 'INFO';
  }

  // A SKIP with no evidence renders as a bare "—"; give the reader a reason
  // why — preferring the metric's own reliability note (e.g. "squash-merge
  // workflow: no branch merge records…") over the generic source fallback.
  if (status === 'SKIP' && evidence.length === 0) {
    const metricNote = metricMeta?.get(c.code)?.note;
    evidence = [metricNote || buildSkipReason(c, topology)];
  }

  const applies = status !== 'SKIP';
  const weightAwarded = Math.round(c.weight * score * 10) / 10;
  const source_date = c.date ?? null;
  const source_url = c.url ?? null;
  const hintDate = source_date ?? '';
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
    hint: `${c.definition ?? ''} · ${c.method} · ${c.source ?? ''}${hintDate ? ` (${hintDate})` : ''}`,
    // Inline lead: prefer a concise `summary`, fall back to the full definition.
    // The verbose `definition` still renders in the HTML tooltip regardless.
    plain: c.summary ?? c.definition ?? '',
    score,
    confidence,
    source_date,
    source_url,
    last_verified: c.last_verified ?? null,
    sources: c.sources ?? [],
  };
  if (unit !== undefined) rec.unit = unit;
  if (expression !== undefined) rec.expression = expression;
  return rec;
}
