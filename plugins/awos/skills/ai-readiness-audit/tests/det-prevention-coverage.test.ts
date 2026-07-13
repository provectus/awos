import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectSecretScanGate,
  detectDependencyRiskAutomation,
  detectSastGate,
  detectCodeStyleGated,
  detectArchBoundariesGate,
  detectTestCoverageGate,
  detectAgentSurfaceGuard,
  detectDocsFreshnessGate,
  DETECTORS,
} from '../detectors/prevention_coverage.ts';
import { tmpDir } from './helpers.ts';

function tmp(): string {
  return tmpDir('prv-');
}

function writeCiWorkflow(repo: string, content: string): void {
  mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(repo, '.github', 'workflows', 'ci.yml'), content);
}

// ---------------------------------------------------------------------------
// registry shape
// ---------------------------------------------------------------------------

test('PRV registry covers exactly the 8 enforcement codes 3100–3107 (judgment codes excluded)', () => {
  const codes = Object.keys(DETECTORS).map(Number).sort();
  assert.deepEqual(
    codes,
    [3100, 3101, 3102, 3103, 3104, 3105, 3106, 3107],
    'prevention_coverage.ts must register one detector per enforcement category and none for the judgment codes (3110–3117)'
  );
});

// ---------------------------------------------------------------------------
// detectSecretScanGate (3100 — PRV-01)
// ---------------------------------------------------------------------------

test('PRV-01: gitleaks in .pre-commit-config.yaml is PASS (gated)', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.pre-commit-config.yaml'),
    'repos:\n  - repo: https://github.com/gitleaks/gitleaks\n    hooks:\n      - id: gitleaks\n'
  );
  const r = detectSecretScanGate(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('gitleaks')));
});

test('PRV-01: trufflehog in a CI workflow is PASS (gated)', () => {
  const t = tmp();
  writeCiWorkflow(
    t,
    'jobs:\n  scan:\n    steps:\n      - run: trufflehog git file://.\n'
  );
  const r = detectSecretScanGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-01: .gitleaks.toml alone (no gate) is WARN — configured, not gated', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitleaks.toml'), '[allowlist]\n');
  const r = detectSecretScanGate(t);
  assert.equal(r.status, 'WARN');
});

test('PRV-01: empty repo is FAIL — no secret-scanning mechanism', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectSecretScanGate(t);
  assert.equal(r.status, 'FAIL');
});

test('PRV-01: a devDependency mention in package.json does NOT count as a gate', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({ devDependencies: { secretlint: '^7.0.0' } })
  );
  const r = detectSecretScanGate(t);
  assert.equal(
    r.status,
    'FAIL',
    'package.json is only a gate surface via its hook keys (lint-staged/husky/pre-commit scripts), never via devDependencies'
  );
});

// ---------------------------------------------------------------------------
// detectDependencyRiskAutomation (3101 — PRV-02)
// ---------------------------------------------------------------------------

test('PRV-02: dependabot config alone is PASS (server-side bot runs mechanically)', () => {
  const t = tmp();
  mkdirSync(join(t, '.github'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'dependabot.yml'),
    'version: 2\nupdates:\n  - package-ecosystem: npm\n'
  );
  const r = detectDependencyRiskAutomation(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-02: npm audit in CI is PASS', () => {
  const t = tmp();
  writeCiWorkflow(
    t,
    'jobs:\n  audit:\n    steps:\n      - run: npm audit --audit-level=high\n'
  );
  const r = detectDependencyRiskAutomation(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-02: neither scanner nor bot is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'package.json'), '{}');
  const r = detectDependencyRiskAutomation(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectSastGate (3102 — PRV-03)
// ---------------------------------------------------------------------------

test('PRV-03: codeql action in CI is PASS', () => {
  const t = tmp();
  writeCiWorkflow(
    t,
    'jobs:\n  analyze:\n    steps:\n      - uses: github/codeql-action/analyze@v3\n'
  );
  const r = detectSastGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-03: bandit in pre-commit is PASS (pre-commit is a gate)', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.pre-commit-config.yaml'),
    'repos:\n  - repo: https://github.com/PyCQA/bandit\n    hooks:\n      - id: bandit\n'
  );
  const r = detectSastGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-03: .semgrep.yml alone is WARN', () => {
  const t = tmp();
  writeFileSync(join(t, '.semgrep.yml'), 'rules: []\n');
  const r = detectSastGate(t);
  assert.equal(r.status, 'WARN');
});

test('PRV-03: no SAST mechanism is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.go'), 'package main\n');
  const r = detectSastGate(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectCodeStyleGated (3103 — PRV-04)
// ---------------------------------------------------------------------------

test('PRV-04: eslint in husky pre-commit script is PASS (gated)', () => {
  const t = tmp();
  mkdirSync(join(t, '.husky'), { recursive: true });
  writeFileSync(join(t, '.husky', 'pre-commit'), '#!/bin/sh\nnpx eslint .\n');
  const r = detectCodeStyleGated(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-04: prettier --check in CI is PASS (gated)', () => {
  const t = tmp();
  writeCiWorkflow(
    t,
    'jobs:\n  lint:\n    steps:\n      - run: npx prettier . --check\n'
  );
  const r = detectCodeStyleGated(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-04: .prettierrc alone is WARN — configured but not gated (the SBP/PRV distinction)', () => {
  const t = tmp();
  writeFileSync(join(t, '.prettierrc'), '{}');
  const r = detectCodeStyleGated(t);
  assert.equal(r.status, 'WARN');
});

test('PRV-04: no linter or formatter at all is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectCodeStyleGated(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectArchBoundariesGate (3104 — PRV-05)
// ---------------------------------------------------------------------------

test('PRV-05: depcruise invoked in CI is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.dependency-cruiser.js'), 'module.exports = {};\n');
  writeCiWorkflow(
    t,
    'jobs:\n  arch:\n    steps:\n      - run: npx depcruise src\n'
  );
  const r = detectArchBoundariesGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-05: ArchUnit dependency in build.gradle is PASS (runs with the test suite)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'build.gradle'),
    "dependencies { testImplementation 'com.tngtech.archunit:archunit-junit5:1.2.1' }\n"
  );
  const r = detectArchBoundariesGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-05: .dependency-cruiser.js alone is WARN', () => {
  const t = tmp();
  writeFileSync(join(t, '.dependency-cruiser.js'), 'module.exports = {};\n');
  const r = detectArchBoundariesGate(t);
  assert.equal(r.status, 'WARN');
});

test('PRV-05: eslint boundary rules with eslint gated in CI is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.eslintrc.json'),
    JSON.stringify({ plugins: ['eslint-plugin-boundaries'] })
  );
  writeCiWorkflow(t, 'jobs:\n  lint:\n    steps:\n      - run: npx eslint .\n');
  const r = detectArchBoundariesGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-05: no boundary mechanism is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.ts'), 'export {};\n');
  const r = detectArchBoundariesGate(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectTestCoverageGate (3105 — PRV-06)
// ---------------------------------------------------------------------------

test('PRV-06: pytest with --cov-fail-under in CI is PASS', () => {
  const t = tmp();
  writeCiWorkflow(
    t,
    'jobs:\n  test:\n    steps:\n      - run: pytest --cov --cov-fail-under=80\n'
  );
  const r = detectTestCoverageGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-06: CI test run + coverageThreshold in jest config is PASS', () => {
  const t = tmp();
  writeCiWorkflow(t, 'jobs:\n  test:\n    steps:\n      - run: npm test\n');
  writeFileSync(
    join(t, 'jest.config.js'),
    'module.exports = { coverageThreshold: { global: { lines: 80 } } };\n'
  );
  const r = detectTestCoverageGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-06: CI test run without a coverage threshold is WARN', () => {
  const t = tmp();
  writeCiWorkflow(t, 'jobs:\n  test:\n    steps:\n      - run: npm test\n');
  const r = detectTestCoverageGate(t);
  assert.equal(r.status, 'WARN');
});

test('PRV-06: no CI at all is FAIL — that is the finding, not a skip', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectTestCoverageGate(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectAgentSurfaceGuard (3106 — PRV-07)
// ---------------------------------------------------------------------------

test('PRV-07: hooks key in .claude/settings.json is PASS (delegates to AIS-07 surface)', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { PreToolUse: [] } })
  );
  const r = detectAgentSurfaceGuard(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-07: CI step checking CLAUDE.md is PASS (alternate route)', () => {
  const t = tmp();
  writeCiWorkflow(
    t,
    'jobs:\n  lint:\n    steps:\n      - run: ./scripts/check.sh CLAUDE.md\n'
  );
  const r = detectAgentSurfaceGuard(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-07: no guard mechanism is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'CLAUDE.md'), '# rules\n');
  const r = detectAgentSurfaceGuard(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectDocsFreshnessGate (3107 — PRV-08)
// ---------------------------------------------------------------------------

test('PRV-08: lychee in CI is PASS', () => {
  const t = tmp();
  writeCiWorkflow(
    t,
    'jobs:\n  docs:\n    steps:\n      - uses: lycheeverse/lychee-action@v2\n'
  );
  const r = detectDocsFreshnessGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-08: markdownlint in pre-commit is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.pre-commit-config.yaml'),
    'repos:\n  - repo: https://github.com/igorshubovych/markdownlint-cli\n    hooks:\n      - id: markdownlint\n'
  );
  const r = detectDocsFreshnessGate(t);
  assert.equal(r.status, 'PASS');
});

test('PRV-08: .markdownlint.json alone is WARN', () => {
  const t = tmp();
  writeFileSync(join(t, '.markdownlint.json'), '{}');
  const r = detectDocsFreshnessGate(t);
  assert.equal(r.status, 'WARN');
});

test('PRV-08: no docs-checking mechanism is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# hi\n');
  const r = detectDocsFreshnessGate(t);
  assert.equal(r.status, 'FAIL');
});
