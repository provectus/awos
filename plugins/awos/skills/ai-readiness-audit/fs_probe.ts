// fs_probe.ts — leaf filesystem-probe helpers with no in-repo dependencies.
//
// Kept import-free of everything except node:fs/node:path so it can sit
// beneath both collectors/git.ts and topology.ts without creating a cycle.
// See detectors/_base.ts and collectors/git.ts for the callers.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
