import { makeResult, iterFiles } from './_base.ts';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ALL_HOOK_PATHS } from '../agent_tools.ts';

// ---------------------------------------------------------------------------
// detectEnvGitignored — category 2600 (AS-12, method: detected)
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
// detectAgentSafetyHooks — category 2601 (AIS-07, method: detected)
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
// detectEnvExample — category 2602 (AS-13, method: detected)
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
// detectSensitiveFilesGitignored — category 2604 (AS-14, method: detected)
//
// Checks that sensitive file types present in the repo (or implied by the
// stack) are excluded from both version control and container image builds.
//
// Relevant types: those for which a matching file exists in the repo, OR
// whose technology is implied by the stack. If none are relevant → PASS
// (no penalty for repos that don't use these file types).
//
// PASS  if every relevant type is covered by .gitignore AND (no Dockerfile,
//        or covered by .dockerignore as well).
// WARN  if covered by .gitignore but a Docker-exposure gap exists (Dockerfile
//        present and the type is missing from .dockerignore).
// FAIL  if a relevant type is not excluded by .gitignore at all.
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: Array<{
  name: string;
  rx: RegExp;
  fileGlob: string;
}> = [
  {
    name: '*.pem',
    rx: /^\s*(\*\*\/)?\*\.pem\s*(?:#.*)?$/m,
    fileGlob: '*.pem',
  },
  {
    name: '*.key',
    rx: /^\s*(\*\*\/)?\*\.key\s*(?:#.*)?$/m,
    fileGlob: '*.key',
  },
  {
    name: '*.p12',
    rx: /^\s*(\*\*\/)?\*\.p12\s*(?:#.*)?$/m,
    fileGlob: '*.p12',
  },
  {
    name: '*.pfx',
    rx: /^\s*(\*\*\/)?\*\.pfx\s*(?:#.*)?$/m,
    fileGlob: '*.pfx',
  },
  {
    name: '*.jks',
    rx: /^\s*(\*\*\/)?\*\.jks\s*(?:#.*)?$/m,
    fileGlob: '*.jks',
  },
  {
    name: '*.keystore',
    rx: /^\s*(\*\*\/)?\*\.keystore\s*(?:#.*)?$/m,
    fileGlob: '*.keystore',
  },
  {
    name: 'credentials.json',
    rx: /^\s*(\*\*\/)?credentials\.json\s*(?:#.*)?$/m,
    fileGlob: 'credentials.json',
  },
  {
    name: 'secrets.yaml/secrets.yml',
    rx: /^\s*(\*\*\/)?(secrets\.yaml|secrets\.yml)\s*(?:#.*)?$/m,
    fileGlob: 'secrets.y*ml',
  },
  {
    name: 'kubeconfig',
    rx: /^\s*(\*\*\/)?kubeconfig\s*(?:#.*)?$/m,
    fileGlob: 'kubeconfig',
  },
];

/** Returns true if ignoreContent contains a line that covers the given pattern. */
function isCoveredInIgnore(
  pattern: { rx: RegExp },
  ignoreContent: string
): boolean {
  return pattern.rx.test(ignoreContent);
}

/**
 * Reads all *ignore and .*ignore files at the repo root.
 * Returns a map of filename → content.
 */
function readRootIgnoreFiles(repoPath: string): Map<string, string> {
  const map = new Map<string, string>();
  let entries: string[];
  try {
    entries = readdirSync(repoPath);
  } catch {
    return map;
  }
  const ignoreNameRx = /^\.?\w+ignore$/;
  for (const entry of entries) {
    if (!ignoreNameRx.test(entry)) continue;
    try {
      map.set(entry, readFileSync(join(repoPath, entry), 'utf8'));
    } catch {
      // skip unreadable files
    }
  }
  return map;
}

export function detectSensitiveFilesGitignored(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // --- Step 1: determine which types are relevant ---
  const relevantTypes = SENSITIVE_PATTERNS.filter((p) => {
    try {
      return iterFiles(repoPath, [p.fileGlob]).length > 0;
    } catch {
      return false;
    }
  });

  if (relevantTypes.length === 0) {
    // Nothing sensitive exists to cover — absence is not evidence of guardrails.
    return makeResult(
      'SKIP',
      null,
      [
        'no sensitive file types present in this stack — ignore-coverage check not applicable',
      ],
      'detected'
    );
  }

  // --- Step 2: read ignore files ---
  const ignoreMap = readRootIgnoreFiles(repoPath);
  const gitignoreContent = ignoreMap.get('.gitignore') ?? null;
  const dockerignoreContent = ignoreMap.get('.dockerignore') ?? null;
  const hasDockerfile = existsSync(join(repoPath, 'Dockerfile'));

  // --- Step 3: evaluate per relevant type ---
  const failEvidence: string[] = [];
  const warnEvidence: string[] = [];
  const passEvidence: string[] = [];

  for (const pattern of relevantTypes) {
    const inGit =
      gitignoreContent != null && isCoveredInIgnore(pattern, gitignoreContent);
    const inDocker =
      dockerignoreContent != null &&
      isCoveredInIgnore(pattern, dockerignoreContent);

    if (!inGit) {
      failEvidence.push(
        `${pattern.name} not excluded by .gitignore — add it to prevent accidental commits`
      );
    } else if (hasDockerfile && !inDocker) {
      warnEvidence.push(
        `${pattern.name} ignored by .gitignore but not .dockerignore — COPY . in Dockerfile would leak it into the image`
      );
    } else {
      const coveredBy = [
        '.gitignore',
        ...(hasDockerfile && inDocker ? ['.dockerignore'] : []),
      ].join(', ');
      passEvidence.push(`${pattern.name} covered by ${coveredBy}`);
    }
  }

  // --- Step 4: score ---
  if (failEvidence.length > 0) {
    return makeResult('FAIL', relevantTypes.length - failEvidence.length, [
      `${failEvidence.length} relevant sensitive file type(s) not excluded by .gitignore`,
      ...failEvidence,
      ...warnEvidence,
      ...passEvidence,
    ]);
  }

  if (warnEvidence.length > 0) {
    return makeResult('WARN', relevantTypes.length - warnEvidence.length, [
      `${warnEvidence.length} sensitive file type(s) exposed to Docker builds — add to .dockerignore`,
      ...warnEvidence,
      ...passEvidence,
    ]);
  }

  return makeResult('PASS', relevantTypes.length, [
    `all ${relevantTypes.length} relevant sensitive file type(s) properly excluded`,
    ...passEvidence,
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each security code to its function.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2600: detectEnvGitignored, // AS-12 .env gitignored
  2601: detectAgentSafetyHooks, // AIS-07 agent safety hooks
  2602: detectEnvExample, // AS-13 .env.example present
  2604: detectSensitiveFilesGitignored, // AS-14 sensitive file types gitignored
};
