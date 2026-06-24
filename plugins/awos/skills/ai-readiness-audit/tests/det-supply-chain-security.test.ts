import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectScsLockfiles,
  detectLockfileIntegrity,
  detectPinnedVersions,
  detectScsQuarantineAge,
  detectDependencyAutomationReview,
  detectVulnerabilityScanning,
  detectDependencyOverrides,
  detectDependencyAttackSurface,
  DETECTORS,
} from '../detectors/supply_chain_security.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'scs-'));
}

// ---------------------------------------------------------------------------
// detectScsLockfiles (2900 — SCS-01)
// ---------------------------------------------------------------------------

test('SCS-01: pnpm-lock.yaml is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  const r = detectScsLockfiles(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('pnpm-lock.yaml')));
});

test('SCS-01: poetry.lock is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'poetry.lock'), '[[package]]\nname = "requests"\n');
  const r = detectScsLockfiles(t);
  assert.equal(r.status, 'PASS');
});

test('SCS-01: no lockfile is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectScsLockfiles(t);
  assert.equal(r.status, 'FAIL');
});

test('SCS-01: go.sum is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'go.sum'), 'github.com/pkg/errors v0.9.1 h1:xyz...\n');
  const r = detectScsLockfiles(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectLockfileIntegrity (2901 — SCS-02)
// ---------------------------------------------------------------------------

test('SCS-02: package-lock.json with integrity hashes is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/lodash': {
          version: '4.17.21',
          integrity: 'sha512-abc123==',
        },
      },
    })
  );
  const r = detectLockfileIntegrity(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('SCS-02: poetry.lock with hash entries is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'poetry.lock'),
    '[[package]]\nname = "requests"\nversion = "2.31.0"\nhash = "sha256:abcdef1234567890"\n'
  );
  const r = detectLockfileIntegrity(t);
  assert.equal(r.status, 'PASS');
});

test('SCS-02: go.sum with h1: hashes is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'go.sum'),
    'github.com/pkg/errors v0.9.1 h1:FEBLx1zS214owpjy7qsBeixbURkuhQAwrK5UwLGTwt8=\n'
  );
  const r = detectLockfileIntegrity(t);
  assert.equal(r.status, 'PASS');
});

test('SCS-02: no lockfiles returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectLockfileIntegrity(t);
  assert.equal(r.status, 'SKIP');
});

test('SCS-02: pnpm-lock.yaml with integrity hashes is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'pnpm-lock.yaml'),
    'lockfileVersion: "9.0"\npackages:\n  lodash@4.17.21:\n    integrity: sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZbet2yk9AX6i/Zo1bw==\n'
  );
  const r = detectLockfileIntegrity(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectPinnedVersions (2902 — SCS-03)
// ---------------------------------------------------------------------------

test('SCS-03: package.json with all exact versions is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({
      dependencies: { lodash: '4.17.21', express: '4.18.2' },
      devDependencies: { typescript: '5.3.3' },
    })
  );
  const r = detectPinnedVersions(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('SCS-03: package.json with >30% caret ranges is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({
      dependencies: {
        lodash: '^4.17.21',
        express: '^4.18.2',
        axios: '^1.6.0',
        react: '^18.2.0',
      },
      devDependencies: { typescript: '5.3.3' },
    })
  );
  const r = detectPinnedVersions(t);
  // 4/5 = 80% ranged → FAIL
  assert.equal(r.status, 'FAIL');
});

test('SCS-03: requirements.txt with == pinning is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'requirements.txt'),
    'requests==2.31.0\nboto3==1.34.0\npydantic==2.5.0\n'
  );
  const r = detectPinnedVersions(t);
  assert.equal(r.status, 'PASS');
});

test('SCS-03: requirements.txt with >= ranges is FAIL or WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'requirements.txt'),
    'requests>=2.0.0\nboto3>=1.0.0\nflask>=2.0\n'
  );
  const r = detectPinnedVersions(t);
  // 3/3 = 100% ranged → FAIL
  assert.equal(r.status, 'FAIL');
});

test('SCS-03: no package manifests returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.go'), 'package main\n');
  const r = detectPinnedVersions(t);
  assert.equal(r.status, 'SKIP');
});

// ---------------------------------------------------------------------------
// detectScsQuarantineAge (2903 — SCS-04)
// ---------------------------------------------------------------------------

test('SCS-04: always returns SKIP with explanation (offline check)', () => {
  const t = tmp();
  const r = detectScsQuarantineAge(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'computed');
  assert.ok(
    r.evidence.some((e) => /registry|offline|non-deterministic/i.test(e)),
    'evidence should explain why check is skipped'
  );
});

// ---------------------------------------------------------------------------
// detectDependencyAutomationReview (2904 — SCS-05)
// ---------------------------------------------------------------------------

test('SCS-05: dependabot.yml present without automerge is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.github'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'dependabot.yml'),
    'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"\n'
  );
  const r = detectDependencyAutomationReview(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('SCS-05: renovate.json present is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'renovate.json'), '{"$schema": "renovate"}\n');
  const r = detectDependencyAutomationReview(t);
  assert.equal(r.status, 'PASS');
});

test('SCS-05: no automation config is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'package.json'), '{"name": "app"}\n');
  const r = detectDependencyAutomationReview(t);
  assert.equal(r.status, 'FAIL');
});

test('SCS-05: dependabot with automerge: true is WARN', () => {
  const t = tmp();
  mkdirSync(join(t, '.github'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'dependabot.yml'),
    'version: 2\nautomerge: true\nupdates:\n  - package-ecosystem: "npm"\n'
  );
  const r = detectDependencyAutomationReview(t);
  assert.equal(r.status, 'WARN');
});

// ---------------------------------------------------------------------------
// detectVulnerabilityScanning (2905 — SCS-06)
// ---------------------------------------------------------------------------

test('SCS-06: CI workflow with trivy is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'workflows', 'security.yml'),
    'name: Security\njobs:\n  scan:\n    steps:\n      - uses: aquasecurity/trivy-action@master\n'
  );
  const r = detectVulnerabilityScanning(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('SCS-06: CI workflow with pip-audit is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'workflows', 'ci.yml'),
    'name: CI\njobs:\n  lint:\n    steps:\n      - run: pip-audit -r requirements.txt\n'
  );
  const r = detectVulnerabilityScanning(t);
  assert.equal(r.status, 'PASS');
});

test('SCS-06: CI workflow with snyk is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'workflows', 'ci.yml'),
    'steps:\n  - name: Snyk\n    run: snyk test\n'
  );
  const r = detectVulnerabilityScanning(t);
  assert.equal(r.status, 'PASS');
});

test('SCS-06: dependabot.yml with package-ecosystem signals Dependabot security-updates', () => {
  const t = tmp();
  mkdirSync(join(t, '.github'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'dependabot.yml'),
    'version: 2\nupdates:\n  - package-ecosystem: "npm"\n'
  );
  const r = detectVulnerabilityScanning(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => /dependabot/i.test(e)));
});

test('SCS-06: no CI workflows is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'Makefile'), 'test:\n\tpython -m pytest\n');
  const r = detectVulnerabilityScanning(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectDependencyOverrides (2906 — SCS-07)
// ---------------------------------------------------------------------------

test('SCS-07: package.json without overrides is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({ dependencies: { lodash: '4.17.21' } })
  );
  const r = detectDependencyOverrides(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('SCS-07: package.json with overrides key is WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({
      dependencies: { lodash: '4.17.21' },
      overrides: { minimist: '1.2.8' },
    })
  );
  const r = detectDependencyOverrides(t);
  assert.equal(r.status, 'WARN');
  assert.ok(r.evidence.some((e) => e.includes('overrides')));
});

test('SCS-07: package.json with resolutions key is WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({
      resolutions: { 'lodash/minimist': '1.2.8' },
    })
  );
  const r = detectDependencyOverrides(t);
  assert.equal(r.status, 'WARN');
});

test('SCS-07: Cargo.toml with [patch.crates-io] is WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'Cargo.toml'),
    '[package]\nname = "myapp"\nversion = "0.1.0"\n\n[patch.crates-io]\nserde = { git = "https://github.com/serde-rs/serde" }\n'
  );
  const r = detectDependencyOverrides(t);
  assert.equal(r.status, 'WARN');
  assert.ok(r.evidence.some((e) => e.includes('patch')));
});

test('SCS-07: no manifests is PASS (no overrides found)', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectDependencyOverrides(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectDependencyAttackSurface (2907 — SCS-08)
// ---------------------------------------------------------------------------

test('SCS-08: small package.json dep count is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({
      dependencies: { lodash: '4.17.21', express: '4.18.2' },
      devDependencies: { typescript: '5.3.3' },
    })
  );
  const r = detectDependencyAttackSurface(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'computed');
  assert.equal(r.value, 3);
});

test('SCS-08: requirements.txt with few deps is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'requirements.txt'),
    'requests==2.31.0\nboto3==1.34.0\n'
  );
  const r = detectDependencyAttackSurface(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.value, 2);
});

test('SCS-08: no manifests returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.go'), 'package main\n');
  const r = detectDependencyAttackSurface(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'computed');
});

test('SCS-08: 101-200 direct deps is WARN', () => {
  const t = tmp();
  // Build requirements.txt with 120 entries
  const lines = Array.from(
    { length: 120 },
    (_, i) => `package${i}==1.0.0`
  ).join('\n');
  writeFileSync(join(t, 'requirements.txt'), lines + '\n');
  const r = detectDependencyAttackSurface(t);
  assert.equal(r.status, 'WARN');
  assert.equal(r.value, 120);
});

test('SCS-08: >200 direct deps is FAIL', () => {
  const t = tmp();
  const lines = Array.from(
    { length: 210 },
    (_, i) => `package${i}==1.0.0`
  ).join('\n');
  writeFileSync(join(t, 'requirements.txt'), lines + '\n');
  const r = detectDependencyAttackSurface(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.value, 210);
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2900–2907', () => {
  for (const code of [2900, 2901, 2902, 2903, 2904, 2905, 2906, 2907]) {
    assert.ok(code in DETECTORS, `DETECTORS must include ${code}`);
  }
});

test('DETECTORS[2900] dispatches to detectScsLockfiles', () => {
  const t = tmp();
  writeFileSync(join(t, 'yarn.lock'), '# yarn.lock v1\n');
  const direct = detectScsLockfiles(t);
  const viaMap = DETECTORS[2900](t);
  assert.equal(viaMap.status, direct.status);
});

test('DETECTORS[2903] always returns SKIP (quarantine-age)', () => {
  const t = tmp();
  const r = DETECTORS[2903](t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'computed');
});

test('DETECTORS[2907] dispatches to detectDependencyAttackSurface', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({ dependencies: { a: '1.0.0', b: '2.0.0' } })
  );
  const r = DETECTORS[2907](t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'computed');
});
