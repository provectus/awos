/**
 * git_ignore.ts — gitignore-aware pruning for the engine's file walkers.
 *
 * The walkers' static DEFAULT_IGNORE list cannot know a team's own exclusions.
 * Observed in the wild: a Claude Code session worktree under
 * `.claude/worktrees/` — a full, stale checkout of the same repo — polluted
 * every filesystem-derived check (QA counted its old test files, the AST
 * metrics parsed ~950 duplicate sources, AIS flagged its CLAUDE.md files as
 * untracked). The team had already declared it ignorable
 * (`.gitignore: .claude/worktrees/`); the walkers just never asked git.
 *
 * One `git ls-files --others --ignored --exclude-standard --directory` call
 * per repo (cached) yields the ignored set with directories collapsed, so
 * "project files" means tracked + untracked-but-not-ignored. Submodule
 * contents are on disk and not gitignored, so they stay in scope — a
 * nested-checkout heuristic would wrongly drop them. In a non-git directory
 * (hermetic test fixtures) the git call fails and only the built-in
 * always-ignored entries apply, so walkers behave exactly as before.
 */
import { execFileSync } from 'node:child_process';

export interface IgnoredSets {
  /** Repo-relative ignored directory prefixes, each ending with '/'. */
  dirPrefixes: string[];
  /** Repo-relative ignored file paths. */
  files: Set<string>;
}

/**
 * Claude Code session worktrees are tool infrastructure, never project
 * content — pruned even when the repo's .gitignore lacks the entry.
 */
const ALWAYS_IGNORED_DIR_PREFIXES = ['.claude/worktrees/'];

const CACHE = new Map<string, IgnoredSets>();

/** The repo's gitignored paths (plus the built-in always-ignored dirs). */
export function gitIgnoredSets(repoPath: string): IgnoredSets {
  const key = repoPath.replace(/\/+$/, '');
  const hit = CACHE.get(key);
  if (hit) return hit;
  const dirPrefixes = [...ALWAYS_IGNORED_DIR_PREFIXES];
  const files = new Set<string>();
  try {
    const out = execFileSync(
      'git',
      [
        'ls-files',
        '--others',
        '--ignored',
        '--exclude-standard',
        '--directory',
        '-z',
      ],
      { cwd: key, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }
    );
    for (const entry of out.split('\0')) {
      if (!entry) continue;
      if (entry.endsWith('/')) dirPrefixes.push(entry);
      else files.add(entry);
    }
  } catch {
    // Not a git repo / git unavailable — only the built-ins apply.
  }
  const sets: IgnoredSets = { dirPrefixes, files };
  CACHE.set(key, sets);
  return sets;
}

/**
 * Drop gitignored entries from a list of ABSOLUTE file paths under repoPath.
 * Shared by both walkers (detectors' listFiles, AST metrics' listRepoFiles)
 * so every filesystem-derived check sees the same project-file universe.
 */
export function dropIgnored(repoPath: string, paths: string[]): string[] {
  const { dirPrefixes, files } = gitIgnoredSets(repoPath);
  if (dirPrefixes.length === 0 && files.size === 0) return paths;
  const prefix = `${repoPath.replace(/\/+$/, '')}/`;
  return paths.filter((p) => {
    const rel = p.startsWith(prefix) ? p.slice(prefix.length) : p;
    if (files.has(rel)) return false;
    return !dirPrefixes.some((d) => rel.startsWith(d));
  });
}

/**
 * Drop only the built-in always-ignored dirs (tool infrastructure like
 * `.claude/worktrees/`), keeping gitignore-covered files visible. For checks
 * whose PURPOSE is to examine ignored-ness (AS-14 sensitive-file coverage):
 * an ignore-honoring walk can never see a correctly-gitignored `*.pem`, which
 * made AS-14's PASS unreachable — covered file → invisible → SKIP, visible
 * file → by definition uncovered → FAIL.
 */
export function dropAlwaysIgnored(repoPath: string, paths: string[]): string[] {
  const prefix = `${repoPath.replace(/\/+$/, '')}/`;
  return paths.filter((p) => {
    const rel = p.startsWith(prefix) ? p.slice(prefix.length) : p;
    return !ALWAYS_IGNORED_DIR_PREFIXES.some((d) => rel.startsWith(d));
  });
}
