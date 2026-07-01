import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeArtifact, type Period } from './_base.ts';
import {
  ALL_COMMIT_ATTRIBUTION,
  ALL_TOOL_CONFIG_DIRS,
  ALL_INSTRUCTION_FILES,
  ALL_RULE_COMMAND_DIRS,
  ALL_SKILL_DIRS,
  ALL_HOOK_PATHS,
  ALL_MCP_CONFIG_PATHS,
} from '../agent_tools.ts';

// ---------------------------------------------------------------------------
// Shell helper
// ---------------------------------------------------------------------------

/**
 * Run a git subcommand and return its stdout as a string.
 *
 * `allowFailure` signals that the call is expected to fail on certain valid
 * repo states (e.g. `symbolic-ref --short HEAD` on a detached HEAD, or a
 * `^1..^2` rev-range on a root/octopus merge). When true, a non-zero exit
 * is silently swallowed and `''` is returned. When false (the default), an
 * unexpected failure emits a one-line stderr breadcrumb naming the subcommand
 * and the error code so the failure is traceable in logs — the collector still
 * returns `''` and degrades gracefully rather than throwing.
 *
 * Exported so the allowFailure contract can be unit-tested directly.
 */
export function run(
  args: string[],
  cwd: string,
  { allowFailure = false }: { allowFailure?: boolean } = {}
): string {
  try {
    // maxBuffer defaults to 1 MB; a full `git log` on a large/long-lived repo
    // easily exceeds that, which would throw ENOBUFS and silently return ''
    // (zeroing out window_stats and numstat_totals). Raise the cap.
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      // stdio: 'pipe' captures git's own stderr so it does not bleed to the
      // parent process's stderr on failure. Stdout is still returned as a
      // string (the execFileSync contract with encoding:'utf8').
      stdio: 'pipe',
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch (err) {
    if (allowFailure) return '';
    const status = (err as { status?: number }).status;
    const code = (err as { code?: string }).code;
    console.error(
      `[git collector] git ${args[0]} failed: ${status ?? code ?? 'error'}`
    );
    return '';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a git log date string (ISO 8601 or unix ts) to a Date. */
function parseDate(s: string): Date {
  return new Date(s.trim());
}

/** Difference between two dates in whole days (d2 - d1). */
function daysBetween(d1: Date, d2: Date): number {
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

/**
 * Newest commit date across all refs, or null on an empty repo / git failure.
 * Anchoring windows to this (not wall-clock) keeps audits reproducible.
 */
function latestCommitDate(cwd: string): Date | null {
  const latestStr = run(
    ['log', '--all', '--format=%cI', '--max-count=1'],
    cwd
  ).trim();
  if (!latestStr) return null;
  const d = parseDate(latestStr);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Individual fact collectors
// ---------------------------------------------------------------------------

function getDefaultBranch(cwd: string): string {
  // symbolic-ref exits non-zero on a detached HEAD — that is a valid repo state,
  // so allowFailure prevents a spurious breadcrumb; '' correctly falls back to 'main'.
  const out = run(['symbolic-ref', '--short', 'HEAD'], cwd, {
    allowFailure: true,
  }).trim();
  return out || 'main';
}

function getTotalCommits(cwd: string): number {
  // rev-list --count HEAD exits non-zero on an empty repo (no HEAD ref yet),
  // which is a valid state — allowFailure keeps the output clean; '' parses to 0.
  const out = run(['rev-list', '--count', 'HEAD'], cwd, {
    allowFailure: true,
  }).trim();
  const n = parseInt(out, 10);
  return isNaN(n) ? 0 : n;
}

/** Count commits that carry AI agent attribution trailers (any supported tool). */
function getAiMarkedCommits(cwd: string): number {
  const matchedSHAs = new Set<string>();
  for (const pat of ALL_COMMIT_ATTRIBUTION) {
    const out = run(
      ['log', '--regexp-ignore-case', `--grep=${pat.source}`, '--format=%H'],
      cwd
    );
    for (const sha of out.trim().split('\n').filter(Boolean)) {
      matchedSHAs.add(sha);
    }
  }
  return matchedSHAs.size;
}

/** Paths that indicate AI tooling configuration in the repo — full union across all supported tools. */
const TOOLING_CANDIDATES = [
  ...new Set([
    ...ALL_INSTRUCTION_FILES,
    ...ALL_RULE_COMMAND_DIRS,
    ...ALL_SKILL_DIRS,
    ...ALL_HOOK_PATHS,
    ...ALL_MCP_CONFIG_PATHS,
    ...ALL_TOOL_CONFIG_DIRS,
    // Spec-driven adoption signals (ADP-G1 code 106).
    'context/spec',
    'context',
    '.awos',
  ]),
];

function getToolingPaths(repoPath: string): string[] {
  return TOOLING_CANDIDATES.filter((p) => existsSync(join(repoPath, p)));
}

interface MergeStats {
  total_merges: number;
  revert_merges: number;
}

function getMergeStats(cwd: string): MergeStats {
  const allMerges = run(
    ['log', '--first-parent', '--merges', '--format=%H'],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const total_merges = allMerges.length;

  const revertOut = run(
    [
      'log',
      '--first-parent',
      '--merges',
      '--grep=^Revert\\|hotfix\\|rollback',
      '--format=%H',
    ],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const revert_merges = revertOut.length;

  return { total_merges, revert_merges };
}

interface MergeRecord {
  merged_at: string;
  branch_first_commit_at: string;
}

function getMergeRecords(cwd: string): MergeRecord[] {
  // Get first-parent merge commits with their dates.
  const mergeOut = run(
    ['log', '--first-parent', '--merges', '--format=%H %cI'],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  const records: MergeRecord[] = [];
  for (const line of mergeOut) {
    const [sha, mergedAt] = line.split(' ');
    if (!sha || !mergedAt) continue;

    // Get all commits reachable from MERGE_HEAD (^2) but not from first parent.
    // allowFailure: a root commit has no ^1, and an octopus merge's ^2 may not
    // exist — both are valid repo states where this rev-range legitimately fails.
    const sideOut = run(['log', '--format=%cI', `${sha}^1..${sha}^2`], cwd, {
      allowFailure: true,
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    if (sideOut.length === 0) continue;

    // Earliest commit on the merged-in branch.
    const dates = sideOut
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));
    if (dates.length === 0) continue;
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));

    records.push({
      merged_at: mergedAt,
      branch_first_commit_at: earliest.toISOString(),
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Window stats (single 90-day aggregate, replaces monthly_buckets)
// ---------------------------------------------------------------------------

export interface AuthorRow {
  author: string;
  commits: number;
  merges: number;
  lines: number;
}

export interface WindowStats {
  window_days: number;
  commits: number;
  merges: number;
  /** First-parent merges in the window whose subject matches revert/hotfix/rollback keywords. */
  revert_merges: number;
  /**
   * First-parent merges in the window whose subject matches fix/bugfix/hotfix/patch/defect/regression
   * keywords (case-insensitive). Used by adp_g14_rework_rate (DORA deployment rework rate proxy).
   *
   * Note: `hotfix` intentionally overlaps with revert_merges. That is inherent to message-keyword
   * proxies — revert_merges measures change-failure (DORA g7) and fix_merges measures rework rate
   * (DORA g14); they are different metrics with different denominators and bands.
   */
  fix_merges: number;
  authors_total: number;
  per_author: AuthorRow[];
  /** Merges divided by active-contributor count; null when activeCount is 0. Display-only. */
  merges_per_active: number | null;
  /** Total LOC (added + deleted) divided by active-contributor count; null when activeCount is 0. Display-only. */
  loc_per_active: number | null;
  /** ISO 8601 timestamp of the window anchor minus lookback_days (the oldest commit included).
   * Used by adp_g4_lead_time to filter merge_records to the same window. Null on empty repos. */
  window_start: string | null;
}

/**
 * Framework default for the active-contributor exclusion threshold.
 * Mirrors meta.active_contributor_threshold in standards.toml (default 0.1 = 10 %).
 * Single source of truth — adp_g2_contributors and display-only ratios both use this.
 */
export const ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT = 0.1;

/**
 * Framework default for the code-turnover rework horizon, in days.
 * Mirrors meta.rework_horizon_days in standards.toml (default 21).
 * A line deleted within this many days of being authored counts as "reworked".
 */
export const REWORK_HORIZON_DAYS_DEFAULT = 21;

/**
 * Active-contributor filter (locked rule — Phase 2 ratios reuse this).
 *
 * An author is excluded iff their merge-share AND LOC-share are both strictly
 * below threshold T.  T is configurable via meta.active_contributor_threshold
 * in standards.toml (default 0.1 = 10 %).
 *
 * @param perAuthor - author rows from window_stats.per_author
 * @param T         - exclusion threshold (0 < T ≤ 1)
 */
export function activeContributors(perAuthor: AuthorRow[], T: number): number {
  const tm = perAuthor.reduce((s, a) => s + a.merges, 0) || 1;
  const tl = perAuthor.reduce((s, a) => s + a.lines, 0) || 1;
  return perAuthor.filter((a) => !(a.merges / tm < T && a.lines / tl < T))
    .length;
}

function buildWindowStats(cwd: string, period: Period): WindowStats {
  const windowDays = period.lookback_days;
  const empty: WindowStats = {
    window_days: windowDays,
    commits: 0,
    merges: 0,
    revert_merges: 0,
    fix_merges: 0,
    authors_total: 0,
    per_author: [],
    merges_per_active: null,
    loc_per_active: null,
    window_start: null,
  };

  // Anchor to the newest commit date — no wall-clock dependency.
  const latest = latestCommitDate(cwd);
  if (!latest) return empty;

  const since = new Date(
    latest.getTime() - windowDays * 86_400_000
  ).toISOString();

  // 0a. In-window revert/hotfix/rollback merges — bounded to the same window as the rest.
  const revertOut = run(
    [
      'log',
      '--first-parent',
      '--merges',
      '--grep=^Revert\\|hotfix\\|rollback',
      `--since=${since}`,
      '--format=%H',
    ],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const revert_merges = revertOut.length;

  // 0b. In-window fix/bugfix/hotfix/patch/defect/regression merges — used by adp_g14_rework_rate
  //     (DORA deployment rework rate proxy). Distinct from revert_merges above: both grep for
  //     "hotfix" by design — they measure different DORA metrics (change-failure vs. rework rate).
  const fixOut = run(
    [
      'log',
      '--first-parent',
      '--merges',
      '--grep=fix\\|bugfix\\|hotfix\\|patch\\|defect\\|regression',
      '--regexp-ignore-case',
      `--since=${since}`,
      '--format=%H',
    ],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const fix_merges = fixOut.length;

  // 1. Non-merge commits — derive per-author commit counts and line churn.
  //    Format: one "%H\t%aN" header line per commit, then numstat lines.
  const numstatOut = run(
    [
      'log',
      '--all',
      `--since=${since}`,
      '--no-merges',
      '--numstat',
      '--format=%H\t%aN',
    ],
    cwd
  );

  interface AuthorEntry {
    commits: number;
    lines: number;
  }
  const authorMap = new Map<string, AuthorEntry>();
  let currentAuthor = '';

  for (const line of numstatOut.split('\n')) {
    // Commit header: full 40-char SHA, tab, author name.
    const commitMatch = line.match(/^[0-9a-f]{40}\t(.+)$/);
    if (commitMatch) {
      currentAuthor = commitMatch[1].trim();
      const entry = authorMap.get(currentAuthor) ?? { commits: 0, lines: 0 };
      entry.commits++;
      authorMap.set(currentAuthor, entry);
      continue;
    }
    // Numstat line: <added>\t<deleted>\t<path>  (skip binary "-\t-\t" lines).
    const numstatMatch = line.match(/^(\d+)\t(\d+)\t/);
    if (numstatMatch && currentAuthor) {
      const entry = authorMap.get(currentAuthor)!;
      entry.lines +=
        parseInt(numstatMatch[1], 10) + parseInt(numstatMatch[2], 10);
    }
  }

  // 2. First-parent merges — derive per-author merge counts and total.
  const mergeOut = run(
    ['log', '--first-parent', '--merges', `--since=${since}`, '--format=%aN'],
    cwd
  );

  const mergeAuthors = mergeOut.trim().split('\n').filter(Boolean);
  const mergeMap = new Map<string, number>();
  for (const author of mergeAuthors) {
    mergeMap.set(author, (mergeMap.get(author) ?? 0) + 1);
  }
  const totalMerges = mergeAuthors.length;

  // 3. Combine into per_author rows.
  const allAuthors = new Set([...authorMap.keys(), ...mergeMap.keys()]);
  const perAuthor: AuthorRow[] = Array.from(allAuthors).map((author) => ({
    author,
    commits: authorMap.get(author)?.commits ?? 0,
    merges: mergeMap.get(author) ?? 0,
    lines: authorMap.get(author)?.lines ?? 0,
  }));

  const totalCommits = Array.from(authorMap.values()).reduce(
    (s, e) => s + e.commits,
    0
  );

  const activeCount = activeContributors(
    perAuthor,
    ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT
  );
  const totalLines = perAuthor.reduce((s, a) => s + a.lines, 0);
  const merges_per_active = activeCount > 0 ? totalMerges / activeCount : null;
  const loc_per_active = activeCount > 0 ? totalLines / activeCount : null;

  return {
    window_days: windowDays,
    commits: totalCommits,
    merges: totalMerges,
    revert_merges,
    fix_merges,
    authors_total: allAuthors.size,
    per_author: perAuthor,
    merges_per_active,
    loc_per_active,
    window_start: since,
  };
}

// ---------------------------------------------------------------------------
// numstat totals
// ---------------------------------------------------------------------------

interface NumstatTotals {
  added: number;
  deleted: number;
}

function getNumstatTotals(cwd: string): NumstatTotals {
  const out = run(['log', '--numstat', '--format='], cwd);
  let added = 0;
  let deleted = 0;
  for (const line of out.split('\n')) {
    const m = line.match(/^(\d+)\s+(\d+)\s+/);
    if (m) {
      added += parseInt(m[1], 10);
      deleted += parseInt(m[2], 10);
    }
  }
  return { added, deleted };
}

// ---------------------------------------------------------------------------
// Code turnover (windowed, directional rework ratio)
// ---------------------------------------------------------------------------

export interface CodeTurnover {
  reworked_lines: number;
  total_added: number;
  /** reworked_lines / total_added; null when total_added is 0. */
  ratio: number | null;
}

/**
 * Code turnover ≈ (lines added then deleted within the rework horizon) ÷
 * (lines added), measured over the lookback window.
 *
 * Approximation: git numstat reports per-file (added, deleted) COUNTS, never
 * line identity, so the true authored-age of a deleted line is unknowable
 * cheaply. We approximate it with a single oldest→newest replay maintaining a
 * per-file FIFO pool of recent additions ("recently authored, not yet
 * removed"). A deletion consumes the oldest still-in-horizon pooled lines for
 * that file; consumed lines whose deletion lands in the window count as
 * reworked. Deletions of lines older than the horizon (or of foreign/unpooled
 * lines) are deliberately NOT rework. The pool is pruned by horizon each commit,
 * so the walk stays bounded and single-pass.
 *
 * The replay starts `horizon` days BEFORE the window so an in-window deletion
 * can still find an addition authored just before the window opened.
 */
function getCodeTurnover(cwd: string, period: Period): CodeTurnover | null {
  const lookbackDays = period.lookback_days;
  const horizonDays = REWORK_HORIZON_DAYS_DEFAULT;

  const anchor = latestCommitDate(cwd);
  if (!anchor) return null;

  const dayMs = 86_400_000;
  const horizonMs = horizonDays * dayMs;
  const windowStartMs = anchor.getTime() - lookbackDays * dayMs;
  const replayStartMs = windowStartMs - horizonMs;
  const replayStartISO = new Date(replayStartMs).toISOString();

  // Per-file FIFO pool of recent additions (oldest first), epoch-ms dated.
  interface PoolEntry {
    date: number;
    remaining: number;
  }
  const perFile = new Map<string, PoolEntry[]>();

  let reworked = 0;
  let totalAdded = 0;

  const out = run(
    [
      'log',
      '--reverse',
      '--no-merges',
      '--numstat',
      `--since=${replayStartISO}`,
      '--format=%H\t%cI',
    ],
    cwd
  );
  if (!out.trim()) return { reworked_lines: 0, total_added: 0, ratio: null };

  let currentDate = 0; // epoch ms of the commit currently being parsed
  for (const line of out.split('\n')) {
    // Commit header: "<40-hex SHA>\t<ISO commit date>".
    const header = line.match(/^[0-9a-f]{40}\t(.+)$/);
    if (header) {
      const d = parseDate(header[1]);
      currentDate = isNaN(d.getTime()) ? 0 : d.getTime();
      continue;
    }
    // Numstat row: "<added>\t<deleted>\t<path>"; skip binary "-\t-\t" rows.
    const row = line.match(/^(\d+)\t(\d+)\t(.+)$/);
    if (!row || !currentDate) continue;
    const added = parseInt(row[1], 10);
    const deleted = parseInt(row[2], 10);
    const path = row[3];

    const pool = perFile.get(path) ?? [];
    const inWindow = currentDate >= windowStartMs;

    // (a) Deletions consume prior in-horizon additions, oldest-eligible-first.
    let toDelete = deleted;
    for (const entry of pool) {
      if (toDelete <= 0) break;
      if (entry.remaining <= 0) continue;
      // Too old to be reworked-within-horizon — leave it for pruning below.
      if (currentDate - entry.date >= horizonMs) continue;
      const consumed = Math.min(entry.remaining, toDelete);
      entry.remaining -= consumed;
      toDelete -= consumed;
      if (inWindow) reworked += consumed;
    }

    // (b) Prune exhausted and out-of-horizon entries to keep the pool bounded.
    const pruned = pool.filter(
      (e) => e.remaining > 0 && currentDate - e.date < horizonMs
    );

    // (c) Pool this commit's additions (never visible to its own deletions).
    if (added > 0) {
      pruned.push({ date: currentDate, remaining: added });
      if (inWindow) totalAdded += added;
    }

    if (pruned.length > 0) perFile.set(path, pruned);
    else perFile.delete(path);
  }

  return {
    reworked_lines: reworked,
    total_added: totalAdded,
    ratio: totalAdded > 0 ? reworked / totalAdded : null,
  };
}

// ---------------------------------------------------------------------------
// History span
// ---------------------------------------------------------------------------

function getHistoryAvailableDays(cwd: string): number {
  // Fetch all commit dates, then compute the span between earliest and latest.
  // (--reverse --max-count=1 silently gives the newest on most git builds.)
  const allDates = run(['log', '--all', '--format=%cI'], cwd)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((s) => parseDate(s))
    .filter((d) => !isNaN(d.getTime()));
  if (allDates.length < 2) return 0;
  const ts = allDates.map((d) => d.getTime());
  const earliest = new Date(Math.min(...ts));
  const latest = new Date(Math.max(...ts));
  return Math.max(0, daysBetween(earliest, latest));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GitRaw {
  default_branch: string;
  total_commits: number;
  ai_marked_commits: number;
  total_merges: number;
  revert_merges: number;
  tooling_paths: string[];
  merge_records: MergeRecord[];
  window_stats: WindowStats;
  numstat_totals: NumstatTotals;
  code_turnover: CodeTurnover | null;
}

export function collect(repoPath: string, period: Period) {
  const default_branch = getDefaultBranch(repoPath);
  const total_commits = getTotalCommits(repoPath);
  const ai_marked_commits = getAiMarkedCommits(repoPath);
  const tooling_paths = getToolingPaths(repoPath);
  const { total_merges, revert_merges } = getMergeStats(repoPath);
  const merge_records = getMergeRecords(repoPath);
  const window_stats = buildWindowStats(repoPath, period);
  const numstat_totals = getNumstatTotals(repoPath);
  const code_turnover = getCodeTurnover(repoPath, period);
  const history_available_days = getHistoryAvailableDays(repoPath);

  const raw: GitRaw = {
    default_branch,
    total_commits,
    ai_marked_commits,
    total_merges,
    revert_merges,
    tooling_paths,
    merge_records,
    window_stats,
    numstat_totals,
    code_turnover,
  };

  return makeArtifact(
    'git',
    true,
    null,
    { ...period, history_available_days },
    raw
  );
}
