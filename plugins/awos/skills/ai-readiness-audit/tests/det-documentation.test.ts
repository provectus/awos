import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectRootReadme,
  detectServiceReadmes,
  detectApiDocs,
  detectDocsAccuracy,
  DETECTORS,
} from '../detectors/documentation.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'doc-'));
}

// ---------------------------------------------------------------------------
// detectRootReadme (2200 — DOC-01, detected)
// ---------------------------------------------------------------------------

test('DOC-01: no README is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectRootReadme(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('DOC-01: README.md with setup instructions is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# My Project',
      '',
      '## Installation',
      '',
      'Run `npm install` to install all project dependencies.',
      'This will download and configure all required packages.',
      '',
      '## Usage',
      '',
      'Run `npm start` to start the development server.',
      'Open http://localhost:3000 in your browser.',
      '',
      '## Getting Started',
      '',
      'Clone the repository, then follow the installation steps above.',
      'Make sure you have Node.js 22+ installed before proceeding.',
    ].join('\n')
  );
  const r = detectRootReadme(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('README.md')));
});

test('DOC-01: empty README (< 200 bytes) is WARN', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# My Project\n');
  const r = detectRootReadme(t);
  assert.equal(r.status, 'WARN');
});

test('DOC-01: README without setup/install keywords is WARN', () => {
  const t = tmp();
  // Long enough but no setup keywords
  writeFileSync(
    join(t, 'README.md'),
    '# My Project\n\n' + 'This is a project that does things. '.repeat(10)
  );
  const r = detectRootReadme(t);
  assert.equal(r.status, 'WARN');
});

test('DOC-01: README.rst is detected as README', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.rst'),
    [
      'My Project',
      '==========',
      '',
      'Installation',
      '------------',
      '',
      'Run pip install to setup the project.',
      'This installs all necessary dependencies for the project.',
      'Make sure you have Python 3.10+ and pip available.',
      '',
      'Usage',
      '-----',
      '',
      'Run python main.py to start the application.',
      'The server will start on port 8000 by default.',
      'You can configure this in the settings file.',
    ].join('\n')
  );
  const r = detectRootReadme(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectServiceReadmes (2201 — DOC-02, detected)
// ---------------------------------------------------------------------------

test('DOC-02: no top-level service directories returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectServiceReadmes(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'detected');
});

test('DOC-02: all service dirs have README is PASS', () => {
  const t = tmp();
  for (const svc of ['api', 'frontend', 'worker']) {
    mkdirSync(join(t, svc));
    // Add enough source files to count as a service
    for (let i = 0; i < 6; i++) {
      writeFileSync(join(t, svc, `module${i}.ts`), `export const x = ${i};\n`);
    }
    writeFileSync(
      join(t, svc, 'README.md'),
      `# ${svc}\n\n## Setup\n\nRun npm install\n`
    );
  }
  const r = detectServiceReadmes(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('DOC-02: majority of service dirs missing README is FAIL', () => {
  const t = tmp();
  for (const svc of ['api', 'frontend', 'worker', 'scheduler']) {
    mkdirSync(join(t, svc));
    for (let i = 0; i < 6; i++) {
      writeFileSync(join(t, svc, `module${i}.ts`), `export const x = ${i};\n`);
    }
    // Only one has README
  }
  writeFileSync(
    join(t, 'api', 'README.md'),
    '# api\n\n## Setup\n\nRun npm install\n'
  );
  const r = detectServiceReadmes(t);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.evidence.some((e) => e.includes('README MISSING')));
});

test('DOC-02: single src/ layout dir is SKIP, not FAIL — one code dir is not a multi-service repo', () => {
  const t = tmp();
  mkdirSync(join(t, 'src'));
  for (let i = 0; i < 6; i++) {
    writeFileSync(join(t, 'src', `module${i}.ts`), `export const x = ${i};\n`);
  }
  const r = detectServiceReadmes(t);
  assert.equal(
    r.status,
    'SKIP',
    `single-src/ repo must SKIP DOC-02 (single-service), got ${r.status}`
  );
});

test('DOC-02: layout dirs (src/tests/lib/app) are never counted as services', () => {
  const t = tmp();
  for (const dir of ['src', 'tests', 'lib', 'app']) {
    mkdirSync(join(t, dir));
    for (let i = 0; i < 6; i++) {
      writeFileSync(join(t, dir, `module${i}.ts`), `export const x = ${i};\n`);
    }
  }
  const r = detectServiceReadmes(t);
  assert.equal(
    r.status,
    'SKIP',
    `conventional layout dirs must not demand per-service READMEs, got ${r.status}`
  );
});

test('DOC-02: a single non-layout candidate dir is SKIP (no multi-service structure)', () => {
  const t = tmp();
  mkdirSync(join(t, 'backend'));
  for (let i = 0; i < 6; i++) {
    writeFileSync(
      join(t, 'backend', `module${i}.ts`),
      `export const x = ${i};\n`
    );
  }
  const r = detectServiceReadmes(t);
  assert.equal(
    r.status,
    'SKIP',
    `one candidate dir is not a multi-service layout, got ${r.status}`
  );
});

// ---------------------------------------------------------------------------
// detectApiDocs (2202 — DOC-03, detected)
// ---------------------------------------------------------------------------

test('DOC-03: no API source returns SKIP', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'utils.ts'),
    'export const add = (a: number, b: number) => a + b;\n'
  );
  const r = detectApiDocs(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'detected');
});

test('DOC-03: FastAPI source with auto-docs is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'main.py'),
    'from fastapi import FastAPI\napp = FastAPI(title="My API")\n'
  );
  const r = detectApiDocs(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('auto-docs')));
});

test('DOC-03: openapi.yaml present with API source is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'server.ts'),
    'import express from "express";\nconst app = express();\napp.get("/users", handler);\n'
  );
  writeFileSync(
    join(t, 'openapi.yaml'),
    'openapi: "3.0.0"\ninfo:\n  title: My API\n  version: "1.0"\n'
  );
  const r = detectApiDocs(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('openapi.yaml')));
});

test('DOC-03: Express API with no docs is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'server.ts'),
    'import express from "express";\nconst app = express();\napp.get("/users", handler);\n'
  );
  const r = detectApiDocs(t);
  assert.equal(r.status, 'FAIL');
});

// Regression for the dead \b(...)\b wrapper: `\b@` never matches and a
// trailing `\b` after `(`/`)` killed `express()` — these API surfaces were
// invisible, so DOC-03 SKIPped instead of evaluating.
test('DOC-03: Flask @app.route decorator is recognised as API source (FAIL without docs)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'views.py'),
    'from flask import request\n\n@app.route("/users", methods=["GET"])\ndef users():\n    return []\n'
  );
  const r = detectApiDocs(t);
  assert.equal(
    r.status,
    'FAIL',
    `@app.route( must count as API source (not SKIP), got ${r.status}`
  );
});

test('DOC-03: Spring @RestController is recognised as API source (FAIL without docs)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'UserController.java'),
    '@RestController\npublic class UserController {\n}\n'
  );
  const r = detectApiDocs(t);
  assert.equal(
    r.status,
    'FAIL',
    `@RestController must count as API source (not SKIP), got ${r.status}`
  );
});

test('DOC-03: bare express() call is recognised as API source (FAIL without docs)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'server.js'),
    'const express = require("express");\nconst server = express();\n'
  );
  const r = detectApiDocs(t);
  assert.equal(
    r.status,
    'FAIL',
    `express() must count as API source (not SKIP), got ${r.status}`
  );
});

// ---------------------------------------------------------------------------
// detectDocsAccuracy (2203 — DOC-04, detected)
// ---------------------------------------------------------------------------

test('DOC-04: no README.md returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'detected');
});

test('DOC-04: README with no make refs or local links is PASS (0 missing)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    '# Project\n\nThis project has no build system or external references.\nJust read the source code.\n'
  );
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.equal(r.value, 0);
});

test('DOC-04: README referencing 3 nonexistent make targets is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# Project',
      '',
      '## Development',
      '',
      'Run `make setup` to install dependencies.',
      'Run `make test` to run the test suite.',
      'Run `make deploy` to deploy to production.',
      'Run `make lint` to check code style.',
    ].join('\n')
  );
  // No Makefile exists — all make refs are missing
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'FAIL');
  assert.ok(Number(r.value) >= 3);
  assert.ok(r.evidence.some((e) => e.includes('make')));
});

test('DOC-04: README with all valid make targets is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# Project',
      '',
      'Run `make test` to run tests.',
      'Run `make build` to build.',
    ].join('\n')
  );
  writeFileSync(
    join(t, 'Makefile'),
    'test:\n\tpnpm test\nbuild:\n\tpnpm build\n'
  );
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('make test')));
});

test('DOC-04: README referencing 1-2 missing make targets is WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# Project',
      '',
      'Run `make test` to run tests.',
      'Run `make nonexistent` to do magic.',
    ].join('\n')
  );
  writeFileSync(join(t, 'Makefile'), 'test:\n\tpnpm test\n');
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'WARN');
  assert.equal(Number(r.value), 1);
  assert.ok(r.evidence.some((e) => e.includes('nonexistent')));
});

test('DOC-04: README with local link to existing file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    '# Project\n\nSee [CONTRIBUTING](./CONTRIBUTING.md) for details.\n'
  );
  writeFileSync(join(t, 'CONTRIBUTING.md'), '# Contributing\n');
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'PASS');
});

test('DOC-04: README with 3 broken local links is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# Project',
      '',
      'See [docs](./docs/setup.md) for setup.',
      'See [API](./docs/api.md) for API reference.',
      'See [config](./config/example.yaml) for configuration.',
      'See [CONTRIBUTING](./CONTRIBUTING.md) for contributing.',
    ].join('\n')
  );
  // None of the referenced files exist
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'FAIL');
  assert.ok(Number(r.value) >= 3);
});

test('DOC-04: README with make targets referencing missing Makefile is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# Project',
      '',
      'Run `make setup` first.',
      'Then `make test`.',
      'Finally `make deploy`.',
    ].join('\n')
  );
  // No Makefile in this repo — all 3 targets are missing
  const r = detectDocsAccuracy(t);
  assert.equal(r.status, 'FAIL');
  assert.ok(Number(r.value) >= 3);
  assert.ok(r.evidence.some((e) => e.includes('missing')));
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2200-2203', () => {
  for (const code of [2200, 2201, 2202, 2203]) {
    assert.ok(code in DETECTORS, `DETECTORS must include ${code}`);
  }
});

test('DETECTORS[2200] dispatches to detectRootReadme', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const direct = detectRootReadme(t);
  const viaMap = DETECTORS[2200](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'detected');
});

test('DETECTORS[2203] dispatches to detectDocsAccuracy — no README = SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = DETECTORS[2203](t);
  assert.equal(r.status, 'SKIP');
});

test('DETECTORS[2203]: fixture README referencing 3 missing make targets → FAIL', () => {
  // This is the canonical hermetic fixture for the DOC-04 FAIL path
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# Service',
      '',
      '## Quickstart',
      '',
      'Run `make install` to install all dependencies.',
      'Run `make test` to run the full test suite.',
      'Run `make deploy` to push to production.',
      'Run `make docs` to generate API documentation.',
    ].join('\n')
  );
  // No Makefile — all 4 make targets are missing
  const r = DETECTORS[2203](t);
  assert.equal(r.status, 'FAIL');
  assert.ok(Number(r.value) >= 3, `expected value >= 3, got ${r.value}`);
  assert.equal(r.method, 'detected');
});

test('DETECTORS[2203]: fixture README referencing only existing make targets → PASS', () => {
  // Hermetic fixture for the DOC-04 PASS path
  const t = tmp();
  writeFileSync(
    join(t, 'README.md'),
    [
      '# Service',
      '',
      'Run `make test` to run tests.',
      'Run `make build` to compile.',
    ].join('\n')
  );
  writeFileSync(
    join(t, 'Makefile'),
    '.PHONY: test build\ntest:\n\tnpm test\nbuild:\n\tnpm run build\n'
  );
  const r = DETECTORS[2203](t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

// ---------------------------------------------------------------------------
// DOC-03 content-sniffed spec discovery (regression: an OpenAPI-first repo
// keeping its root spec at swagger/api.yaml — a valid `openapi: 3.0.3`
// document plus 64 per-resource path files — FAILed DOC-03 because detection
// matched an exact-basename allow-list instead of the standard's mandatory
// top-level version key).
// ---------------------------------------------------------------------------

test('DOC-03: spec under a custom name/path (swagger/api.yaml) is found by content', () => {
  const t = tmp();
  mkdirSync(join(t, 'contract', 'swagger', 'paths'), { recursive: true });
  writeFileSync(
    join(t, 'server.kt'),
    '@RestController\nclass ProjectsController(val svc: Service)\n'
  );
  writeFileSync(
    join(t, 'contract', 'swagger', 'api.yaml'),
    'openapi: 3.0.3\ninfo:\n  title: HOP\n  version: 1.0.0\n'
  );
  writeFileSync(
    join(t, 'contract', 'swagger', 'paths', 'projects.yaml'),
    'get:\n  summary: list projects\n'
  );
  const r = detectApiDocs(t);
  assert.equal(
    r.status,
    'PASS',
    'a document with a top-level `openapi:` version key IS the API documentation, whatever the file is named'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('api.yaml')),
    `evidence must name the discovered spec file, got ${JSON.stringify(r.evidence)}`
  );
});

test('DOC-03: a file merely NAMED openapi.yaml without spec content is not documentation', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'server.ts'),
    'import express from "express";\nconst app = express();\napp.get("/users", handler);\n'
  );
  writeFileSync(
    join(t, 'openapi.yaml'),
    '# TODO: write the spec someday\nplaceholder: true\n'
  );
  const r = detectApiDocs(t);
  assert.equal(
    r.status,
    'FAIL',
    'an empty placeholder must not pass on its filename — the standard requires a top-level version key'
  );
});

test('DOC-03: JSON spec with a custom name is found by content', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'server.ts'),
    'import express from "express";\nconst app = express();\napp.get("/users", handler);\n'
  );
  mkdirSync(join(t, 'docs'), { recursive: true });
  writeFileSync(
    join(t, 'docs', 'service-api.json'),
    '{\n  "openapi": "3.1.0",\n  "info": { "title": "Svc", "version": "1.0" }\n}\n'
  );
  const r = detectApiDocs(t);
  assert.equal(r.status, 'PASS', 'JSON specs must be sniffed too');
  assert.ok(r.evidence.some((e) => e.includes('service-api.json')));
});
