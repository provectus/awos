/**
 * helpers_orchestration.ts — shared fixtures and constants for the
 * orchestration-root suites.
 */

/**
 * check_ids that may be credited from an orchestration root.
 *
 * Excluded deliberately: ARCH-01 (measures the member's own code structure),
 * SDD-03 (the root's architecture document describes the platform, not the
 * member's stack), and SDD-04 (computed over per-work-tree git history, which
 * cannot be inherited at all).
 */
export const INHERITING_CHECK_IDS = new Set([
  'ADP-01',
  'ADP-02',
  'ADP-03',
  'ADP-04',
  'ADP-05',
  'ADP-06',
  'AI-02',
  'AI-03',
  'AI-04',
  'AI-05',
  'SDD-01',
  'SDD-02',
  'SDD-05',
  'SDD-06',
  'SDD-07',
  'DOC-07',
  'AIS-07',
  'PRV-07',
  'PRV-17',
]);
