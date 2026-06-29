#!/usr/bin/env node
/**
 * standards-linkcheck.mjs — verify HTTP reachability of every per-category
 * `url` field declared in standards.toml [category.*] blocks.
 *
 * URLs are deduplicated for fetching (many categories share the same URL).
 * Each unique URL is checked once; the category name(s) using it are shown.
 *
 * Usage:
 *   node scripts/standards-linkcheck.mjs [path/to/standards.toml] [--dry-run]
 *
 * Exit codes:
 *   0 — all links are OK or REACHABLE-AUTH (paywall/auth-gate), or --dry-run
 *   1 — one or more links are DEAD (404 / 5xx / network error)
 *
 * Statuses in the output table:
 *   OK              — HTTP 200 after following redirects
 *   REACHABLE-AUTH  — HTTP 401 or 403 (paywall / auth-gate); treated as a warning, not a failure
 *   DEAD            — HTTP 404, 5xx, or network error
 *
 * The extractSourceUrls() function is exported as a pure function (no I/O) so
 * it can be unit-tested without network access.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

// ---------------------------------------------------------------------------
// Pure, unit-testable export
// ---------------------------------------------------------------------------

/**
 * Extract unique `url` values from every [category.*] block in a standards.toml text.
 *
 * Each category now carries its own `url` field directly. This function collects
 * all distinct urls (deduplicated), carrying one representative category name per url.
 *
 * @param {string} tomlText - raw text of a standards.toml file
 * @returns {{ name: string; url: string }[]} - array of {name, url} pairs (deduplicated by url).
 *   Returns [] when no [category.*] blocks carry a `url` key.
 */
export function extractSourceUrls(tomlText) {
  const parsed = parse(tomlText);
  const categoryTable = parsed['category'];
  if (
    categoryTable === null ||
    categoryTable === undefined ||
    typeof categoryTable !== 'object'
  ) {
    return [];
  }
  // Deduplicate: keep first category name seen for each url.
  const seen = new Map();
  for (const [catKey, v] of Object.entries(categoryTable)) {
    if (v !== null && typeof v === 'object' && typeof v['url'] === 'string') {
      const url = v['url'];
      if (!seen.has(url)) {
        // Use the human `source` label as the name if available; fall back to category key.
        const name =
          typeof v['source'] === 'string' && v['source'] ? v['source'] : catKey;
        seen.set(url, { name, url });
      }
    }
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// HTTP check (network I/O — not imported in tests)
// ---------------------------------------------------------------------------

/**
 * Check a single URL.
 *
 * Strategy: HEAD first; fall back to GET on HTTP 405.
 * Redirects are followed automatically (fetch default).
 *
 * @param {string} url
 * @returns {Promise<{ result: string; httpStatus: number|null; finalUrl: string; error?: string }>}
 */
async function checkUrl(url) {
  const TIMEOUT_MS = 15_000;
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 405) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }
    const httpStatus = response.status;
    const finalUrl = response.url || url;
    if (httpStatus === 200) {
      return { result: 'OK', httpStatus, finalUrl };
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return { result: 'REACHABLE-AUTH', httpStatus, finalUrl };
    }
    return { result: 'DEAD', httpStatus, finalUrl };
  } catch (err) {
    return {
      result: 'DEAD',
      httpStatus: null,
      finalUrl: url,
      error: String(err.message ?? err),
    };
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const DEFAULT_TOML_PATH = resolve(
  fileURLToPath(import.meta.url),
  '../../plugins/awos/skills/ai-readiness-audit/references/standards.toml'
);

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  const tomlPath = positional[0] ? resolve(positional[0]) : DEFAULT_TOML_PATH;

  let tomlText;
  try {
    tomlText = readFileSync(tomlPath, 'utf8');
  } catch (err) {
    process.stderr.write(
      `standards-linkcheck: cannot read ${tomlPath}: ${err.message}\n`
    );
    process.exit(1);
  }

  const entries = extractSourceUrls(tomlText);

  if (entries.length === 0) {
    process.stdout.write(
      'standards-linkcheck: no [category.*] blocks with a `url` field found — nothing to check.\n'
    );
    process.exit(0);
  }

  if (isDryRun) {
    process.stdout.write(
      `standards-linkcheck: --dry-run — would check ${entries.length} URL(s):\n\n`
    );
    const colW = Math.max(...entries.map((e) => e.name.length), 6);
    process.stdout.write(`${'source'.padEnd(colW)}  url\n`);
    process.stdout.write(`${''.padEnd(colW, '-')}  ${''.padEnd(60, '-')}\n`);
    for (const { name, url } of entries) {
      process.stdout.write(`${name.padEnd(colW)}  ${url}\n`);
    }
    process.exit(0);
  }

  process.stdout.write(
    `standards-linkcheck: checking ${entries.length} source URL(s)...\n\n`
  );

  const results = [];
  for (const { name, url } of entries) {
    process.stdout.write(`  checking ${name} ...`);
    const r = await checkUrl(url);
    results.push({ name, url, ...r });
    process.stdout.write(` ${r.result}\n`);
  }

  // Print summary table
  const colW = {
    source: Math.max(...results.map((r) => r.name.length), 6),
    url: Math.max(...results.map((r) => r.url.length), 3),
    status: Math.max(...results.map((r) => r.result.length), 6),
    finalUrl: Math.max(...results.map((r) => r.finalUrl.length), 9),
  };

  const hr = (w) => ''.padEnd(w, '-');
  process.stdout.write('\n');
  process.stdout.write(
    `${'source'.padEnd(colW.source)}  ${'url'.padEnd(colW.url)}  ${'status'.padEnd(colW.status)}  final_url\n`
  );
  process.stdout.write(
    `${hr(colW.source)}  ${hr(colW.url)}  ${hr(colW.status)}  ${hr(colW.finalUrl)}\n`
  );
  for (const r of results) {
    const note = r.error ? ` (${r.error})` : '';
    process.stdout.write(
      `${r.name.padEnd(colW.source)}  ${r.url.padEnd(colW.url)}  ${r.result.padEnd(colW.status)}  ${r.finalUrl}${note}\n`
    );
  }

  // Warnings for REACHABLE-AUTH
  const authGated = results.filter((r) => r.result === 'REACHABLE-AUTH');
  if (authGated.length > 0) {
    process.stdout.write(
      '\nWARNING: The following URLs are auth-gated or paywalled (HTTP 401/403).\n'
    );
    process.stdout.write(
      'They resolve correctly but require credentials — treat as reachable.\n'
    );
    for (const r of authGated) {
      process.stdout.write(`  ${r.name}: ${r.url} → HTTP ${r.httpStatus}\n`);
    }
  }

  // Exit nonzero if any DEAD
  const dead = results.filter((r) => r.result === 'DEAD');
  if (dead.length > 0) {
    process.stdout.write(`\nERROR: ${dead.length} dead link(s) found:\n`);
    for (const r of dead) {
      const detail =
        r.httpStatus != null
          ? `HTTP ${r.httpStatus}`
          : (r.error ?? 'network error');
      process.stdout.write(`  ${r.name}: ${r.url} — ${detail}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('\nAll source links are reachable.\n');
  process.exit(0);
}

// Only run when executed directly; skip when imported as a module (e.g. in tests).
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
