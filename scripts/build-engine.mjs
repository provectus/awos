#!/usr/bin/env node
/**
 * build-engine.mjs — esbuild driver for the ai-readiness-audit engine.
 *
 * Bundles cli.ts (single entrypoint) → dist/cli.js with all imports inlined.
 * Format: ESM, platform: node, target: node22.
 *
 * Before building, CLEANS dist/ (removes every file except .gitkeep) so that
 * stale flat + nested artefacts from the old multi-entrypoint layout disappear.
 *
 * .wasm hook is present but a no-op until web-tree-sitter is wired.
 */

import { build } from 'esbuild';
import {
  readdirSync,
  rmSync,
  statSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = join(
  repoRoot,
  'plugins',
  'awos',
  'skills',
  'ai-readiness-audit'
);
const distDir = join(skillRoot, 'dist');

// ---------------------------------------------------------------------------
// 1. Clean dist/ — remove everything except .gitkeep
// ---------------------------------------------------------------------------
mkdirSync(distDir, { recursive: true });

function cleanDir(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.gitkeep') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      rmSync(full, { recursive: true, force: true });
    } else {
      rmSync(full, { force: true });
    }
  }
}

cleanDir(distDir);
console.log('build-engine: cleaned dist/ (preserved .gitkeep)');

// ---------------------------------------------------------------------------
// 2. Bundle cli.ts → dist/cli.js
// ---------------------------------------------------------------------------
const entryPoint = join(skillRoot, 'cli.ts');

await build({
  entryPoints: [entryPoint],
  outfile: join(distDir, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});

console.log('build-engine: bundled cli.ts → dist/cli.js');

// ---------------------------------------------------------------------------
// 3. Write dist/package.json with {"type":"module"} so node treats dist/cli.js
//    as an ES module and suppresses the MODULE_TYPELESS_PACKAGE_JSON warning.
// ---------------------------------------------------------------------------
writeFileSync(
  join(distDir, 'package.json'),
  JSON.stringify({ type: 'module' }) + '\n'
);
console.log('build-engine: wrote dist/package.json (type: module)');

// ---------------------------------------------------------------------------
// 4. .wasm copy hook (no-op for now; web-tree-sitter support lands later)
// ---------------------------------------------------------------------------
const wasmFiles = readdirSync(skillRoot).filter((f) => f.endsWith('.wasm'));
for (const wasm of wasmFiles) {
  copyFileSync(join(skillRoot, wasm), join(distDir, basename(wasm)));
  console.log(`build-engine: copied ${wasm} → dist/${wasm}`);
}
