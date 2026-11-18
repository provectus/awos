#!/usr/bin/env node
// Regenerates symbols.json — the manifest of every real identifier in the
// fixture, consumed by the eval's hallucination grader. Re-run whenever the
// fixture changes; tests/c4-evals.test.js asserts the committed file matches.
//
//   node tests/fixtures/eval-c4-multiservice/generate-symbols.mjs [--write]

'use strict';

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_ROOT = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(FIXTURE_ROOT, 'project');

function listFiles(root, base = root, acc = []) {
  for (const entry of readdirSync(root).sort()) {
    if (entry === 'node_modules' || entry === 'var' || entry === '.git')
      continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) listFiles(full, base, acc);
    else acc.push(relative(base, full));
  }
  return acc;
}

export function generateSymbols() {
  const files = listFiles(PROJECT_ROOT);
  const endpoints = new Set();
  const identifiers = new Set();
  for (const file of files) {
    if (!/\.(js|mjs|cjs)$/.test(file)) continue;
    const src = readFileSync(join(PROJECT_ROOT, file), 'utf8');
    for (const m of src.matchAll(/['"](\/[\w:/-]{2,})['"]/g))
      endpoints.add(m[1]);
    for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g))
      identifiers.add(m[1]);
    for (const m of src.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g))
      identifiers.add(m[1]);
    for (const m of src.matchAll(
      /(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g
    )) {
      identifiers.add(m[1]);
    }
  }
  return {
    files,
    endpoints: [...endpoints].sort(),
    identifiers: [...identifiers].sort(),
  };
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const json = JSON.stringify(generateSymbols(), null, 2) + '\n';
  if (process.argv.includes('--write')) {
    writeFileSync(join(FIXTURE_ROOT, 'symbols.json'), json);
    console.log('symbols.json written');
  } else {
    process.stdout.write(json);
  }
}
