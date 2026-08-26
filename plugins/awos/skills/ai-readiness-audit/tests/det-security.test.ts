import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectEnvGitignored,
  detectAgentSafetyHooks,
  detectEnvExample,
  detectSensitiveFilesGitignored,
  DETECTORS,
  ENV_GITIGNORE_PATTERNS,
} from '../detectors/security.ts';
import { tmpDir } from './helpers.ts';

function tmp(): string {
  return tmpDir('sec-');
}

// ---------------------------------------------------------------------------
// detectEnvGitignored (2600 — AS-12)
// ---------------------------------------------------------------------------

// The evidence sentence names ENV_GITIGNORE_PATTERNS, but the detector
// decides with ENV_GITIGNORE_RX. Nothing but this test keeps the two aligned:
// before the list became the source of the wording, `.env*.local` was accepted
// by the regex and missing from the sentence. Each entry is exercised as the
// literal .gitignore line a reader would write.
test('AS-12: every pattern the evidence advertises is one the detector accepts', () => {
  for (const pattern of ENV_GITIGNORE_PATTERNS) {
    const t = tmp();
    writeFileSync(join(t, '.gitignore'), `${pattern}\n`);
    const r = detectEnvGitignored(t);
    assert.equal(
      r.status,
      'PASS',
      `.gitignore line "${pattern}" is advertised in the AS-12 evidence but the detector does not accept it`
    );
  }
});

test('AS-12: a near-miss the evidence does not advertise stays FAIL', () => {
  // Guards the other direction — the assertion above passes trivially if the
  // regex matched everything.
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), '.envrc\n');
  const r = detectEnvGitignored(t);
  assert.equal(
    r.status,
    'FAIL',
    '.envrc is not an .env-coverage pattern and must not satisfy AS-12'
  );
});

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

test('AS-12: .gitignore with .env* wildcard (Next.js/Vercel default) is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), 'node_modules/\n.env*\n');
  const r = detectEnvGitignored(t);
  assert.equal(r.status, 'PASS', '.env* must be recognised as covering .env');
});

test('AS-12: .gitignore with .env*.local (CRA default) is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitignore'), 'node_modules/\n.env*.local\n');
  const r = detectEnvGitignored(t);
  assert.equal(
    r.status,
    'PASS',
    '.env*.local must be recognised as covering .env files'
  );
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

test('AIS-07: hook reading only process.env is WARN — env-var access is not a sensitive-file guard', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'hooks'), { recursive: true });
  // `process.env.FOO` contains the substring ".env" but references an
  // environment variable, not the .env file — must NOT count as a
  // sensitive-pattern reference (false PASS regression).
  writeFileSync(
    join(t, '.claude', 'hooks', 'notify.js'),
    'const url = process.env.FOO;\nfetch(url);\n'
  );
  const r = detectAgentSafetyHooks(t);
  assert.equal(
    r.status,
    'WARN',
    `hook using process.env.FOO must not count as guarding .env files; got ${r.status}`
  );
});

test('AIS-07: hook referencing the ".env" file token is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.claude', 'hooks'), { recursive: true });
  writeFileSync(
    join(t, '.claude', 'hooks', 'guard.js'),
    'if (input.includes(".env")) { block(); }\n'
  );
  const r = detectAgentSafetyHooks(t);
  assert.equal(
    r.status,
    'PASS',
    `hook referencing the ".env" file must count as a sensitive-pattern guard; got ${r.status}`
  );
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

// --- orchestration-root inheritance ---------------------------------------

function writeGuardHooks(dir: string): void {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(
    join(dir, '.claude', 'settings.json'),
    '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Read", "hooks": [] }\n    ]\n  }\n}\n'
  );
}

function writeGuardHookScript(dir: string): void {
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
  writeFileSync(
    join(dir, '.claude', 'hooks', 'guard.sh'),
    '#!/bin/bash\n# Block reads of .env files\nif [[ "$TOOL_INPUT" == *".env"* ]]; then\n  exit 1\nfi\necho done\n'
  );
}

/** Build a root-with-member tree; `writeInto` populates whichever dir it is given. */
function orchestrationFixture(
  prefix: string,
  writeInto: (dir: string) => void,
  target: 'root' | 'member'
): { root: string; member: string } {
  const root = tmpDir(prefix);
  const member = join(root, 'services', 'api');
  mkdirSync(member, { recursive: true });
  writeInto(target === 'root' ? root : member);
  return { root, member };
}

function inheritParams(root: string) {
  return { inheritance: { orchestrationRoot: root, inherits: true } };
}

test('AIS-07 inherits capability from the orchestration root', () => {
  const { root, member } = orchestrationFixture(
    'awos-inherit-AIS-07-',
    writeGuardHooks,
    'root'
  );
  try {
    assert.equal(
      detectAgentSafetyHooks(member).status,
      'FAIL',
      'AIS-07 must FAIL for a member with no root in scope — otherwise the inheritance test proves nothing'
    );
    const res = detectAgentSafetyHooks(member, inheritParams(root));
    assert.equal(
      res.status,
      'PASS',
      'AIS-07 must be credited from the orchestration root, which is where the hook guard actually lives'
    );
    assert.ok(
      res.evidence.some((e) => /inherited from orchestration root/.test(e)),
      `AIS-07's evidence must say the credit was inherited, so a reader can trace it; got ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AIS-07 is unchanged for a member carrying its own capability', () => {
  const { root, member } = orchestrationFixture(
    'awos-own-AIS-07-',
    writeGuardHooks,
    'member'
  );
  try {
    const bare = detectAgentSafetyHooks(member);
    const withRoot = detectAgentSafetyHooks(member, inheritParams(root));
    assert.deepEqual(
      withRoot,
      bare,
      'AIS-07 must produce byte-identical results for a self-sufficient member whether or not a root is in scope — this is the no-regression guarantee for repos that already pass'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AIS-07 does not inherit when the category policy is false', () => {
  const { root, member } = orchestrationFixture(
    'awos-nopolicy-AIS-07-',
    writeGuardHooks,
    'root'
  );
  try {
    const res = detectAgentSafetyHooks(member, {
      inheritance: { orchestrationRoot: root, inherits: false },
    });
    assert.equal(
      res.status,
      'FAIL',
      'AIS-07 must respect its standards.toml policy — a root in scope is not by itself permission to inherit'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AIS-07 own-repo evidence path (settings branch) is unaffected by orchestration-root support', () => {
  const t = tmp();
  writeGuardHooks(t);
  const r = detectAgentSafetyHooks(t);
  assert.ok(
    r.evidence.some((e) => e.includes('.claude/settings.json')),
    `AIS-07's own-repo evidence must render the same path as before orchestration-root support existed — no root is in scope here, so nothing about this path should change; got ${JSON.stringify(r.evidence)}`
  );
});

test('AIS-07 inherited evidence path (settings branch) is readable, not a ../.. trail', () => {
  const { root, member } = orchestrationFixture(
    'awos-readable-AIS-07-settings-',
    writeGuardHooks,
    'root'
  );
  try {
    const r = detectAgentSafetyHooks(member, inheritParams(root));
    assert.ok(
      r.evidence.some((e) => e.includes('.claude/settings.json')),
      `AIS-07's inherited evidence must reconstruct the logical registry-relative location within the root, not the raw resolved path; got ${JSON.stringify(r.evidence)}`
    );
    assert.ok(
      r.evidence.every((e) => !e.includes('../')),
      `AIS-07's inherited evidence must not render as an unreadable ../.. trail; got ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AIS-07 own-repo evidence path (hook-directory branch) is unaffected by orchestration-root support', () => {
  const t = tmp();
  writeGuardHookScript(t);
  const r = detectAgentSafetyHooks(t);
  assert.ok(
    r.evidence.some((e) => e.includes('.claude/hooks/guard.sh')),
    `AIS-07's own-repo evidence must render the same path as before orchestration-root support existed — no root is in scope here, so nothing about this path should change; got ${JSON.stringify(r.evidence)}`
  );
});

test('AIS-07 inherited evidence path (hook-directory branch) is readable, not a ../.. trail', () => {
  const { root, member } = orchestrationFixture(
    'awos-readable-AIS-07-hooks-',
    writeGuardHookScript,
    'root'
  );
  try {
    const r = detectAgentSafetyHooks(member, inheritParams(root));
    assert.ok(
      r.evidence.some((e) => e.includes('.claude/hooks/guard.sh')),
      `AIS-07's inherited evidence must reconstruct the logical registry-relative location within the root, not the raw resolved path; got ${JSON.stringify(r.evidence)}`
    );
    assert.ok(
      r.evidence.every((e) => !e.includes('../')),
      `AIS-07's inherited evidence must not render as an unreadable ../.. trail; got ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
