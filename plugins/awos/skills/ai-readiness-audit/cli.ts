#!/usr/bin/env node
/**
 * cli.ts — single CLI dispatcher for the ai-readiness-audit engine.
 *
 * Bundled by build-engine.mjs → dist/cli.js (all imports inlined, no external deps).
 *
 * Usage:
 *   node dist/cli.js progress       <elapsed_seconds>  <done> <total>
 *   node dist/cli.js render         <audit.json>       --format md|html|both [--out-dir <dir>]
 *   node dist/cli.js rollup         <dir-of-per-repo-subdirs>
 *   node dist/cli.js audit-core     <repoPath>         <outDir>
 *   node dist/cli.js aggregate      <auditsDir>
 *   node dist/cli.js enrich         <repoPath>         <outDir>
 *   node dist/cli.js patch-judgment <auditsDir>        <patches.json|->
 *   node dist/cli.js report-context <auditsDir>
 *   node dist/cli.js patch-report   <auditsDir>        <blocks.json|->
 *   node dist/cli.js generate-backlog <auditsDir>      <tickets-draft.json|->
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Registries — assembled in detectors/index.ts and metrics/index.ts (adding a
// module is a change there, not here). Re-exported for existing consumers.
// ---------------------------------------------------------------------------
import { DETECTORS } from './detectors/index.ts';
import { METRICS } from './metrics/index.ts';
export { DETECTORS, METRICS };

import { loadStandards } from './metrics/_base.ts';

// ---------------------------------------------------------------------------
// Org rollup
// ---------------------------------------------------------------------------
import { rollup as orgRollup } from './metrics/org_rollup.ts';
import type { PerRepoInput } from './metrics/org_rollup.ts';
import { aiToolingCodes, readPerRepoAudit } from './metrics/rollup_input.ts';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
import { renderMarkdown, renderHtml } from './render.ts';
import type { AuditJson } from './render.ts';

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------
import { progress } from './progress.ts';

// ---------------------------------------------------------------------------
// audit-core (deterministic single-pass audit)
// ---------------------------------------------------------------------------
import { auditCore } from './audit_core.ts';
import { hasEngineProvenance } from './provenance.ts';
import {
  aggregate,
  patchJudgments,
  patchReportBlocks,
  reportContext,
  type ReportBlocksPatch,
} from './audit_patch.ts';
import { detectOrgParent } from './topology.ts';
import { generateBacklog, BacklogValidationError } from './backlog.ts';

/** Resolve the skill root (where references/ lives) from the bundle location. */
function resolveSkillRoot(): string {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  return cliDir.endsWith('/dist') || cliDir.endsWith('\\dist')
    ? dirname(cliDir)
    : cliDir;
}

/** Path of the bundled standards.toml (the scoring source of truth). */
function standardsTomlPath(): string {
  return join(resolveSkillRoot(), 'references', 'standards.toml');
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

/** Print an error object as JSON and exit non-zero — every verb's guard path. */
function fail(value: Record<string, unknown>): never {
  printJson(value);
  process.exit(1);
}

/**
 * Read a JSON argument from a file path or stdin ("-"), with the standard
 * error vocabulary shared by patch-judgment and patch-report.
 */
function readJsonArg(pathOrDash: string, what: string): unknown {
  let text: string;
  try {
    text =
      pathOrDash === '-'
        ? readFileSync(0, 'utf8')
        : readFileSync(pathOrDash, 'utf8');
  } catch (err) {
    fail({ error: `cannot read ${what}: ${String(err)}` });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    fail({ error: `${what} are not valid JSON: ${String(err)}` });
  }
}

async function main(): Promise<void> {
  const [, , command, arg1, arg2] = process.argv;

  if (!command) {
    fail({
      error: 'no command given',
      usage:
        'progress|render|rollup|audit-core|aggregate|enrich|patch-judgment|report-context|patch-report|generate-backlog <arg> [repoPath]',
    });
  }

  switch (command) {
    case 'rollup': {
      // Aggregate the FULL per-repo audits into ≤3 portfolio metrics, an org
      // headline (average delivery matrix), and enriched per-repo rows.
      //
      // Usage:
      //   node dist/cli.js rollup <per-repo-dir>
      //
      // <per-repo-dir> holds one SUBDIRECTORY per repo (as written by SKILL.md
      // Step 5's org branch): <per-repo-dir>/<repo>/audit.json plus
      // <per-repo-dir>/<repo>/collected/git.json. For each repo we read the
      // full audit — audit_total, coverage, the six delivery check values by
      // check_id — and the git artifact's per-active-contributor stats, then
      // derive the legacy summary fields so a flat <repo>.json is no longer
      // required. A repo dir missing either artifact is skipped (logged to
      // stderr), never crashing the whole rollup.
      const dirArg = arg1;
      if (!dirArg) {
        fail({
          error: 'rollup requires <per-repo-dir>',
          usage: 'node dist/cli.js rollup <per-repo-dir>',
        });
      }
      let entries: string[];
      try {
        entries = readdirSync(dirArg);
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        fail({
          error: `cannot read rollup directory: ${e.message}`,
          dir: dirArg,
        });
      }
      // Standards are optional for rollup — compute without weighting when
      // they can't be loaded (the AI-tooling code set then uses its fallback).
      let standardsR: Record<string, unknown> = {};
      try {
        standardsR = loadStandards(standardsTomlPath());
      } catch {
        /* optional */
      }
      const aiCodes = aiToolingCodes(standardsR);
      const perRepoResults: PerRepoInput[] = [];
      for (const entry of entries) {
        const repoDir = join(dirArg, entry);
        // Only descend into subdirectories (each a repo).
        try {
          if (!statSync(repoDir).isDirectory()) continue;
        } catch {
          continue;
        }
        const input = readPerRepoAudit(repoDir, entry, aiCodes);
        if (input) perRepoResults.push(input);
      }
      printJson(orgRollup(perRepoResults, standardsR));
      break;
    }

    case 'progress': {
      const elapsedStr = arg1;
      const doneStr = arg2;
      const [, , , , , totalStr] = process.argv;
      if (!elapsedStr || !doneStr || !totalStr) {
        fail({ error: 'progress requires <elapsed_seconds> <done> <total>' });
      }
      const elapsed_seconds = Number(elapsedStr);
      const done = Number(doneStr);
      const total = Number(totalStr);
      if (isNaN(elapsed_seconds) || isNaN(done) || isNaN(total)) {
        fail({ error: 'progress: all arguments must be numbers' });
      }
      printJson(progress({ elapsed_seconds, done, total }));
      break;
    }

    case 'render': {
      // Render an aggregated audit JSON → report.md or report.html.
      //
      // Usage:
      //   node dist/cli.js render <audit.json> --format md
      //   node dist/cli.js render <audit.json> --format html
      //
      // The audit JSON is the single source of truth (produced by SKILL.md
      // Step 5). The renderer is pure and deterministic — no clocks, no LLM.
      const auditPath = arg1;
      if (!auditPath) {
        fail({
          error: 'render requires <audit.json>',
          usage: 'node dist/cli.js render <audit.json> --format md|html',
        });
      }
      // Parse --format flag from remaining argv
      const remainingArgs = process.argv.slice(4);
      const fmtIdx = remainingArgs.indexOf('--format');
      const format = fmtIdx !== -1 ? remainingArgs[fmtIdx + 1] : 'md';
      if (format !== 'md' && format !== 'html' && format !== 'both') {
        fail({
          error: `render --format must be "md", "html", or "both", got "${format}"`,
        });
      }
      // `--format both` writes report.md + report.html into --out-dir in one
      // process (single spawn instead of two). Single-format modes keep writing
      // to stdout for back-compat.
      const outDirIdx = remainingArgs.indexOf('--out-dir');
      const outDirArg =
        outDirIdx !== -1 ? remainingArgs[outDirIdx + 1] : undefined;
      if (format === 'both' && !outDirArg) {
        fail({
          error: 'render --format both requires --out-dir <dir>',
          usage:
            'node dist/cli.js render <audit.json> --format both --out-dir <dir>',
        });
      }
      let rawAudit: string;
      try {
        rawAudit = readFileSync(auditPath, 'utf8');
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        fail({
          error: `cannot read audit JSON: ${e.message}`,
          path: auditPath,
        });
      }
      let audit: AuditJson;
      try {
        audit = JSON.parse(rawAudit) as AuditJson;
      } catch (err: unknown) {
        const e = err as Error;
        fail({
          error: `audit JSON is not valid JSON: ${e.message}`,
          path: auditPath,
        });
      }
      // Circuit-breaker: a single-repo audit.json must carry audit-core's
      // provenance stamp — a hand-assembled one is never rendered. Org
      // portfolio JSON (portfolio_metrics/per_repo present) is exempt: the
      // orchestrator legitimately assembles it from the rollup output, and
      // rollup already refuses unstamped per-repo audits.
      const isOrgAudit =
        audit.portfolio_metrics !== undefined || audit.per_repo !== undefined;
      if (!isOrgAudit && !hasEngineProvenance(audit)) {
        fail({
          error:
            'audit JSON lacks engine provenance — it was not produced by ' +
            'audit-core, so it cannot be rendered. Deterministic scoring is ' +
            "the engine's job: run `node dist/cli.js audit-core <repoPath> " +
            '<outDir>` (then enrich / patch-judgment) and render the ' +
            'audit.json it writes.',
          path: auditPath,
        });
      }
      if (format === 'both') {
        const dir = outDirArg as string;
        mkdirSync(dir, { recursive: true });
        // A per-repo report inside an org run lives at
        // <org>/per-repo/<repo>/report.html — give it a link back to the org
        // report two levels up. Detected from the out-dir path, so the
        // orchestrator doesn't have to remember a flag.
        const isPerRepo = /[\\/]per-repo[\\/][^\\/]+[\\/]?$/.test(resolve(dir));
        const mdOpts = isPerRepo ? { backLink: '../../report.md' } : {};
        // #repos returns the reader to the org Repositories table (the place
        // they navigated from) instead of the top of the org report.
        const htmlOpts = isPerRepo
          ? { backLink: '../../report.html#repos' }
          : {};
        writeFileSync(
          join(dir, 'report.md'),
          renderMarkdown(audit, mdOpts) + '\n'
        );
        writeFileSync(
          join(dir, 'report.html'),
          renderHtml(audit, htmlOpts) + '\n'
        );
        printJson({
          rendered: ['report.md', 'report.html'],
          out_dir: dir,
          ...(isPerRepo ? { back_link: true } : {}),
        });
        break;
      }
      const output =
        format === 'html' ? renderHtml(audit) : renderMarkdown(audit);
      process.stdout.write(output + '\n');
      break;
    }

    // audit-core: deterministic single-pass audit — runs every detected/
    // computed category and writes <out>/<dimension>.json + <out>/audit.json;
    // judgment categories are emitted as PENDING_JUDGMENT and connector
    // metrics SKIP without a connector.
    // enrich: the same pass re-scored against the already-populated
    // collected/ dir (after the orchestrator fetched connectors), so
    // connector metrics now score instead of SKIP. Judgment checks are
    // (re)emitted as PENDING_JUDGMENT, so run enrich BEFORE the judgment patch.
    case 'audit-core':
    case 'enrich': {
      const repoPath = arg1;
      const outDir = arg2;
      if (!repoPath || !outDir) {
        fail({ error: `${command} requires <repoPath> <outDir>` });
      }
      if (command === 'audit-core') {
        // Org-parent guard: a folder that is not itself a git work tree but
        // holds ≥2 git repos is the org's clone folder, not a project. A
        // single-repo audit of it is a stray, meaningless report (judgment
        // checks stay PENDING_JUDGMENT forever) — skip cleanly; org mode
        // audits each child repo into per-repo/ instead.
        const orgParent = detectOrgParent(repoPath);
        if (orgParent.isOrgParent) {
          process.stderr.write(
            `audit-core: ${repoPath} is an org folder (${orgParent.gitRepoChildren} git repos inside, not itself a repo) — skipping single-repo audit; org mode audits each repo into per-repo/\n`
          );
          printJson({
            skipped: 'org-parent',
            repo_path: repoPath,
            git_repo_children: orgParent.gitRepoChildren,
          });
          break;
        }
      }
      const summary = await auditCore(
        repoPath,
        outDir,
        DETECTORS,
        METRICS,
        standardsTomlPath(),
        command === 'enrich' ? join(outDir, 'collected') : undefined
      );
      printJson(summary);
      break;
    }

    case 'aggregate': {
      // Re-sum audit.json from the per-dimension files after judgment/connector
      // patches. Preserves authored report blocks; run before render.
      const dir = arg1;
      if (!dir) {
        fail({ error: 'aggregate requires <auditsDir>' });
      }
      aggregate(dir);
      printJson({ aggregated: dir });
      break;
    }

    case 'patch-judgment': {
      // Apply ALL judgment verdicts in one call and re-aggregate — replaces
      // per-check JSON surgery. Patches come from a JSON file (or "-" for
      // stdin): [{check_id, status, score?, confidence?, value?, evidence?}, ...]
      const dir = arg1;
      const patchArg = arg2;
      if (!dir || !patchArg) {
        fail({
          error:
            'patch-judgment requires <auditsDir> <patches.json|-> — patches: [{check_id, status, score?, confidence?, value?, evidence?}]',
        });
      }
      const patches = readJsonArg(patchArg, 'patches');
      if (!Array.isArray(patches)) {
        fail({ error: 'patches must be a JSON array' });
      }
      const summary = patchJudgments(
        dir,
        patches as Parameters<typeof patchJudgments>[1]
      );
      printJson({ ...summary, aggregated: dir });
      break;
    }

    case 'report-context': {
      // Read-only: dump the flattened authoring context (check values/hints,
      // git window stats, tracker fetch meta) so the orchestrator transcribes
      // report blocks from ONE call instead of parsing artifacts itself.
      const dir = arg1;
      if (!dir) {
        fail({ error: 'report-context requires <auditsDir>' });
      }
      printJson(reportContext(dir));
      break;
    }

    case 'patch-report': {
      // Apply the orchestrator-authored report blocks (headline / insights /
      // recommendations) to audit.json in one call and emit
      // recommendations.md from the same array. Blocks come from a JSON file
      // (or "-" for stdin): {headline?, insights?, recommendations?}.
      // The orchestrator never edits audit.json directly.
      const dir = arg1;
      const blocksArg = arg2;
      if (!dir || !blocksArg) {
        fail({
          error:
            'patch-report requires <auditsDir> <blocks.json|-> — blocks: {headline?, insights?, recommendations?}',
        });
      }
      const blocks = readJsonArg(blocksArg, 'blocks');
      if (
        blocks === null ||
        typeof blocks !== 'object' ||
        Array.isArray(blocks)
      ) {
        fail({
          error:
            'blocks must be a JSON object with headline/insights/recommendations keys',
        });
      }
      const summary = patchReportBlocks(dir, blocks as ReportBlocksPatch);
      printJson(summary);
      break;
    }

    case 'generate-backlog': {
      // Turn the orchestrator's ticket draft into the validated, rendered
      // backlog (backlog.json + tickets/*.md + backlog.html). All numbers are
      // computed here; the draft carries only prose, effort, deps, and shares.
      const dir = arg1;
      const draftArg = arg2;
      if (!dir || !draftArg) {
        fail({
          error:
            'generate-backlog requires <auditsDir> <tickets-draft.json|-> — draft: {tickets:[{id,title,goal,description,effort_dev_days,definition_of_done,depends_on,checks:[{check_id,share}]}]}',
        });
      }
      const draft = readJsonArg(draftArg, 'ticket draft');
      try {
        printJson(generateBacklog(dir, draft));
      } catch (err) {
        if (err instanceof BacklogValidationError) {
          fail({
            error: 'draft failed validation',
            violations: err.violations,
          });
        }
        throw err;
      }
      break;
    }

    default: {
      fail({
        error: `unknown command "${command}"`,
        usage:
          'progress|render|rollup|audit-core|aggregate|enrich|patch-judgment|report-context|patch-report|generate-backlog <arg> [repoPath]',
      });
    }
  }
}

// Only run as CLI entry point — skip when imported as a module (e.g. by tests).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    // When bundled as dist/cli.js the resolved path is the bundle itself.
    process.argv[1].endsWith('/dist/cli.js') ||
    process.argv[1].endsWith('\\dist\\cli.js'));

if (isMain) {
  main().catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
  });
}
