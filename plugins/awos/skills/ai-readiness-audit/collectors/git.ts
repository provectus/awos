import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeArtifact, type Period } from './_base.ts';

// ---------------------------------------------------------------------------
// Shell helper
// ---------------------------------------------------------------------------

function run(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
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

/** Return number of lines of output (trimmed), or 0 when empty. */
function countLines(out: string): number {
  const t = out.trim();
  if (!t) return 0;
  return t.split('\n').length;
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

/** Count commits that carry Co-authored-by: Claude/assistant trailers. */
function getAiMarkedCommits(cwd: string): number {
  const patterns = [
    'Co-authored-by: Claude',
    'Co-authored-by:.*[Aa]ssistant',
    'Co-authored-by:.*claude@anthropic',
  ];
  const matchedSHAs = new Set<string>();
  for (const pat of patterns) {
    const out = run(
      [
        'log',
        '--all-match',
        '--regexp-ignore-case',
        `--grep=${pat}`,
        '--format=%H',
      ],
      cwd
    );
    for (const sha of out.trim().split('\n').filter(Boolean)) {
      matchedSHAs.add(sha);
    }
  }
  return matchedSHAs.size;
}

/** Paths that indicate AI tooling configuration in the repo. */
const TOOLING_CANDIDATES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.claude/skills',
  '.claude/commands',
  '.claude/hooks',
  '.mcp.json',
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

    // Identify the commits on the merged-in side (second parent..merge).
    const rangeOut = run(
      ['log', '--format=%cI', `${sha}^2..${sha}^2`, '--first-parent'],
      cwd
    );
    // Simpler: get all commits reachable from MERGE_HEAD (^2) but not from first parent.
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
// Monthly buckets
// ---------------------------------------------------------------------------

interface Bucket {
  bucket_start: string;
  authors: number;
  commits: number;
  merges: number;
}

function buildMonthlyBuckets(cwd: string, period: Period): Bucket[] {
  // Fetch all commits within lookback window: sha, author, date, is-merge.
  // We use --format="%H %aN %cI %P" — P lists parent SHAs (2+ = merge).
  const lookback = period.lookback_days;
  const since = new Date(Date.now() - lookback * 86_400_000).toISOString();

  const logOut = run(
    ['log', '--all', `--since=${since}`, '--format=%H\t%aN\t%cI\t%P'],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  if (logOut.length === 0) return [];

  interface CommitRow {
    sha: string;
    author: string;
    date: Date;
    isMerge: boolean;
  }

  const rows: CommitRow[] = [];
  for (const line of logOut) {
    const parts = line.split('\t');
    const [sha, author, dateStr, parents = ''] = parts;
    if (!sha || !author || !dateStr) continue;
    const date = parseDate(dateStr);
    if (isNaN(date.getTime())) continue;
    rows.push({
      sha,
      author,
      date,
      isMerge: parents.trim().split(' ').length > 1,
    });
  }

  if (rows.length === 0) return [];

  // Determine the date range for bucketing.
  const newest = new Date(Math.max(...rows.map((r) => r.date.getTime())));
  const oldest = new Date(Math.min(...rows.map((r) => r.date.getTime())));

  // Build bucket boundaries from newest backwards.
  const bucketMs = period.bucket_days * 86_400_000;
  const buckets: Bucket[] = [];

  let bucketEnd = newest;
  // Work backwards until we cover oldest.
  while (bucketEnd >= oldest) {
    const bucketStart = new Date(bucketEnd.getTime() - bucketMs);
    const inBucket = rows.filter(
      (r) => r.date > bucketStart && r.date <= bucketEnd
    );
    if (inBucket.length > 0) {
      const authors = new Set(inBucket.map((r) => r.author)).size;
      buckets.push({
        bucket_start: bucketStart.toISOString(),
        authors,
        commits: inBucket.length,
        merges: inBucket.filter((r) => r.isMerge).length,
      });
    }
    bucketEnd = bucketStart;
  }

  // Return in ascending chronological order.
  return buckets.reverse();
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
  monthly_buckets: Bucket[];
  numstat_totals: NumstatTotals;
}

export function collect(repoPath: string, period: Period) {
  const default_branch = getDefaultBranch(repoPath);
  const total_commits = getTotalCommits(repoPath);
  const ai_marked_commits = getAiMarkedCommits(repoPath);
  const tooling_paths = getToolingPaths(repoPath);
  const { total_merges, revert_merges } = getMergeStats(repoPath);
  const merge_records = getMergeRecords(repoPath);
  const monthly_buckets = buildMonthlyBuckets(repoPath, period);
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
    monthly_buckets,
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
