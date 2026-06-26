import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectEnvGitignored,
  detectAgentSafetyHooks,
  detectEnvExample,
  detectNoSecretsCommitted,
  detectSensitiveFilesGitignored,
  DETECTORS,
} from '../detectors/security.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'sec-'));
}

// ---------------------------------------------------------------------------
// detectEnvGitignored (2600 — SEC-01)
// ---------------------------------------------------------------------------

test('SEC-01: .gitignore with .env entry is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), '.env\n*.log\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('SEC-01: .gitignore with .env.* wildcard is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), '*.env.*\n.env.*\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'PASS');
});

test('SEC-01: .gitignore without .env is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), 'node_modules/\ndist/\n*.log\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'FAIL');
});

test('SEC-01: no .gitignore is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectAgentSafetyHooks (2601 — SEC-02)
// ---------------------------------------------------------------------------

test('SEC-02: settings.json with hooks key is PASS', () => {
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

test('SEC-02: no hooks configured is FAIL', () => {
  const t = tmp();
  const r = detectAgentSafetyHooks(t);
  assert.equal(r.status, 'FAIL');
});

test('SEC-02: hook script referencing .env patterns is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'hooks'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'hooks', 'guard.sh'),
    '#!/bin/bash\n# Block reads of .env files\nif [[ "$TOOL_INPUT" == *".env"* ]]; then exit 1; fi\n'
  );
  const r = detectAgentSafetyHooks(t);
  assert.equal(r.status, 'PASS');
});

test('SEC-02: hook script without sensitive references is WARN', () => {
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
// detectEnvExample (2602 — SEC-03)
// ---------------------------------------------------------------------------

test('SEC-03: .env.example is PASS', () => {
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

test('SEC-03: .env.template is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.env.template'), 'SECRET_KEY=changeme\n');
  const r = detectEnvExample(t);
  assert.equal(r.status, 'PASS');
});

test('SEC-03: .env.sample is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.env.sample'), 'PORT=3000\n');
  const r = detectEnvExample(t);
  assert.equal(r.status, 'PASS');
});

test('SEC-03: no env template is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectEnvExample(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectNoSecretsCommitted (2603 — SEC-04)
// ---------------------------------------------------------------------------

test('SEC-04: no secrets in source files is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.py'),
    'import os\nDB_URL = os.environ["DATABASE_URL"]\n'
  );
  const r = detectNoSecretsCommitted(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('SEC-04: AWS AKIA key (non-placeholder) in source file is WARN or FAIL', () => {
  const t = tmp();
  // Use a realistic-looking AKIA key without placeholder words (no "example"/"test"/"fake")
  writeFileSync(
    join(t, 'config.py'),
    'AWS_ACCESS_KEY_ID = "AKIAZ3WBBMQKYNQP1234"\nAWS_REGION = "us-east-1"\n'
  );
  const r = detectNoSecretsCommitted(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL for AWS AKIA key, got ${r.status}`
  );
});

test('SEC-04: hardcoded api_key assignment triggers hit', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'client.ts'),
    'const api_key = "sk-proj-xyz1234567890abcdefgh";\n'
  );
  const r = detectNoSecretsCommitted(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL for hardcoded api_key, got ${r.status}`
  );
});

test('SEC-04: env-variable assignment is PASS (placeholder)', () => {
  const t = tmp();
  writeFileSync(join(t, 'config.ts'), 'const api_key = process.env.API_KEY;\n');
  const r = detectNoSecretsCommitted(t);
  assert.equal(r.status, 'PASS');
});

test('SEC-04: comment-only match is not flagged', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'notes.py'),
    '# api_key = "sk-proj-abcdefghijklmn" (old key, do not use)\n'
  );
  const r = detectNoSecretsCommitted(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectSensitiveFilesGitignored (2604 — SEC-05)
// ---------------------------------------------------------------------------

// Old behavior: PASS if .gitignore covered ≥3 patterns regardless of file presence.
// New contract: relevance-gated — only types with matching files in repo are checked.
// These tests now use actual secret files to exercise the new paths.

test('SEC-05: actual *.pem and *.key files covered in .gitignore is PASS', () => {
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

test('SEC-05: *.pem in .gitignore but Dockerfile without .dockerignore is WARN', () => {
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

test('SEC-05: .gitignore present but missing *.pem entry when file exists is FAIL', () => {
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

test('SEC-05: no .gitignore when a *.pem file is present is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'server.pem'), 'KEY\n');
  const r = detectSensitiveFilesGitignored(t);
  assert.equal(
    r.status,
    'FAIL',
    `no .gitignore + *.pem file must be FAIL; got ${r.status}`
  );
});

test('SEC-05: credentials.json file covered in .gitignore is PASS with evidence', () => {
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

test('DETECTORS map contains codes 2600–2604', () => {
  for (const code of [2600, 2601, 2602, 2603, 2604]) {
    assert.ok(code in DETECTORS, `DETECTORS must include ${code}`);
  }
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

test('SEC-02: .kiro/hooks directory with hook file → PASS', () => {
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
