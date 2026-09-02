// fs_probe.ts — leaf filesystem-probe helpers with no in-repo dependencies.
//
// Kept import-free of everything except node:fs/node:path so it can sit
// beneath both collectors/git.ts and topology.ts without creating a cycle.
// See detectors/_base.ts and collectors/git.ts for the callers.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Non-blank line count above which a file counts as real content, not boilerplate. */
export const MIN_SUBSTANTIVE_LINES = 5;

/**
 * True when `target` holds enough real content to confer inheritance. A
 * directory qualifies only when at least one of its entries (recursively)
 * clears the bar; a file must clear the substantive line bar itself. This is
 * the anti-gaming gate: an empty `.claude/` or a directory holding only a
 * one-line placeholder file must not license a whole portfolio's worth of
 * credit.
 */
export function isSubstantiveOrchestrationPath(target: string): boolean {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return false;
  }
  if (stat.isDirectory()) {
    let entries: string[];
    try {
      entries = readdirSync(target);
    } catch {
      return false;
    }
    return entries.some((e) => isSubstantiveOrchestrationPath(join(target, e)));
  }
  try {
    const lines = readFileSync(target, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    return lines.length > MIN_SUBSTANTIVE_LINES;
  } catch {
    return false;
  }
}

/**
 * Render an artifact's evidence path. Own repo: relative(repoPath, absPath) —
 * byte-identical to every detector's pre-inheritance rendering, since a
 * repository with no orchestration root in scope must be completely
 * unaffected by this feature. Inherited: the logical registry-relative
 * location within whichever workspace supplied it (relRegistryPath, plus
 * however far absPath sits beneath resolvedBase) rather than a `../../…`
 * trail out of the member — resolvedBase === absPath for a single-file probe
 * collapses to relRegistryPath itself.
 */
export function displayPath(
  origin: 'own' | 'inherited',
  repoPath: string,
  resolvedBase: string,
  relRegistryPath: string,
  absPath: string
): string {
  return origin === 'inherited'
    ? join(relRegistryPath, relative(resolvedBase, absPath))
    : relative(repoPath, absPath);
}
