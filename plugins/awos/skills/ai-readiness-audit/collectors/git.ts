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
 * Unexpected git failures recorded during the current `collect()` pass.
 * `run()` appends to this list whenever a subcommand fails in a way that
 * signals a broken environment (exit 128, missing/unexecutable git binary,
 * ENOBUFS truncation); `collect()` drains it and marks the whole artifact
 * unavailable rather than emitting confident all-zero stats.
 */
let runErrors: string[] = [];

function resetRunErrors(): void {
  runErrors = [];
}

function drainRunErrors(): string[] {
  const out = runErrors;
  runErrors = [];
  return out;
}

/**
 * Run a git subcommand and return its stdout as a string. Never throws; on
 * any failure it returns `''` and classifies the failure:
 *
 * - `allowFailure: true` marks a call that is expected to fail on certain
 *   valid repo states (e.g. `symbolic-ref --short HEAD` on a detached HEAD,
 *   or `rev-list --count HEAD` on an unborn branch). The failure is silently
 *   swallowed.
 * - Exit status 1 from a log/grep-family subcommand is treated as
 *   expected-empty (no matches) and swallowed silently, as is git's
 *   unborn-HEAD "does not have any commits yet" fatal — both are valid repo
 *   states, not environment failures.
 * - Everything else (exit 128 outside the unborn-HEAD case, a missing git
 *   binary — spawn ENOENT, EACCES, ENOBUFS output truncation) is an
 *   unexpected environment failure: a one-line `[git collector]` breadcrumb
 *   is written to stderr AND the failure is recorded so `collect()` can mark
 *   the artifact unavailable instead of scoring all-zero stats.
 *
 * Exported so the failure-classification contract can be unit-tested directly.
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
    const stderr = (err as { stderr?: unknown }).stderr;
    const stderrText = typeof stderr === 'string' ? stderr : '';
    // Expected-empty states — silent '' with no breadcrumb:
    //   - exit 1 from log/grep-family commands (no matches);
    //   - the unborn-HEAD fatal (`git log` on a branch with no commits yet),
    //     which exits 128 but is a valid repo state, not a broken environment.
    if (status === 1 && (args[0] === 'log' || args[0] === 'grep')) return '';
    if (/does not have any commits yet|bad default revision/i.test(stderrText))
      return '';
    const detail =
      code === 'ENOENT'
        ? 'git binary not found (ENOENT)'
        : String(status ?? code ?? 'error');
    const msg = `git ${args[0]} failed: ${detail}`;
    console.error(`[git collector] ${msg}`);
    runErrors.push(msg);
    return '';
  }
}

/**
 * Probe whether `repoPath` is a usable git repository. Returns `null` when it
 * is, or a human-readable reason when it is not (not a git repo, git binary
 * missing/unexecutable, path absent) — that reason becomes the artifact's
 * `reason_if_absent` so every git-derived metric SKIPs instead of scoring
 * confident all-zero stats.
 */
function probeGitRepo(cwd: string): string | null {
  if (!existsSync(cwd)) return `repo path does not exist: ${cwd}`;
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return null;
  } catch (err) {
    const e = err as { code?: string; status?: number; stderr?: unknown };
    if (e.code === 'ENOENT') return 'git binary not found on PATH';
    if (e.code === 'EACCES') return 'git binary not executable (EACCES)';
    const stderrText = typeof e.stderr === 'string' ? e.stderr : '';
    const firstLine = stderrText.split('\n')[0]?.trim() ?? '';
    return (
      firstLine ||
      `git rev-parse --git-dir failed (exit ${e.status ?? 'unknown'})`
    );
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

/**
 * Trunk-tip commit date — the window anchor. Anchoring on the trunk (not
 * `--all`) keeps one fresh local-only commit from shifting the window forward
 * and silently dropping the oldest days of real trunk merges. Callers fall
 * back to latestCommitDate() when this returns null (e.g. unborn HEAD).
 */
function trunkTipDate(cwd: string, ref: string): Date | null {
  const s = run(
    ['log', '--max-count=1', '--format=%cI', ...refArgs(ref)],
    cwd
  ).trim();
  if (!s) return null;
  const d = parseDate(s);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Trunk resolution
// ---------------------------------------------------------------------------
// The trunk every delivery metric walks is the team's SHARED branch, which a
// developer's working clone represents best via its remote-tracking ref: a
// local default branch routinely diverges from the real trunk through `git
// pull` sync-merge commits, hiding every squash-merged PR from a first-parent
// walk (observed in the wild: 6 personal pull-merges masking 220 squashed PRs,
// a 36× deployment-frequency undercount). Unpushed local commits are not
// delivered work, so the upstream ref wins even when local is merely ahead.
// No `git fetch` is ever run — the audit trusts the local remote-tracking refs
// (they refresh on both fetch and push; a never-fetched stale ref is
// undetectable offline and accepted as a documented limitation).

/** How the trunk ref was chosen; recorded in the artifact for transparency. */
export type TrunkSource =
  | 'upstream' // checked-out branch's configured @{upstream}
  | 'same-name-remote' // refs/remotes/<remote>/<branch> matching the local name
  | 'origin-head' // remote default branch (detached HEAD, e.g. CI checkouts)
  | 'local'; // no usable remote ref — walk the local checkout as before

export interface TrunkInfo {
  /** Ref every trunk walk uses: "origin/main", or the literal "HEAD" for the local fallback. */
  ref: string;
  /** Branch NAME the ref represents (the artifact's default_branch), e.g. "main". */
  branch: string;
  /** Locally checked-out branch, or null on a detached HEAD. */
  local_branch: string | null;
  source: TrunkSource;
  /** Commits on the local branch that are not on the trunk (unpushed/diverged); null when either side is missing. */
  local_ahead: number | null;
  /** Commits on the trunk that are not on the local branch; null when either side is missing. */
  local_behind: number | null;
  /** Human-readable one-liner for the report's Connections & Sources section. */
  summary: string;
}

/**
 * Revision argument for a `git log`-family walk. The local fallback uses the
 * literal 'HEAD' sentinel and gets NO explicit argument, so repos without a
 * usable remote ref keep today's implicit-HEAD behavior bit-for-bit —
 * including run()'s unborn-HEAD failure classification. Exported for
 * detectors that run their own trunk walks (e.g. SDD-04 merged-event scan).
 */
export function refArgs(ref: string): string[] {
  return ref === 'HEAD' ? [] : [ref];
}

/** True when `ref` resolves to a commit (guards dangling upstream configs). */
function refExists(cwd: string, ref: string): boolean {
  return (
    run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, {
      allowFailure: true,
    }).trim() !== ''
  );
}

/** The remote whose refs we consult: literal `origin` when present, else the sole remote. */
function pickRemote(cwd: string): string | null {
  const remotes = run(['remote'], cwd, { allowFailure: true })
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  if (remotes.includes('origin')) return 'origin';
  return remotes.length === 1 ? remotes[0] : null;
}

/** Pure formatter for TrunkInfo.summary — exported for direct unit testing. */
export function describeTrunk(t: Omit<TrunkInfo, 'summary'>): string {
  const divergence =
    t.local_ahead !== null && t.local_behind !== null
      ? `, local +${t.local_ahead}/-${t.local_behind}`
      : '';
  switch (t.source) {
    case 'upstream':
      return `trunk: ${t.ref} (upstream of checked-out ${t.local_branch}${divergence})`;
    case 'same-name-remote':
      return `trunk: ${t.ref} (remote branch matching checked-out ${t.local_branch}${divergence})`;
    case 'origin-head':
      return `trunk: ${t.ref} (remote default branch; detached HEAD)`;
    case 'local':
      return `trunk: local ${t.branch} (no remote tracking ref)`;
  }
}

/**
 * Local-vs-trunk divergence counts. `rev-list --left-right --count A...B`
 * prints "<only-in-A>\t<only-in-B>": with A = trunk and B = the local branch,
 * left = local_behind (trunk-only commits) and right = local_ahead
 * (local-only commits).
 */
function divergenceCounts(
  cwd: string,
  trunkRef: string,
  localBranch: string
): { local_ahead: number | null; local_behind: number | null } {
  const out = run(
    ['rev-list', '--left-right', '--count', `${trunkRef}...${localBranch}`],
    cwd,
    { allowFailure: true }
  ).trim();
  const m = out.match(/^(\d+)\s+(\d+)$/);
  if (!m) return { local_ahead: null, local_behind: null };
  return {
    local_behind: parseInt(m[1], 10),
    local_ahead: parseInt(m[2], 10),
  };
}

/**
 * Resolve the trunk ref once per collect() pass. Order:
 *
 * 1. The checked-out branch's configured upstream — the strongest signal, and
 *    it deliberately outranks origin/HEAD, which is stamped at clone time and
 *    goes stale (observed pointing at a dead pre-migration `develop`).
 * 2. The same-name remote-tracking branch (tracking not configured).
 * 3. On a detached HEAD, the remote's default branch (origin/HEAD).
 * 4. The local checkout, exactly as before this resolver existed.
 */
export function resolveTrunk(cwd: string): TrunkInfo {
  // symbolic-ref exits non-zero on a detached HEAD — a valid repo state, so
  // allowFailure prevents a spurious breadcrumb.
  const localBranch =
    run(['symbolic-ref', '--short', 'HEAD'], cwd, {
      allowFailure: true,
    }).trim() || null;

  if (localBranch) {
    // 1. Configured upstream. rev-parse exits non-zero when no upstream is set.
    const upstream = run(
      [
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        `${localBranch}@{upstream}`,
      ],
      cwd,
      { allowFailure: true }
    ).trim();
    if (upstream && refExists(cwd, upstream)) {
      const base = {
        ref: upstream,
        branch: localBranch,
        local_branch: localBranch,
        source: 'upstream' as const,
        ...divergenceCounts(cwd, upstream, localBranch),
      };
      return { ...base, summary: describeTrunk(base) };
    }

    // 2. Same-name remote-tracking branch. Verified via the full refs/remotes/
    //    path so a local branch literally named "origin/main" cannot shadow it.
    const remote = pickRemote(cwd);
    if (remote && refExists(cwd, `refs/remotes/${remote}/${localBranch}`)) {
      const candidate = `${remote}/${localBranch}`;
      const base = {
        ref: candidate,
        branch: localBranch,
        local_branch: localBranch,
        source: 'same-name-remote' as const,
        ...divergenceCounts(cwd, candidate, localBranch),
      };
      return { ...base, summary: describeTrunk(base) };
    }
  } else {
    // 3. Detached HEAD (CI checkouts): the remote's recorded default branch.
    const remote = pickRemote(cwd);
    if (remote) {
      const target = run(['symbolic-ref', `refs/remotes/${remote}/HEAD`], cwd, {
        allowFailure: true,
      }).trim();
      const short = target.replace(/^refs\/remotes\//, '');
      if (short && refExists(cwd, short)) {
        const base = {
          ref: short,
          branch: short.startsWith(`${remote}/`)
            ? short.slice(remote.length + 1)
            : short,
          local_branch: null,
          source: 'origin-head' as const,
          local_ahead: null,
          local_behind: null,
        };
        return { ...base, summary: describeTrunk(base) };
      }
    }
  }

  // 4. Local fallback — the literal 'HEAD' sentinel keeps every walk implicit
  //    (see refArgs). On a detached HEAD with no usable remote, 'main' keeps
  //    default_branch a plausible branch name rather than a raw SHA.
  const base = {
    ref: 'HEAD',
    branch: localBranch ?? 'main',
    local_branch: localBranch,
    source: 'local' as const,
    local_ahead: null,
    local_behind: null,
  };
  return { ...base, summary: describeTrunk(base) };
}

// ---------------------------------------------------------------------------
// Individual fact collectors
// ---------------------------------------------------------------------------

function getTotalCommits(cwd: string, ref: string): number {
  // rev-list --count exits non-zero on an empty repo (no HEAD ref yet),
  // which is a valid state — allowFailure keeps the output clean; '' parses to 0.
  const out = run(['rev-list', '--count', ref], cwd, {
    allowFailure: true,
  }).trim();
  const n = parseInt(out, 10);
  return isNaN(n) ? 0 : n;
}

/** Count commits that carry AI agent attribution trailers (any supported tool). */
function getAiMarkedCommits(cwd: string, ref: string): number {
  // One `git log` pass instead of one per attribution pattern: git OR-combines
  // multiple `--grep` by default, so a single invocation matches the union of
  // all patterns. A commit matching several patterns still appears once in the
  // log output, so the Set naturally dedups to the same count as the old loop.
  // --extended-regexp is required: the attribution patterns use ERE syntax
  // (e.g. Windsurf's `(Windsurf|Cascade)` alternation), which git's default
  // BRE would treat as literal `(`/`|` and never match.
  const args = [
    'log',
    '--regexp-ignore-case',
    '--extended-regexp',
    '--format=%H',
  ];
  for (const pat of ALL_COMMIT_ATTRIBUTION) args.push(`--grep=${pat.source}`);
  args.push(...refArgs(ref));
  const out = run(args, cwd);
  const matchedSHAs = new Set(out.trim().split('\n').filter(Boolean));
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
    // Spec-driven adoption signals (ADP-G1 code 106). A bare `context/` is NOT
    // a signal: the audit itself writes context/audits/, so counting it would
    // let the audit score its own output. Only real spec-workspace content
    // (context/spec, context/product) or the framework dir counts.
    'context/spec',
    'context/product',
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

// ---------------------------------------------------------------------------
// Squash/rebase-merge awareness. GitHub/GitLab/Bitbucket squash-merge collapses
// a whole PR into ONE ordinary commit on the trunk — no 2-parent merge commit
// exists, so `git log --merges` sees nothing and every merge-derived metric
// silently reads 0. The reliable fingerprint of a squash-merged PR is the PR
// reference the forge appends to the squashed subject ("Add feature (#123)").
// These commits are counted as merge EVENTS, attributed to the commit author —
// which for a squash merge IS the PR author, unlike a merge commit whose
// author is whoever clicked the merge button.
// ---------------------------------------------------------------------------

/** PR references the major forges stamp on a squash/rebase-merged commit SUBJECT. */
const SQUASH_SUBJECT_RXS = [
  /\(#\d+\)\s*$/, // GitHub: "Title (#123)"
  /^Merged PR \d+:/, // Azure DevOps: "Merged PR 123: Title"
  /\(pull request #\d+\)/i, // Bitbucket: "Title (pull request #12)"
];

/** True when a commit subject carries a forge PR ref (squash/rebase-merged PR). */
export function isSquashMergeSubject(subject: string): boolean {
  return SQUASH_SUBJECT_RXS.some((rx) => rx.test(subject));
}
/** GitLab squash keeps the MR ref in the BODY: "See merge request group/proj!45". */
const SQUASH_BODY_RX = /^See merge request [^\s!]*!\d+/m;
/** Mirrors the `--grep=^Revert\|hotfix\|rollback` merge-commit filter.
 * Exported so detectors classify merge subjects consistently with the
 * change-failure proxy. */
export const REVERT_SUBJECT_RX = /^Revert|hotfix|rollback/;
/** Mirrors the case-insensitive fix-keyword merge-commit filter (adp_g14).
 * Exported so detectors classify merge subjects consistently with the
 * DORA rework-rate proxy. */
export const FIX_SUBJECT_RX = /fix|bugfix|hotfix|patch|defect|regression/i;

interface SquashScan {
  total: number;
  reverts: number;
  fixes: number;
  perAuthor: Map<string, number>;
}

/** One squash-merged PR found on the first-parent trunk, committer-dated. */
interface SquashEvent {
  author: string;
  /** Committer date, epoch ms — lets callers window without a second scan. */
  date: number;
  isRevert: boolean;
  isFix: boolean;
}

/**
 * Scan first-parent NON-merge trunk commits for squash-merged PRs (a PR ref on
 * the subject, or GitLab's merge-request ref in the body) over ALL history —
 * one git pass; callers window the returned events in memory (squashStats).
 * Records are separated by \x1e and fields by \x1f so multi-line bodies parse
 * unambiguously.
 */
function scanSquashMerges(cwd: string, ref: string): SquashEvent[] {
  const args = [
    'log',
    '--first-parent',
    '--no-merges',
    '--format=%x1e%aN%x1f%cI%x1f%s%x1f%b',
    ...refArgs(ref),
  ];
  const events: SquashEvent[] = [];
  for (const record of run(args, cwd).split('\x1e')) {
    if (!record.trim()) continue;
    const [author = '', dateStr = '', subject = '', body = ''] =
      record.split('\x1f');
    const isSquash =
      SQUASH_SUBJECT_RXS.some((rx) => rx.test(subject)) ||
      SQUASH_BODY_RX.test(body);
    if (!isSquash) continue;
    const d = parseDate(dateStr);
    events.push({
      author: author.trim(),
      date: isNaN(d.getTime()) ? 0 : d.getTime(),
      isRevert: REVERT_SUBJECT_RX.test(subject),
      isFix: FIX_SUBJECT_RX.test(subject),
    });
  }
  return events;
}

/**
 * Fold squash events into counts, optionally windowed. `sinceMs` mirrors git
 * `--since` semantics (committer date >= since), so the windowed counts match
 * what a `--since`-bounded scan produced.
 */
function squashStats(events: SquashEvent[], sinceMs?: number): SquashScan {
  const scan: SquashScan = {
    total: 0,
    reverts: 0,
    fixes: 0,
    perAuthor: new Map(),
  };
  for (const e of events) {
    if (sinceMs !== undefined && e.date < sinceMs) continue;
    scan.total++;
    if (e.isRevert) scan.reverts++;
    if (e.isFix) scan.fixes++;
    scan.perAuthor.set(e.author, (scan.perAuthor.get(e.author) ?? 0) + 1);
  }
  return scan;
}

/** Classify the repo's merge workflow from merge-commit vs squash-event counts. */
export function classifyMergeStrategy(
  mergeCommits: number,
  squashMerges: number
): 'merge-commit' | 'squash' | 'mixed' | 'unknown' {
  if (mergeCommits === 0 && squashMerges === 0) return 'unknown';
  if (mergeCommits === 0) return 'squash';
  if (squashMerges === 0) return 'merge-commit';
  // A handful of real merge commits amid many squashed PRs is still a squash
  // workflow (e.g. one maintainer occasionally merge-committing).
  return squashMerges >= mergeCommits * 3 ? 'squash' : 'mixed';
}

function getMergeStats(
  cwd: string,
  squashEvents: SquashEvent[],
  ref: string
): MergeStats {
  const allMerges = run(
    ['log', '--first-parent', '--merges', '--format=%H', ...refArgs(ref)],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  const revertOut = run(
    [
      'log',
      '--first-parent',
      '--merges',
      '--grep=^Revert\\|hotfix\\|rollback',
      '--format=%H',
      ...refArgs(ref),
    ],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  // Merge EVENTS = merge commits + squash-merged PRs, so squash-merge repos
  // don't read as "never merges anything".
  const squash = squashStats(squashEvents);
  return {
    total_merges: allMerges.length + squash.total,
    revert_merges: revertOut.length + squash.reverts,
  };
}

interface MergeRecord {
  merged_at: string;
  branch_first_commit_at: string;
}

function getMergeRecords(cwd: string, ref: string): MergeRecord[] {
  // Two batched `git log` passes replace the old per-merge fork. The original
  // ran one `git log <sha>^1..<sha>^2` per first-parent merge — O(merges)
  // subprocess forks (the heaviest git cost, and the path that hit maxBuffer
  // ENOBUFS on large repos). Here we read the graph once and resolve every
  // merge's side branch in memory:
  //
  //   Pass 1 — the first-parent mainline (newest→oldest) with each commit's
  //            committer date (merged_at) and parent SHAs.
  //   Pass 2 — the full ancestor graph (every reachable commit's author date +
  //            parents) for in-memory side-branch traversal.
  //
  // A single oldest→newest sweep then reproduces each merge's `sha^1..sha^2`
  // set exactly. Walking oldest-first and marking each processed commit
  // "visited", by the time we reach a merge M its first parent's whole ancestry
  // (anc(p1)) is already visited; a BFS from p2 over the still-unvisited commits
  // therefore yields exactly anc(p2) \ anc(p1) — identical to the old rev-range.
  // branch_first_commit_at is the earliest AUTHOR date (%aI) in that set: a
  // branch rebased just before merging has its committer dates rewritten to
  // ~merge-time, which would collapse lead time to ~0; author date reflects when
  // the work was written.

  // Pass 1: mainline first-parent chain, newest first.
  const mainlineOut = run(
    ['log', '--first-parent', '--format=%H|%cI|%P', ...refArgs(ref)],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  if (mainlineOut.length === 0) return [];

  interface MainlineCommit {
    sha: string;
    mergedAt: string;
    parents: string[];
  }
  const mainline: MainlineCommit[] = mainlineOut.map((line) => {
    const [sha, mergedAt = '', parentStr = ''] = line.split('|');
    return { sha, mergedAt, parents: parentStr.split(' ').filter(Boolean) };
  });

  // Pass 2: full ancestor graph — sha → { authorMs, parents }. Scoped to the
  // trunk's ancestry: the mainline sweep only ever resolves side branches
  // reachable from trunk merges, so anc(trunk) is sufficient.
  const graph = new Map<string, { authorMs: number; parents: string[] }>();
  for (const line of run(
    ['log', '--format=%H|%aI|%P', ...refArgs(ref)],
    cwd
  ).split('\n')) {
    if (!line) continue;
    const [sha, authorAt = '', parentStr = ''] = line.split('|');
    if (!sha) continue;
    graph.set(sha, {
      authorMs: new Date(authorAt).getTime(),
      parents: parentStr.split(' ').filter(Boolean),
    });
  }

  const visited = new Set<string>();

  // BFS from a seed set over not-yet-visited commits, marking them visited.
  // When trackMin is true, returns the earliest author date encountered.
  const sweep = (seeds: string[], trackMin: boolean): number => {
    let minMs = Infinity;
    const stack = [...seeds];
    while (stack.length > 0) {
      const sha = stack.pop()!;
      if (visited.has(sha)) continue;
      visited.add(sha);
      const node = graph.get(sha);
      if (!node) continue;
      if (trackMin && !isNaN(node.authorMs) && node.authorMs < minMs) {
        minMs = node.authorMs;
      }
      for (const p of node.parents) if (!visited.has(p)) stack.push(p);
    }
    return minMs;
  };

  const records: MergeRecord[] = [];
  for (let i = mainline.length - 1; i >= 0; i--) {
    const c = mainline[i];
    if (c.parents.length >= 2) {
      // Second parent (^2) supplies the merged-in branch; track its earliest
      // author date. Any further parents (octopus ^3…) are marked visited but
      // excluded from the record, matching the old `^1..^2`-only range.
      const minMs = sweep([c.parents[1]], true);
      if (c.parents.length > 2) sweep(c.parents.slice(2), false);
      if (minMs !== Infinity) {
        records.push({
          merged_at: c.mergedAt,
          branch_first_commit_at: new Date(minMs).toISOString(),
        });
      }
    }
    visited.add(c.sha);
  }

  // The old loop emitted records newest-first (git log order); preserve that.
  records.reverse();
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
  /** In-window 2-parent merge commits only (before adding squash events). */
  merge_commits: number;
  /** In-window squash/rebase-merged PRs (first-parent non-merge commits with a PR ref). */
  squash_merges: number;
  /** Detected merge workflow: merge-commit | squash | mixed | unknown. */
  merge_strategy: 'merge-commit' | 'squash' | 'mixed' | 'unknown';
  authors_total: number;
  per_author: AuthorRow[];
  /** Merges divided by active-contributor count; null when activeCount is 0. Display-only. */
  merges_per_active: number | null;
  /** Total LOC (added + deleted) divided by active-contributor count; null when activeCount is 0. Display-only. */
  loc_per_active: number | null;
  /** Display-only: merges per active contributor per week (merges_per_active ÷ (window_days / 7)). */
  merges_per_active_per_week: number | null;
  /** Display-only: LOC per active contributor per week (loc_per_active ÷ (window_days / 7)). */
  loc_per_active_per_week: number | null;
  /** ISO 8601 timestamp of the window anchor minus lookback_days (the oldest commit included).
   * Used by adp_g4_lead_time to filter merge_records to the same window. Null on empty repos. */
  window_start: string | null;
}

/**
 * Fallback for the active-contributor exclusion threshold, used ONLY when the
 * caller does not thread the value in (e.g. the standalone `collect` verb run
 * without standards). The source of truth is `meta.active_contributor_threshold`
 * in standards.toml — `audit-core` reads it and passes it into `collect(...)`.
 * Keep this in sync with that key only as a last-resort default.
 */
export const ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT = 0.05;

/**
 * Fallback for the code-turnover rework horizon, in days, used ONLY when the
 * caller does not thread the value in. The source of truth is
 * `meta.rework_horizon_days` in standards.toml — `audit-core` reads it and
 * passes it into `collect(...)`. A line deleted within this many days of being
 * authored counts as "reworked".
 */
export const REWORK_HORIZON_DAYS_DEFAULT = 21;

/**
 * Active-contributor filter (locked rule — Phase 2 ratios reuse this).
 *
 * An author is excluded only when BOTH their merge-share and their LOC-share
 * fall below threshold T (a fraction of the window totals). This filters out
 * drive-by reviewers and non-code participants while keeping anyone with a
 * meaningful share of merges or code. T is configurable via
 * meta.active_contributor_threshold in standards.toml (default 0.05).
 *
 * Merge counts include squash-merge events attributed to the PR author, so a
 * squash-merge repo keeps the merge-share safety valve. When there are NO
 * merge events at all (direct-push workflow), commit-share replaces
 * merge-share as the second axis — otherwise the rule degenerates to
 * LOC-share-only, which one big import/lockfile author can collapse.
 *
 * @param perAuthor - author rows from window_stats.per_author
 * @param T         - exclusion threshold as a fraction of window totals (0..1)
 */
export function activeContributors(perAuthor: AuthorRow[], T: number): number {
  const tm = perAuthor.reduce((s, a) => s + a.merges, 0);
  const tl = perAuthor.reduce((s, a) => s + a.lines, 0) || 1;
  if (tm === 0) {
    const tc = perAuthor.reduce((s, a) => s + a.commits, 0) || 1;
    return perAuthor.filter((a) => !(a.commits / tc < T && a.lines / tl < T))
      .length;
  }
  return perAuthor.filter((a) => !(a.merges / tm < T && a.lines / tl < T))
    .length;
}

function buildWindowStats(
  cwd: string,
  period: Period,
  activeThreshold: number,
  // Trunk-tip commit date (the window anchor), computed once in collect();
  // null on an empty repo → the empty stats shape without any git calls.
  anchor: Date | null,
  squashEvents: SquashEvent[],
  ref: string
): WindowStats {
  const windowDays = period.lookback_days;
  const empty: WindowStats = {
    window_days: windowDays,
    commits: 0,
    merges: 0,
    revert_merges: 0,
    fix_merges: 0,
    merge_commits: 0,
    squash_merges: 0,
    merge_strategy: 'unknown',
    authors_total: 0,
    per_author: [],
    merges_per_active: null,
    loc_per_active: null,
    merges_per_active_per_week: null,
    loc_per_active_per_week: null,
    window_start: null,
  };

  // Anchor to the newest commit date — no wall-clock dependency.
  if (!anchor) return empty;

  const sinceMs = anchor.getTime() - windowDays * 86_400_000;
  const since = new Date(sinceMs).toISOString();

  // 0a. In-window revert/hotfix/rollback merges — bounded to the same window as the rest.
  const revertOut = run(
    [
      'log',
      '--first-parent',
      '--merges',
      '--grep=^Revert\\|hotfix\\|rollback',
      `--since=${since}`,
      '--format=%H',
      ...refArgs(ref),
    ],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);

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
      ...refArgs(ref),
    ],
    cwd
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  // 0c. In-window squash-merged PRs — merge events with no merge commit.
  //     Counted into merges/revert/fix totals and attributed to their commit
  //     author (= the PR author for a squash merge).
  const squash = squashStats(squashEvents, sinceMs);
  const revert_merges = revertOut.length + squash.reverts;
  const fix_merges = fixOut.length + squash.fixes;

  // 1. Non-merge commits — derive per-author commit counts and line churn.
  //    Format: one "%H\t%aN" header line per commit, then numstat lines.
  //    Deliberately stays --all (not trunk-scoped): this pass measures
  //    contributor ACTIVITY and churn, and in-flight branch work is real
  //    activity even before it lands on the trunk.
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

  // 2. First-parent merge commits — per-author counts, then fold in the squash
  //    events so a squash-merge repo's per-author merges reflect PR authors,
  //    not just whoever performs the occasional real merge.
  const mergeOut = run(
    [
      'log',
      '--first-parent',
      '--merges',
      `--since=${since}`,
      '--format=%aN',
      ...refArgs(ref),
    ],
    cwd
  );

  const mergeAuthors = mergeOut.trim().split('\n').filter(Boolean);
  const mergeMap = new Map<string, number>();
  for (const author of mergeAuthors) {
    mergeMap.set(author, (mergeMap.get(author) ?? 0) + 1);
  }
  const mergeCommits = mergeAuthors.length;
  for (const [author, n] of squash.perAuthor) {
    mergeMap.set(author, (mergeMap.get(author) ?? 0) + n);
  }
  const totalMerges = mergeCommits + squash.total;
  const mergeStrategy = classifyMergeStrategy(mergeCommits, squash.total);

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

  const activeCount = activeContributors(perAuthor, activeThreshold);
  const totalLines = perAuthor.reduce((s, a) => s + a.lines, 0);
  const merges_per_active = activeCount > 0 ? totalMerges / activeCount : null;
  const loc_per_active = activeCount > 0 ? totalLines / activeCount : null;
  const merges_per_active_per_week =
    merges_per_active != null && windowDays > 0
      ? merges_per_active / (windowDays / 7)
      : null;
  const loc_per_active_per_week =
    loc_per_active != null && windowDays > 0
      ? loc_per_active / (windowDays / 7)
      : null;

  return {
    window_days: windowDays,
    commits: totalCommits,
    merges: totalMerges,
    revert_merges,
    fix_merges,
    merge_commits: mergeCommits,
    squash_merges: squash.total,
    merge_strategy: mergeStrategy,
    authors_total: allAuthors.size,
    per_author: perAuthor,
    merges_per_active,
    loc_per_active,
    merges_per_active_per_week,
    loc_per_active_per_week,
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

function getNumstatTotals(cwd: string, ref: string): NumstatTotals {
  const out = run(['log', '--numstat', '--format=', ...refArgs(ref)], cwd);
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
function getCodeTurnover(
  cwd: string,
  period: Period,
  horizonDays: number,
  // Trunk-tip commit date, computed once in collect(); null on an empty repo.
  anchor: Date | null,
  ref: string
): CodeTurnover | null {
  const lookbackDays = period.lookback_days;
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
      ...refArgs(ref),
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
  // Reduce (not Math.min(...ts)/Math.max(...ts)) — spreading an unbounded
  // history array can overflow the argument stack on very large repos.
  let min = allDates[0].getTime();
  let max = min;
  for (const d of allDates) {
    const t = d.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return Math.max(0, daysBetween(new Date(min), new Date(max)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GitRaw {
  default_branch: string;
  /** Which ref the trunk walks used and why — see resolveTrunk(). */
  trunk: TrunkInfo;
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

/**
 * Tunables sourced from standards.toml `[meta]`. Callers that have loaded
 * standards (audit-core) pass these in so the collector's computations honor the
 * same values as the metrics; the constants above are last-resort fallbacks.
 */
export interface GitCollectOptions {
  /** meta.active_contributor_threshold */
  activeContributorThreshold?: number;
  /** meta.rework_horizon_days */
  reworkHorizonDays?: number;
}

export function collect(
  repoPath: string,
  period: Period,
  opts: GitCollectOptions = {}
) {
  const activeThreshold =
    opts.activeContributorThreshold ?? ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT;
  const reworkHorizonDays =
    opts.reworkHorizonDays ?? REWORK_HORIZON_DAYS_DEFAULT;

  resetRunErrors();

  // Broken environment (not a git repo, git binary missing/unexecutable):
  // return an UNAVAILABLE artifact so every git-derived metric SKIPs, instead
  // of `available: true` with all-zero stats that downstream metrics would
  // score confidently.
  const probeError = probeGitRepo(repoPath);
  if (probeError) {
    return makeArtifact(
      'git',
      false,
      probeError,
      { ...period, history_available_days: 0 },
      {} as GitRaw
    );
  }

  // The trunk ref is resolved ONCE and threaded into every trunk walk below —
  // this is what keeps a diverged developer clone from hiding the real trunk.
  const trunk = resolveTrunk(repoPath);

  // Commit-less repo (git init, nothing committed): a valid state, but every
  // HEAD-based `git log` variant fatals on the unborn branch. Short-circuit to
  // the zero-stats artifact — available (the repo exists), just empty — without
  // spamming per-subcommand breadcrumbs. The anchor (trunk-tip commit date,
  // falling back to newest-across-refs) is computed ONCE here and threaded
  // into every windowed fact collector.
  const anchor =
    trunkTipDate(repoPath, trunk.ref) ?? latestCommitDate(repoPath);
  if (anchor === null) {
    const raw: GitRaw = {
      default_branch: trunk.branch,
      trunk,
      total_commits: 0,
      ai_marked_commits: 0,
      total_merges: 0,
      revert_merges: 0,
      tooling_paths: getToolingPaths(repoPath),
      merge_records: [],
      // buildWindowStats/getCodeTurnover return their empty/null shapes
      // without further git calls when the repo has no commits.
      window_stats: buildWindowStats(
        repoPath,
        period,
        activeThreshold,
        null,
        [],
        trunk.ref
      ),
      numstat_totals: { added: 0, deleted: 0 },
      code_turnover: getCodeTurnover(
        repoPath,
        period,
        reworkHorizonDays,
        null,
        trunk.ref
      ),
    };
    return makeArtifact(
      'git',
      true,
      null,
      { ...period, history_available_days: 0 },
      raw
    );
  }

  const total_commits = getTotalCommits(repoPath, trunk.ref);
  const ai_marked_commits = getAiMarkedCommits(repoPath, trunk.ref);
  const tooling_paths = getToolingPaths(repoPath);
  // One squash scan over all history; getMergeStats and buildWindowStats fold
  // it (unbounded / windowed) instead of each running its own log pass.
  const squashEvents = scanSquashMerges(repoPath, trunk.ref);
  const { total_merges, revert_merges } = getMergeStats(
    repoPath,
    squashEvents,
    trunk.ref
  );
  const merge_records = getMergeRecords(repoPath, trunk.ref);
  const window_stats = buildWindowStats(
    repoPath,
    period,
    activeThreshold,
    anchor,
    squashEvents,
    trunk.ref
  );
  const numstat_totals = getNumstatTotals(repoPath, trunk.ref);
  const code_turnover = getCodeTurnover(
    repoPath,
    period,
    reworkHorizonDays,
    anchor,
    trunk.ref
  );
  const history_available_days = getHistoryAvailableDays(repoPath);

  const raw: GitRaw = {
    default_branch: trunk.branch,
    trunk,
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

  // If git broke mid-collection (repo vanished, ENOBUFS truncation, binary
  // failure), the stats above are partial/zeroed — mark the artifact
  // unavailable so downstream metrics SKIP rather than trust them.
  const errors = drainRunErrors();
  if (errors.length > 0) {
    const suffix = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
    return makeArtifact(
      'git',
      false,
      `git failed during collection: ${errors[0]}${suffix}`,
      { ...period, history_available_days },
      raw
    );
  }

  return makeArtifact(
    'git',
    true,
    null,
    { ...period, history_available_days },
    raw
  );
}
