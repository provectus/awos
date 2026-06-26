import { makeResult, iterFiles } from './_base.ts';
import {
  existsSync,
  readFileSync,
  lstatSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import {
  ALL_RULE_COMMAND_DIRS,
  ALL_SKILL_DIRS,
  ALL_MCP_CONFIG_PATHS,
  ALL_HOOK_PATHS,
} from '../agent_tools.ts';

// ---------------------------------------------------------------------------
// detectCustomCommands — category 2001 (AI-02, method: detected)
//
// PASS if any agentic tool commands/rules directory exists and contains at
// least one *.md file.
// FAIL otherwise.
// ---------------------------------------------------------------------------

export function detectCustomCommands(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const allFiles: string[] = [];
  const foundDirs: string[] = [];

  for (const relDir of ALL_RULE_COMMAND_DIRS) {
    const dir = join(repoPath, relDir);
    if (!existsSync(dir)) continue;
    const files = iterFiles(dir, ['*.md']);
    if (files.length > 0) {
      allFiles.push(...files);
      foundDirs.push(relDir);
    }
  }

  if (allFiles.length > 0) {
    const names = allFiles.map((p) => relative(repoPath, p));
    return makeResult('PASS', allFiles.length, [
      `${allFiles.length} custom command/rule file(s) found under ${foundDirs.join(', ')}`,
      ...names.slice(0, 10).map((n) => `command: ${n}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no custom command or rule files found in any agentic tool directory — define workflows for common tasks',
  ]);
}

// ---------------------------------------------------------------------------
// detectClaudeSkills — category 2002 (AI-03, method: detected)
//
// PASS if at least one SKILL.md file exists anywhere under .claude/skills/.
// FAIL otherwise.
// ---------------------------------------------------------------------------

// Resolve a path to its real (symlink-free) path. Returns null if the path
// does not exist or cannot be resolved (e.g. broken symlink).
function tryRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

export function detectClaudeSkills(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const allFiles: string[] = [];

  for (const relSkillsRoot of ALL_SKILL_DIRS) {
    const skillsRoot = join(repoPath, relSkillsRoot);
    if (!existsSync(skillsRoot)) continue;

    const realSkillsRoot = tryRealpath(skillsRoot) ?? skillsRoot;
    const scanTargets = new Set<string>([realSkillsRoot]);
    try {
      for (const entry of readdirSync(realSkillsRoot)) {
        const entryPath = join(realSkillsRoot, entry);
        let stat: ReturnType<typeof lstatSync>;
        try {
          stat = lstatSync(entryPath);
        } catch {
          continue;
        }
        if (stat.isSymbolicLink()) {
          const resolved = tryRealpath(entryPath);
          if (resolved) scanTargets.add(resolved);
        }
      }
    } catch {
      // readdirSync failed — fall through with just realSkillsRoot
    }

    for (const target of scanTargets) {
      for (const f of iterFiles(target, ['SKILL.md'])) {
        allFiles.push(f);
      }
    }
  }

  if (allFiles.length > 0) {
    const names = allFiles.map((p) => {
      try {
        return relative(repoPath, p);
      } catch {
        return p;
      }
    });
    return makeResult('PASS', allFiles.length, [
      `${allFiles.length} SKILL.md file(s) found`,
      ...names.slice(0, 10).map((n) => `skill: ${n}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no SKILL.md files found under any agentic tool skills directory',
  ]);
}

// ---------------------------------------------------------------------------
// detectMcpConfig — category 2003 (AI-04, method: detected)
//
// PASS if any recognised MCP config file exists across all supported agentic
// coding tools.
// FAIL otherwise.
// ---------------------------------------------------------------------------

export function detectMcpConfig(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];
  for (const relPath of ALL_MCP_CONFIG_PATHS) {
    if (existsSync(join(repoPath, relPath))) {
      found.push(relPath);
    }
  }
  if (found.length > 0) {
    return makeResult('PASS', found.length, [
      `MCP configuration found: ${found.join(', ')}`,
      ...found.map((f) => `MCP config: ${f}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no MCP configuration found — no MCP servers configured for any agentic coding tool',
    'note: only repo-committed MCP config is visible here; org/MGM-pushed MCP servers configured outside the repo are not detectable and may still be in use',
  ]);
}

// ---------------------------------------------------------------------------
// detectClaudeHooks — category 2004 (AI-05, method: detected)
//
// PASS if:
//   - .claude/hooks/ directory contains at least one file, OR
//   - .claude/settings.json or .claude/settings.local.json exists and
//     contains a "hooks" key.
// FAIL otherwise.
// ---------------------------------------------------------------------------

export function detectClaudeHooks(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Check for hook files in any agentic tool hooks directory
  for (const relHooksDir of ALL_HOOK_PATHS) {
    const hooksDir = join(repoPath, relHooksDir);
    if (!existsSync(hooksDir)) continue;
    const hookFiles = iterFiles(hooksDir, [
      '*.sh',
      '*.js',
      '*.ts',
      '*.py',
      '*.bash',
    ]);
    if (hookFiles.length > 0) {
      const names = hookFiles.map((p) => relative(repoPath, p));
      return makeResult('PASS', hookFiles.length, [
        `${hookFiles.length} hook file(s) found in ${relHooksDir}`,
        ...names.slice(0, 10).map((n) => `hook file: ${n}`),
      ]);
    }
  }

  // Check for "hooks" key in settings files (Claude Code .claude/settings.json)
  const settingsFiles = [
    join(repoPath, '.claude', 'settings.json'),
    join(repoPath, '.claude', 'settings.local.json'),
  ];
  for (const settingsPath of settingsFiles) {
    if (!existsSync(settingsPath)) continue;
    let content: string;
    try {
      content = readFileSync(settingsPath, 'utf8');
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If we can't parse it, look for "hooks" as a string pattern
      if (/"hooks"\s*:/.test(content)) {
        return makeResult('PASS', 1, [
          `"hooks" key found in ${relative(repoPath, settingsPath)}`,
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
        `"hooks" key configured in ${relative(repoPath, settingsPath)}`,
      ]);
    }
  }

  return makeResult('FAIL', 0, [
    'no agentic coding tool hooks found — no lifecycle hooks or settings hooks configured',
  ]);
}

// ---------------------------------------------------------------------------
// detectCanRunApp — category 2006 (AI-07, method: detected)
//
// PASS if any of the following run-mechanism signals are present:
//   - Makefile at repo root
//   - docker-compose.yml or docker-compose.yaml at repo root
//   - package.json with a "start" or "dev" script
//   - run.sh, start.sh, or justfile at repo root
//   - Taskfile.yml or Taskfile.yaml at repo root
//
// FAIL if none are found.
// ---------------------------------------------------------------------------

const ROOT_RUN_FILES = [
  'Makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'run.sh',
  'start.sh',
  'justfile',
  'Justfile',
  'Taskfile.yml',
  'Taskfile.yaml',
];

function hasPackageJsonRunScript(repoPath: string): boolean {
  const pkgPath = join(repoPath, 'package.json');
  if (!existsSync(pkgPath)) return false;
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return false;
  }
  if (pkg === null || typeof pkg !== 'object') return false;
  const scripts = (pkg as Record<string, unknown>).scripts;
  if (scripts === null || typeof scripts !== 'object') return false;
  return (
    'start' in (scripts as Record<string, unknown>) ||
    'dev' in (scripts as Record<string, unknown>)
  );
}

export function detectCanRunApp(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];

  for (const f of ROOT_RUN_FILES) {
    if (existsSync(join(repoPath, f))) {
      found.push(f);
    }
  }

  if (hasPackageJsonRunScript(repoPath)) {
    found.push('package.json (start/dev script)');
  }

  if (found.length > 0) {
    return makeResult('PASS', found.length, [
      `run mechanism(s) found: ${found.join(', ')}`,
      ...found.map((f) => `run signal: ${f}`),
    ]);
  }

  return makeResult('FAIL', 0, [
    'no run mechanism found — no Makefile, docker-compose, or package.json start script; ' +
      'Claude Code cannot run the application without human involvement',
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each detected ai-development-tooling code to its function.
// Judgment codes 2000 (AI-01) and 2005 (AI-06) are excluded — they are
// evaluated by the auditor using rubric-based judgment, not detection.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2001: detectCustomCommands, // AI-02 custom slash commands
  2002: detectClaudeSkills, // AI-03 Claude Code skills
  2003: detectMcpConfig, // AI-04 MCP server config
  2004: detectClaudeHooks, // AI-05 Claude Code hooks
  2006: detectCanRunApp, // AI-07 agent can run/observe app
};
