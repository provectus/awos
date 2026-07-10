/**
 * provenance.ts — engine provenance, the circuit-breaker against
 * hand-assembled audits. audit-core stamps every artifact it writes;
 * patch-judgment, render, and rollup refuse an audit.json without the stamp,
 * so the only path to a report is actually running the engine.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The audit skill's version, read from the plugin manifest
 * (plugins/awos/.claude-plugin/plugin.json) so the stamp always matches the
 * released plugin — never hardcoded. Works from both the bundled dist/cli.js
 * and the TypeScript sources; falls back to "unknown" when the manifest is
 * absent (e.g. the skill directory copied without its plugin root).
 */
function engineVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const skillRoot =
      here.endsWith('/dist') || here.endsWith('\\dist') ? dirname(here) : here;
    const manifest = JSON.parse(
      readFileSync(
        join(skillRoot, '..', '..', '.claude-plugin', 'plugin.json'),
        'utf8'
      )
    );
    return typeof manifest.version === 'string' ? manifest.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const ENGINE_PROVENANCE = {
  generated_by: 'audit-core',
  version: engineVersion(),
} as const;

/** True when `obj` carries the audit-core provenance stamp. */
export function hasEngineProvenance(obj: unknown): boolean {
  return (
    !!obj &&
    typeof obj === 'object' &&
    (obj as { engine?: { generated_by?: unknown } }).engine?.generated_by ===
      ENGINE_PROVENANCE.generated_by
  );
}
