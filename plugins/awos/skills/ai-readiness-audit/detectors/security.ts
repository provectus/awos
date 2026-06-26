import { makeResult, iterFiles, grep } from './_base.ts';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ALL_HOOK_PATHS } from '../agent_tools.ts';

// ---------------------------------------------------------------------------
// detectEnvGitignored — category 2600 (SEC-01, method: detected)
//
// PASS if .gitignore exists and contains a pattern that covers .env files.
// FAIL if .gitignore is absent or does not cover .env.
//
// Recognised patterns: `.env`, `.env.*`, `*.env`, `**/.env`, `/env`.
// ---------------------------------------------------------------------------

const ENV_GITIGNORE_RX =
  /^\s*(\.env(\.\*)?|\*\.env|\*\*\/\.env|\/\.env)\s*(?:#.*)?$/m;

export function detectEnvGitignored(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const gitignorePath = join(repoPath, '.gitignore');
  if (!existsSync(gitignorePath)) {
    return makeResult('FAIL', 0, [
      'no .gitignore file found — .env files are not excluded from version control',
    ]);
  }

  let content: string;
  try {
    content = readFileSync(gitignorePath, 'utf8');
  } catch {
    return makeResult('FAIL', 0, ['.gitignore could not be read']);
  }

  if (ENV_GITIGNORE_RX.test(content)) {
    return makeResult('PASS', 1, [
      '.gitignore covers .env files — environment secrets excluded from version control',
    ]);
  }

  return makeResult('FAIL', 0, [
    '.gitignore exists but does not cover .env files — add .env or .env.* to .gitignore',
  ]);
}

// ---------------------------------------------------------------------------
// detectAgentSafetyHooks — category 2601 (SEC-02, method: detected)
//
// Checks that Claude Code hooks are configured to guard sensitive files.
// Looks for:
//   1. .claude/settings.json or .claude/settings.local.json containing a
//      "hooks" key (agents are blocked by configured pre-tool hooks).
//   2. Any hook script in .claude/hooks/ that references .env or secret
//      patterns (grep for "env" or "secret" or "\.pem" inside hook files).
//
// PASS if either signal is found.
// FAIL if neither is found.
// ---------------------------------------------------------------------------

const HOOK_FILES_GLOBS = ['*.sh', '*.js', '*.ts', '*.py', '*.bash'];
const HOOK_SENSITIVE_RX = /\.env|secret|credential|\.pem|\.key/i;

export function detectAgentSafetyHooks(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Check settings files for hooks key (Claude Code only for now)
  const settingsPaths = [
    join(repoPath, '.claude', 'settings.json'),
    join(repoPath, '.claude', 'settings.local.json'),
  ];

  for (const sp of settingsPaths) {
    if (!existsSync(sp)) continue;
    let content: string;
    try {
      content = readFileSync(sp, 'utf8');
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (/"hooks"\s*:/.test(content)) {
        return makeResult('PASS', 1, [
          `hooks key found in ${relative(repoPath, sp)} — agent reads guarded by pre-tool hooks`,
        ]);
      }
      continue;
    }
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'hooks' in (parsed as Record<string, unknown>)
    ) {
      return makeResult('PASS', 1, [
        `hooks configured in ${relative(repoPath, sp)} — agent file-read actions can be controlled`,
      ]);
    }
  }

  // Check all agentic tool hook directories for scripts that guard sensitive files
  for (const relHooksDir of ALL_HOOK_PATHS) {
    const hooksDir = join(repoPath, relHooksDir);
    if (!existsSync(hooksDir)) continue;
    const hookFiles = iterFiles(hooksDir, HOOK_FILES_GLOBS);
    for (const f of hookFiles) {
      let src: string;
      try {
        src = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      if (HOOK_SENSITIVE_RX.test(src)) {
        return makeResult('PASS', 1, [
          `hook script references sensitive file patterns: ${relative(repoPath, f)}`,
        ]);
      }
    }
    if (hookFiles.length > 0) {
      // Hooks exist but none clearly guard sensitive files — still better than nothing
      return makeResult('WARN', hookFiles.length, [
        `${hookFiles.length} hook file(s) found in ${relHooksDir} but none explicitly reference .env/secret patterns`,
        ...hookFiles.slice(0, 5).map((f) => `hook: ${relative(repoPath, f)}`),
      ]);
    }
  }

  return makeResult('FAIL', 0, [
    'no agentic coding tool hooks configured — agents are not blocked from reading sensitive files',
  ]);
}

// ---------------------------------------------------------------------------
// detectEnvExample — category 2602 (SEC-03, method: detected)
//
// PASS if a template environment file exists — .env.example, .env.template,
//   .env.sample, .env.dist, or env.example.
// FAIL otherwise.
// ---------------------------------------------------------------------------

const ENV_EXAMPLE_GLOBS = [
  '.env.example',
  '.env.template',
  '.env.sample',
  '.env.dist',
  'env.example',
  'env.template',
];

export function detectEnvExample(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];
  for (const name of ENV_EXAMPLE_GLOBS) {
    const full = join(repoPath, name);
    if (existsSync(full)) {
      found.push(name);
    }
  }

  if (found.length > 0) {
    return makeResult('PASS', found.length, [
      `environment template file(s) found: ${found.join(', ')}`,
      ...found.map((f) => `env template: ${f}`),
    ]);
  }

  return makeResult('FAIL', 0, [
    'no .env.example or .env.template file found — developers have no reference for required environment variables',
  ]);
}

// ---------------------------------------------------------------------------
// detectNoSecretsCommitted — category 2603 (SEC-04, method: detected)
//
// Greps tracked source files for patterns that indicate hardcoded secrets:
//   - High-confidence key assignment patterns (AWS keys, GCP tokens, generic
//     API key / secret / password / token assignments with non-trivial values)
//   - Excludes: obvious test placeholders (test, fake, example, dummy, xxx,
//     your-*, <…>, ${…}), values that are all underscores/dashes/question
//     marks, and comment lines.
//
// The scope is intentionally conservative to minimise false positives.
//
// PASS  if no hits found.
// WARN  if 1–2 hits (may be false positives).
// FAIL  if 3+ hits.
// ---------------------------------------------------------------------------

// Patterns that strongly suggest a hardcoded credential value assignment.
const SECRET_PATTERNS = [
  // AWS access/secret keys (long alphanumeric tokens)
  /AKIA[0-9A-Z]{16}/,
  // Generic assignment: key/secret/token/password/credential = "non-trivial-value"
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|credential|private[_-]?key)\s*[:=]\s*["']([A-Za-z0-9/+\-_.]{12,})["']/i,
];

// Values that are clearly placeholders — skip if any match.
const PLACEHOLDER_RX =
  /test|fake|example|dummy|xxx|your[_-]|placeholder|changeme|replace|<[^>]+>|\$\{[^}]+\}|env\(|process\.env|os\.environ|getenv/i;

const SOURCE_GLOBS_SEC = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.java',
  '*.kt',
  '*.go',
  '*.rb',
  '*.php',
  '*.env',
  '*.yaml',
  '*.yml',
  '*.json',
  '*.toml',
  '*.ini',
  '*.cfg',
  '*.conf',
];

// Directories to always exclude from secret scanning.
const SEC_IGNORE = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  '__pycache__',
  '.next',
  'target',
  'vendor',
  'fixtures',
  'testdata',
  '__tests__',
  'test',
  'tests',
];

export function detectNoSecretsCommitted(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const files = iterFiles(repoPath, SOURCE_GLOBS_SEC, SEC_IGNORE);
  const hits: Array<{ file: string; line: number; pattern: string }> = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;

      for (const pat of SECRET_PATTERNS) {
        if (!pat.test(line)) continue;
        // Skip placeholders
        if (PLACEHOLDER_RX.test(line)) continue;
        hits.push({
          file: relative(repoPath, filePath),
          line: i + 1,
          pattern: pat.source.slice(0, 40),
        });
        break; // one hit per line is enough
      }
    }

    if (hits.length >= 20) break; // bail early — enough evidence
  }

  if (hits.length === 0) {
    return makeResult('PASS', 0, [
      'no hardcoded secret patterns found in tracked source files',
    ]);
  }

  const evidence = hits
    .slice(0, 10)
    .map((h) => `${h.file}:${h.line} possible secret (pattern: ${h.pattern})`);

  if (hits.length <= 2) {
    return makeResult('WARN', hits.length, [
      `${hits.length} possible secret pattern(s) found — review manually`,
      ...evidence,
    ]);
  }

  return makeResult('FAIL', hits.length, [
    `${hits.length} possible hardcoded secret pattern(s) found in committed files`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectSensitiveFilesGitignored — category 2604 (SEC-05, method: detected)
//
// Checks that .gitignore covers sensitive file types relevant to the stack:
//   *.pem, *.key, *.p12, *.pfx, *.jks, *.keystore, *.crt, *.cer,
//   credentials.json (GCP service account), secrets.yaml, kubeconfig.
//
// PASS  if .gitignore covers ≥ 3 of the sensitive patterns.
// WARN  if .gitignore covers 1–2.
// FAIL  if .gitignore is absent or covers none.
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: Array<{ name: string; rx: RegExp }> = [
  { name: '*.pem', rx: /^\s*\*\.pem\s*(?:#.*)?$/m },
  { name: '*.key', rx: /^\s*\*\.key\s*(?:#.*)?$/m },
  { name: '*.p12', rx: /^\s*\*\.p12\s*(?:#.*)?$/m },
  { name: '*.pfx', rx: /^\s*\*\.pfx\s*(?:#.*)?$/m },
  { name: '*.jks', rx: /^\s*\*\.jks\s*(?:#.*)?$/m },
  { name: '*.keystore', rx: /^\s*\*\.keystore\s*(?:#.*)?$/m },
  { name: 'credentials.json', rx: /^\s*credentials\.json\s*(?:#.*)?$/m },
  { name: 'secrets.yaml', rx: /^\s*(secrets\.yaml|secrets\.yml)\s*(?:#.*)?$/m },
  { name: 'kubeconfig', rx: /^\s*kubeconfig\s*(?:#.*)?$/m },
];

export function detectSensitiveFilesGitignored(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const gitignorePath = join(repoPath, '.gitignore');
  if (!existsSync(gitignorePath)) {
    return makeResult('FAIL', 0, [
      'no .gitignore file found — sensitive file types are not excluded from version control',
    ]);
  }

  let content: string;
  try {
    content = readFileSync(gitignorePath, 'utf8');
  } catch {
    return makeResult('FAIL', 0, ['.gitignore could not be read']);
  }

  const covered = SENSITIVE_PATTERNS.filter(({ rx }) => rx.test(content));

  if (covered.length >= 3) {
    return makeResult('PASS', covered.length, [
      `${covered.length} sensitive file type pattern(s) covered in .gitignore`,
      ...covered.map(({ name }) => `gitignored: ${name}`),
    ]);
  }

  if (covered.length >= 1) {
    const missing = SENSITIVE_PATTERNS.filter(({ rx }) => !rx.test(content));
    return makeResult('WARN', covered.length, [
      `only ${covered.length} sensitive pattern(s) covered — add *.pem, *.key, *.p12, *.pfx to .gitignore`,
      ...covered.map(({ name }) => `covered: ${name}`),
      ...missing.slice(0, 5).map(({ name }) => `not covered: ${name}`),
    ]);
  }

  return makeResult('FAIL', 0, [
    'no sensitive file type patterns (*.pem, *.key, *.p12, *.pfx …) found in .gitignore',
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each security code to its function.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2600: detectEnvGitignored, // SEC-01 .env gitignored
  2601: detectAgentSafetyHooks, // SEC-02 agent safety hooks
  2602: detectEnvExample, // SEC-03 .env.example present
  2603: detectNoSecretsCommitted, // SEC-04 no secrets committed
  2604: detectSensitiveFilesGitignored, // SEC-05 sensitive file types gitignored
};
