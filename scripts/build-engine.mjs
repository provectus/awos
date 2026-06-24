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
  existsSync,
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
  // Inject CommonJS globals (__dirname, __filename) into the bundle.
  // web-tree-sitter@0.24 is a CJS module that uses __dirname to locate
  // the core wasm file.  Without this, the bundled ESM context has no
  // __dirname, causing Parser.init() to fail at runtime.
  banner: {
    js: [
      // Inject CommonJS globals that web-tree-sitter@0.24 (a CJS module) needs
      // when bundled into an ESM context by esbuild.  Without these:
      //   - __dirname is undefined → scriptDirectory = "undefined/"
      //   - require("fs") throws "Dynamic require is not supported"
      'import { createRequire as __createRequire } from "node:module";',
      'import { fileURLToPath as __fileURLToPath } from "node:url";',
      'import { dirname as __dirname2 } from "node:path";',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __dirname2(__filename);',
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
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
// 4. Copy web-tree-sitter core wasm → dist/tree-sitter.wasm
// ---------------------------------------------------------------------------
// web-tree-sitter@0.24 ships tree-sitter.wasm; @0.26 ships web-tree-sitter.wasm.
// Check for both names so the build works if the version is ever upgraded.
const wtsDir = join(repoRoot, 'node_modules', 'web-tree-sitter');
const webTreeSitterWasmCandidates = [
  join(wtsDir, 'tree-sitter.wasm'), // 0.24 and earlier
  join(wtsDir, 'web-tree-sitter.wasm'), // 0.26+
];
const webTreeSitterWasm = webTreeSitterWasmCandidates.find(existsSync);
if (webTreeSitterWasm) {
  copyFileSync(webTreeSitterWasm, join(distDir, 'tree-sitter.wasm'));
  console.log(
    `build-engine: copied ${webTreeSitterWasm.split('/').pop()} → dist/tree-sitter.wasm`
  );
} else {
  console.warn(
    'build-engine: WARNING — tree-sitter core wasm not found; adp_g10_complexity will SKIP'
  );
}

// ---------------------------------------------------------------------------
// 5. Copy tree-sitter-wasms grammar files → dist/grammars/
// ---------------------------------------------------------------------------
const BUNDLED_GRAMMARS = [
  'tree-sitter-javascript.wasm',
  'tree-sitter-typescript.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-python.wasm',
  'tree-sitter-go.wasm',
  'tree-sitter-java.wasm',
  'tree-sitter-ruby.wasm',
  'tree-sitter-c_sharp.wasm',
  'tree-sitter-c.wasm',
  'tree-sitter-cpp.wasm',
  'tree-sitter-rust.wasm',
  'tree-sitter-php.wasm',
  'tree-sitter-kotlin.wasm',
];

const grammarsSourceDir = join(
  repoRoot,
  'node_modules',
  'tree-sitter-wasms',
  'out'
);
const grammarsDestDir = join(distDir, 'grammars');
mkdirSync(grammarsDestDir, { recursive: true });

for (const grammar of BUNDLED_GRAMMARS) {
  const src = join(grammarsSourceDir, grammar);
  if (existsSync(src)) {
    copyFileSync(src, join(grammarsDestDir, grammar));
    console.log(`build-engine: copied ${grammar} → dist/grammars/${grammar}`);
  } else {
    console.warn(`build-engine: WARNING — grammar not found: ${grammar}`);
  }
}
