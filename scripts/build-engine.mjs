#!/usr/bin/env node
/**
 * build-engine.mjs — thin esbuild driver for the ai-readiness-audit engine.
 *
 * Bundles every entrypoint under the skill root to dist/*.js.
 * Format: ESM, platform: node, bundled.
 * Copies any .wasm files alongside the bundle (for future web-tree-sitter support).
 */

import { build } from 'esbuild';
import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
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

mkdirSync(distDir, { recursive: true });

// Collect entrypoints: top-level .ts files in collectors/, detectors/, metrics/.
const layers = ['collectors', 'detectors', 'metrics'];
const entryPoints = [];

for (const layer of layers) {
  const layerDir = join(skillRoot, layer);
  if (!existsSync(layerDir)) continue;
  for (const f of readdirSync(layerDir)) {
    if (f.endsWith('.ts') && !f.endsWith('.test.ts')) {
      entryPoints.push(join(layerDir, f));
    }
  }
}

if (entryPoints.length === 0) {
  // No entrypoints yet — write a sentinel so CI can verify the bundle step runs.
  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync(join(distDir, 'engine.js'), '// engine bundle placeholder\n');
  });
  console.log(
    'build-engine: no entrypoints yet — wrote dist/engine.js placeholder'
  );
} else {
  await build({
    entryPoints,
    outdir: distDir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
  });

  // Copy any .wasm files from the skill tree into dist/ for future use.
  const wasmFiles = readdirSync(skillRoot).filter((f) => f.endsWith('.wasm'));
  for (const wasm of wasmFiles) {
    copyFileSync(join(skillRoot, wasm), join(distDir, basename(wasm)));
  }

  console.log(
    `build-engine: bundled ${entryPoints.length} entrypoint(s) to dist/`
  );
}
