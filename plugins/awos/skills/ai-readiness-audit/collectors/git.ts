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

function run(args: string[], cwd: string): string {
  try {
    // maxBuffer defaults to 1 MB; a full `git log` on a large/long-lived repo
    // easily exceeds that, which would throw ENOBUFS and silently return ''
    // (zeroing out window_stats and numstat_totals). Raise the cap.
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch {
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

// ---------------------------------------------------------------------------
// Individual fact collectors
// ---------------------------------------------------------------------------

function getDefaultBranch(cwd: string): string {
  const out = run(['symbolic-ref', '--short', 'HEAD'], cwd).trim();
  return out || 'main';
}

function getTotalCommits(cwd: string): number {
  const out = run(['rev-list', '--count', 'HEAD'], cwd).trim();
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
    const sideOut = run(['log', '--format=%cI', `${sha}^1..${sha}^2`], cwd)
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
  authors_total: number;
  per_author: AuthorRow[];
}

function buildWindowStats(cwd: string, period: Period): WindowStats {
  const windowDays = period.lookback_days;
  const empty: WindowStats = {
    window_days: windowDays,
    commits: 0,
    merges: 0,
    authors_total: 0,
    per_author: [],
  };

  // Anchor to the newest commit date — no wall-clock dependency.
  const latestDateStr = run(
    ['log', '--all', '--format=%cI', '--max-count=1'],
    cwd
  ).trim();
  if (!latestDateStr) return empty;
  const latestCommitDate = parseDate(latestDateStr);
  if (isNaN(latestCommitDate.getTime())) return empty;

  const since = new Date(
    latestCommitDate.getTime() - windowDays * 86_400_000
  ).toISOString();

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

  return {
    window_days: windowDays,
    commits: totalCommits,
    merges: totalMerges,
    authors_total: allAuthors.size,
    per_author: perAuthor,
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
  };

  return makeArtifact(
    'git',
    true,
    null,
    { ...period, history_available_days },
    raw
  );
}
