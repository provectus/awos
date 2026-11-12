#!/usr/bin/env node
// Pure, deterministic graders for one archived eval run.
// Reads only files inside the run directory (plus the fixture manifests) and
// writes metrics.json — no API calls, no network, fully unit-testable.
// Metric definitions are pre-registered in docs/2.0/c4-diagram-eval-plan.md.
//
// Expected run-dir layout (written by run-eval.mjs):
//   meta.json                  { arm, runIndex, model, cliVersion, startedAt,
//                                autoContinuations, stalled }
//   transcript-tasks.jsonl     stream-json of session 1
//   transcript-implement.jsonl stream-json of session 2
//   tasks.md                   the tasks document session 1 produced
//   diff.patch                 git diff of the scratch copy after session 2
//   changed-files.txt          git diff --name-status output
//   postrun-files.txt          one relative path per line: full post-run tree
//   test-results.json          { pass, fail, total } from the fixture's own suite
//
// CLI: node grade-run.mjs <run-dir> <fixture-dir>

'use strict';

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// --- stream-json -----------------------------------------------------------

export function parseTranscript(jsonl) {
  const events = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // partial/garbled line: skip, the result event is what matters
    }
  }
  return events;
}

export function sessionUsage(events) {
  const result = [...events].reverse().find((e) => e.type === 'result');
  const usage = result?.usage ?? {};
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    durationMs: result?.duration_ms ?? 0,
    numTurns: result?.num_turns ?? 0,
  };
}

export function countQuestions(events) {
  let count = 0;
  for (const e of events) {
    const content = e.message?.content;
    if (e.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_use' && block.name === 'AskUserQuestion')
        count++;
    }
  }
  return count;
}

// --- reference extraction --------------------------------------------------

// A "reference" is a path-like or endpoint-like string the run names. A
// hallucination is a reference that fails to resolve against the post-run
// tree (fixture files plus whatever the run itself created). New code naming
// new things it also creates is therefore fine by construction.

const PATHISH_RE = /^(?:\.{1,2}\/)?[\w./-]+\.(?:js|mjs|cjs|json|md|ts)$/;
const ENDPOINT_RE = /^\/[\w:/-]+$/;

export function extractTaskRefs(tasksMd) {
  const refs = new Set();
  for (const match of tasksMd.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim();
    if (PATHISH_RE.test(token) || ENDPOINT_RE.test(token)) refs.add(token);
  }
  return [...refs];
}

export function extractDiffRefs(diffPatch) {
  const refs = new Set();
  for (const line of diffPatch.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const m of line.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      refs.add(m[1]);
    }
    for (const m of line.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      refs.add(m[1]);
    }
  }
  // Only module-path references are resolvable claims; bare package names
  // (node:*, etc.) are not fixture references.
  return [...refs].filter(
    (r) =>
      r.startsWith('.') ||
      r.startsWith('packages/') ||
      r.startsWith('services/')
  );
}

function normalize(p) {
  return p.replace(/^\.\//, '').replace(/\\/g, '/');
}

export function resolveRefs(refs, postrunFiles, sourceText) {
  const files = new Set(postrunFiles.map(normalize));
  const basenames = new Set([...files].map((f) => f.split('/').pop()));
  const unresolved = [];
  for (const ref of refs) {
    if (ENDPOINT_RE.test(ref) && !ref.includes('.')) {
      // Endpoint: resolves if its route literal (or its :param-less prefix)
      // appears anywhere in the post-run sources.
      const prefix = ref.split('/:')[0];
      if (!sourceText.includes(ref) && !sourceText.includes(prefix))
        unresolved.push(ref);
      continue;
    }
    // Strip ./ and ../ segments: the grader has no anchor file for relative
    // requires, so a relative ref resolves if any post-run file matches its
    // trailing path (e.g. '../validation' -> some .../validation.js).
    const n = normalize(ref).replace(/^(\.\.\/)+/, '');
    const candidates = [n, `${n}.js`, `${n}.mjs`, `${n}/index.js`];
    // The bare-basename fallback applies only to refs with no directory
    // part: the fixtures deliberately repeat basenames across services
    // (errors.js, retry.js, ...), so a wrong-directory reference — exactly
    // the cross-service confusion under measurement — must not resolve just
    // because the filename exists somewhere.
    const hit =
      candidates.some((c) => files.has(c)) ||
      candidates.some((c) => [...files].some((f) => f.endsWith(`/${c}`))) ||
      (!n.includes('/') && candidates.some((c) => basenames.has(c)));
    if (!hit) unresolved.push(ref);
  }
  return unresolved;
}

// --- scope -----------------------------------------------------------------

export function parseChangedFiles(nameStatus) {
  const files = [];
  for (const line of nameStatus.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\t+/);
    // R<score> old new -> count the destination; others -> the single path.
    files.push(normalize(parts[parts.length - 1]));
  }
  return files;
}

export function outOfScope(changedFiles, scope) {
  const allowed = (scope.allowed ?? []).map(normalize);
  const ignored = (scope.ignored ?? []).map(normalize);
  const permits = (prefixes, f) =>
    prefixes.some(
      (p) => f === p || f.startsWith(p.endsWith('/') ? p : `${p}/`)
    );
  return changedFiles.filter(
    (f) => !permits(ignored, f) && !permits(allowed, f)
  );
}

// --- drift -----------------------------------------------------------------

// plannedNotTouched: files tasks.md names that exist but the diff never
// touched. touchedNotPlanned: files the diff touched that tasks.md never
// names. Both directions of tasks<->implement drift, per the proposal.
export function drift(taskRefs, changedFiles, postrunFiles) {
  const files = new Set(postrunFiles.map(normalize));
  const changed = new Set(changedFiles.map(normalize));
  const plannedFiles = taskRefs
    .map(normalize)
    .filter((r) => files.has(r) || [...files].some((f) => f.endsWith(`/${r}`)));
  const resolveFull = (r) =>
    files.has(r) ? r : ([...files].find((f) => f.endsWith(`/${r}`)) ?? r);
  const plannedFull = new Set(plannedFiles.map(resolveFull));
  const plannedNotTouched = [...plannedFull].filter((f) => !changed.has(f));
  const touchedNotPlanned = [...changed].filter((f) => !plannedFull.has(f));
  return { plannedNotTouched, touchedNotPlanned };
}

// --- assemble --------------------------------------------------------------

export function gradeRun(runDir, fixtureDir) {
  const read = (name) => readFileSync(join(runDir, name), 'utf8');
  const meta = JSON.parse(read('meta.json'));
  const scope = JSON.parse(
    readFileSync(join(fixtureDir, 'scope.json'), 'utf8')
  );
  const tasksEvents = parseTranscript(read('transcript-tasks.jsonl'));
  const implEvents = parseTranscript(read('transcript-implement.jsonl'));
  const tasksMd = read('tasks.md');
  const diffPatch = read('diff.patch');
  const postrunFiles = read('postrun-files.txt').split('\n').filter(Boolean);
  const changedFiles = parseChangedFiles(read('changed-files.txt'));
  const testResults = JSON.parse(read('test-results.json'));
  // Endpoint references resolve against the post-run sources plus the
  // fixture's symbols.json endpoint manifest — the manifest covers archives
  // from before the harness wrote postrun-sources.txt, and catches endpoint
  // spellings the concatenation heuristics miss.
  const symbolsPath = join(fixtureDir, 'symbols.json');
  const symbols = existsSync(symbolsPath)
    ? JSON.parse(readFileSync(symbolsPath, 'utf8'))
    : { endpoints: [], files: [] };
  const sourceText =
    (existsSync(join(runDir, 'postrun-sources.txt'))
      ? read('postrun-sources.txt')
      : diffPatch) +
    '\n' +
    (symbols.endpoints ?? []).map((e) => `'${e}'`).join('\n');

  const taskRefs = extractTaskRefs(tasksMd);
  const diffRefs = extractDiffRefs(diffPatch);
  // Ignored paths (planning docs, runtime state, install artifacts) are
  // neither in nor out of scope, and edits there are not drift either —
  // implement legitimately ticks checkboxes in context/.../tasks.md.
  const ignored = (scope.ignored ?? []).map((p) => p.replace(/\/$/, ''));
  const gradableChanged = changedFiles.filter(
    (f) => !ignored.some((p) => f === p || f.startsWith(`${p}/`))
  );
  const hallucinated = {
    tasksStage: resolveRefs(taskRefs, postrunFiles, sourceText),
    implementStage: resolveRefs(diffRefs, postrunFiles, sourceText),
  };

  return {
    arm: meta.arm,
    runIndex: meta.runIndex,
    model: meta.model,
    stalled: Boolean(meta.stalled),
    tests: testResults,
    testsAllPass: testResults.total > 0 && testResults.fail === 0,
    hallucinated,
    hallucinatedCount:
      hallucinated.tasksStage.length + hallucinated.implementStage.length,
    outOfScopeEdits: outOfScope(changedFiles, scope),
    questions:
      countQuestions(tasksEvents) +
      countQuestions(implEvents) +
      (meta.autoContinuations ?? 0),
    usage: {
      tasksStage: sessionUsage(tasksEvents),
      implementStage: sessionUsage(implEvents),
    },
    drift: drift(taskRefs, gradableChanged, postrunFiles),
  };
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const [runDir, fixtureDir] = process.argv.slice(2);
  if (!runDir || !fixtureDir) {
    console.error('usage: node grade-run.mjs <run-dir> <fixture-dir>');
    process.exit(1);
  }
  const metrics = gradeRun(runDir, fixtureDir);
  writeFileSync(join(runDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
}
