import { makeResult, iterFiles } from './_base.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// detectCustomCommands — category 2001 (AI-02, method: detected)
//
// PASS if .claude/commands/ exists and contains at least one *.md file.
// FAIL otherwise.
// ---------------------------------------------------------------------------

export function detectCustomCommands(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const commandsDir = join(repoPath, '.claude', 'commands');
  if (!existsSync(commandsDir)) {
    return makeResult('FAIL', 0, [
      'no .claude/commands/ directory found — no custom slash commands defined',
    ]);
  }
  const files = iterFiles(commandsDir, ['*.md']);
  if (files.length > 0) {
    const names = files.map((p) => relative(repoPath, p));
    return makeResult('PASS', files.length, [
      `${files.length} custom command file(s) found under .claude/commands/`,
      ...names.slice(0, 10).map((n) => `command: ${n}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no custom command files found in .claude/commands/ — define slash commands for common workflows',
  ]);
}

// ---------------------------------------------------------------------------
// detectClaudeSkills — category 2002 (AI-03, method: detected)
//
// PASS if at least one SKILL.md file exists anywhere under .claude/skills/.
// FAIL otherwise.
// ---------------------------------------------------------------------------

export function detectClaudeSkills(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const skillsRoot = join(repoPath, '.claude', 'skills');
  if (!existsSync(skillsRoot)) {
    return makeResult('FAIL', 0, [
      'no .claude/skills/ directory found — no Claude Code skills configured',
    ]);
  }
  const files = iterFiles(skillsRoot, ['SKILL.md']);
  if (files.length > 0) {
    const names = files.map((p) => relative(repoPath, p));
    return makeResult('PASS', files.length, [
      `${files.length} SKILL.md file(s) found under .claude/skills/`,
      ...names.slice(0, 10).map((n) => `skill: ${n}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no SKILL.md files found under .claude/skills/ — no Claude Code skills configured',
  ]);
}

// ---------------------------------------------------------------------------
// detectMcpConfig — category 2003 (AI-04, method: detected)
//
// PASS if any of the recognised MCP config files exist:
//   .mcp.json, .claude/mcp.json
// FAIL otherwise.
// ---------------------------------------------------------------------------

const MCP_CONFIG_PATHS = ['.mcp.json', '.claude/mcp.json'];

export function detectMcpConfig(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];
  for (const relPath of MCP_CONFIG_PATHS) {
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
    'no MCP configuration found (.mcp.json or .claude/mcp.json) — no MCP servers configured',
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
  // Check for hook files in .claude/hooks/
  const hooksDir = join(repoPath, '.claude', 'hooks');
  if (existsSync(hooksDir)) {
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
        `${hookFiles.length} hook file(s) found in .claude/hooks/`,
        ...names.slice(0, 10).map((n) => `hook file: ${n}`),
      ]);
    }
  }

  // Check for "hooks" key in settings files
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
    'no Claude Code hooks found — neither .claude/hooks/ files nor "hooks" key in settings',
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
