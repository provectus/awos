import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectEnvGitignored,
  detectAgentSafetyHooks,
  detectEnvExample,
  detectSensitiveFilesGitignored,
  DETECTORS,
} from '../detectors/security.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'sec-'));
}

// ---------------------------------------------------------------------------
// detectEnvGitignored (2600 — AS-12)
// ---------------------------------------------------------------------------

test('AS-12: .gitignore with .env entry is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), '.env\n*.log\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('AS-12: .gitignore with .env.* wildcard is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), '*.env.*\n.env.*\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'PASS');
});

test('AS-12: .gitignore without .env is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), 'node_modules/\ndist/\n*.log\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'FAIL');
});

test('AS-12: no .gitignore is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectAgentSafetyHooks (2601 — AIS-07)
// ---------------------------------------------------------------------------

test('AIS-07: settings.json with hooks key is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { PreToolUse: [] } })
  );
  const r = detectAgentSafetyHooks(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('AIS-07: no hooks configured is FAIL', () => {
  const t = tmp();
  const r = detectAgentSafetyHooks(t);
  assert.equal(r.status, 'FAIL');
});

test('AIS-07: hook script referencing .env patterns is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'hooks'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'hooks', 'guard.sh'),
    '#!/bin/bash\n# Block reads of .env files\nif [[ "$TOOL_INPUT" == *".env"* ]]; then exit 1; fi\n'
  );
  const r = detectAgentSafetyHooks(t);
  assert.equal(r.status, 'PASS');
});

test('AIS-07: hook script without sensitive references is WARN', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'hooks'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'hooks', 'log.sh'),
    '#!/bin/bash\necho hook\n'
  );
  const r = detectAgentSafetyHooks(t);
  assert.equal(r.status, 'WARN');
});

// ---------------------------------------------------------------------------
// detectEnvExample (2602 — AS-13)
// ---------------------------------------------------------------------------

test('AS-13: .env.example is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.env.example'),
    'DATABASE_URL=postgres://localhost/mydb\nAPI_KEY=\n'
  );
  const r = detectEnvExample(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('.env.example')));
});

test('AS-13: .env.template is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.env.template'), 'SECRET_KEY=changeme\n');
  const r = detectEnvExample(t);
  assert.equal(r.status, 'PASS');
});

test('AS-13: .env.sample is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.env.sample'), 'PORT=3000\n');
  const r = detectEnvExample(t);
  assert.equal(r.status, 'PASS');
});

test('AS-13: no env template is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectEnvExample(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectSensitiveFilesGitignored (2604 — AS-14)
// ---------------------------------------------------------------------------

// Old behavior: PASS if .gitignore covered ≥3 patterns regardless of file presence.
// New contract: relevance-gated — only types with matching files in repo are checked.
// These tests now use actual secret files to exercise the new paths.

test('AS-14: actual *.pem and *.key files covered in .gitignore is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'server.pem'), 'KEY\n');
  writeFileSync(join(t, 'client.key'), 'KEY\n');
  writeFileSync(join(t, '.gitignore'), '*.pem\n*.key\n*.p12\n*.pfx\n');
  const r = detectSensitiveFilesGitignored(t);
  assert.equal(r.status, 'PASS');
  assert.ok(
    (r.value as number) >= 2,
    `expected value ≥ 2 (relevant types covered), got ${r.value}`
  );
  assert.equal(r.method, 'detected');
});

test('AS-14: *.pem in .gitignore but Dockerfile without .dockerignore is WARN', () => {
  const t = tmp();
  writeFileSync(join(t, 'server.pem'), 'KEY\n');
  writeFileSync(join(t, '.gitignore'), '*.pem\nnode_modules/\n');
  writeFileSync(join(t, 'Dockerfile'), 'FROM x\nCOPY . /app\n');
  const r = detectSensitiveFilesGitignored(t);
  assert.equal(
    r.status,
    'WARN',
    `git-covered but Docker-exposed *.pem must be WARN; got ${r.status}`
  );
});

test('AS-14: .gitignore present but missing *.pem entry when file exists is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'server.pem'), 'KEY\n');
  writeFileSync(join(t, '.gitignore'), 'node_modules/\ndist/\n*.log\n');
  const r = detectSensitiveFilesGitignored(t);
  assert.equal(
    r.status,
    'FAIL',
    `*.pem file present but not gitignored must be FAIL; got ${r.status}`
  );
});

test('AS-14: no .gitignore when a *.pem file is present is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'server.pem'), 'KEY\n');
  const r = detectSensitiveFilesGitignored(t);
  assert.equal(
    r.status,
    'FAIL',
    `no .gitignore + *.pem file must be FAIL; got ${r.status}`
  );
});

test('AS-14: credentials.json file covered in .gitignore is PASS with evidence', () => {
  const t = tmp();
  writeFileSync(join(t, 'credentials.json'), '{"type":"service_account"}\n');
  writeFileSync(
    join(t, '.gitignore'),
    '*.pem\n*.key\ncredentials.json\n*.p12\n'
  );
  const r = detectSensitiveFilesGitignored(t);
  assert.equal(r.status, 'PASS');
  assert.ok(
    r.evidence.some((e) => e.includes('credentials.json')),
    `evidence must mention credentials.json; got ${JSON.stringify(r.evidence)}`
  );
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2600-2602 and 2604 (2603 merged into AS-05/3004)', () => {
  for (const code of [2600, 2601, 2602, 2604]) {
    assert.ok(code in DETECTORS, `DETECTORS must include ${code}`);
  }
  assert.ok(
    !(2603 in DETECTORS),
    '2603 must be gone — the no-committed-secrets capability lives in application-security AS-05 (3004)'
  );
});

test('DETECTORS[2600] dispatches to detectEnvGitignored', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), '.env\n');
  const direct = detectEnvGitignored(t);
  const viaMap = DETECTORS[2600](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'detected');
});

test('DETECTORS[2602] dispatches to detectEnvExample', () => {
  const t = tmp();
  writeFileSync(join(t, '.env.example'), 'API_KEY=\n');
  const direct = detectEnvExample(t);
  const viaMap = DETECTORS[2602](t);
  assert.equal(viaMap.status, direct.status);
});

// ---------------------------------------------------------------------------
// Multi-tool registry tests (B4)
// ---------------------------------------------------------------------------

test('AIS-07: .kiro/hooks directory with hook file → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.kiro', 'hooks'), { recursive: true });
  writeFileSync(
    join(t, '.kiro', 'hooks', 'pre-save.sh'),
    '#!/bin/sh\necho hook\n'
  );
  const r = detectAgentSafetyHooks(t);
  // Hooks exist but don't mention .env — expect WARN (hooks present, no sensitive refs)
  assert.ok(
    r.status === 'PASS' || r.status === 'WARN',
    `expected PASS or WARN when .kiro/hooks has files, got ${r.status}`
  );
});
