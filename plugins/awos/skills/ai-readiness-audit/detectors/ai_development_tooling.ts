import {
  makeResult,
  iterFiles,
  readTextSafe,
  probeRepoPath,
  inheritedNote,
} from './_base.ts';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { displayPath } from '../fs_probe.ts';
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
  params?: unknown
): ReturnType<typeof makeResult> {
  // Attribution is per file, not per finding: a member with its own
  // .cursor/rules under a root with .claude/commands genuinely has both
  // surfaces, so neither is suppressed — but a single "inherited" headline
  // over the whole set misreports the member's own files as the root's, and
  // an inherited path renders registry-relative and so is indistinguishable
  // from an own one.
  const allFiles: { display: string; origin: 'own' | 'inherited' }[] = [];
  const foundDirs: string[] = [];

  for (const relDir of ALL_RULE_COMMAND_DIRS) {
    const probe = probeRepoPath(repoPath, params, relDir);
    if (probe.path === null) continue;
    const files = iterFiles(probe.path, ['*.md']);
    if (files.length > 0) {
      for (const f of files) {
        allFiles.push({
          display: displayPath(probe.origin, repoPath, probe.path, relDir, f),
          origin: probe.origin,
        });
      }
      foundDirs.push(relDir);
    }
  }

  if (allFiles.length > 0) {
    const ownCount = allFiles.filter((f) => f.origin === 'own').length;
    const inheritedCount = allFiles.length - ownCount;
    const where = `${allFiles.length} custom command/rule file(s) found under ${foundDirs.join(', ')}`;
    const headline =
      inheritedCount === 0
        ? where
        : ownCount === 0
          ? inheritedNote('inherited', where)
          : `${where} — ${ownCount} in this repo, ${inheritedCount} inherited from the orchestration root`;
    return makeResult('PASS', allFiles.length, [
      headline,
      ...allFiles
        .slice(0, 10)
        .map(
          (f) =>
            `command: ${f.display}${f.origin === 'inherited' ? ' (inherited)' : ''}`
        ),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no *.md files found under any agentic tool command/rule directory',
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
  params?: unknown
): ReturnType<typeof makeResult> {
  const names: string[] = [];
  let inheritedAny = false;

  for (const relSkillsRoot of ALL_SKILL_DIRS) {
    const probe = probeRepoPath(repoPath, params, relSkillsRoot);
    if (probe.path === null) continue;
    if (probe.origin === 'inherited') inheritedAny = true;
    const skillsRoot = probe.path;

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
        // resolvedBase is `target`, not `skillsRoot`: `target` is where f was
        // actually found (after realpath dereferencing symlinks), so
        // relative(target, f) is always a clean same-tree path — computing it
        // against the pre-dereference `skillsRoot` can cross a real-path
        // boundary (e.g. macOS /var vs /private/var) and produce a spurious
        // ../.. trail unrelated to orchestration-root inheritance.
        names.push(
          displayPath(probe.origin, repoPath, target, relSkillsRoot, f)
        );
      }
    }
  }

  if (names.length > 0) {
    return makeResult('PASS', names.length, [
      inheritedNote(
        inheritedAny ? 'inherited' : 'own',
        `${names.length} SKILL.md file(s) found`
      ),
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
  params?: unknown
): ReturnType<typeof makeResult> {
  // Per-candidate attribution, for the same reason as AI-02: an own
  // .cursor/mcp.json and an inherited .mcp.json are two real MCP surfaces,
  // and the evidence has to say which is which.
  const found: { relPath: string; origin: 'own' | 'inherited' }[] = [];
  for (const relPath of ALL_MCP_CONFIG_PATHS) {
    const probe = probeRepoPath(repoPath, params, relPath);
    if (probe.path === null) continue;
    found.push({ relPath, origin: probe.origin });
  }
  if (found.length > 0) {
    const ownCount = found.filter((f) => f.origin === 'own').length;
    const inheritedCount = found.length - ownCount;
    const where = `MCP configuration found: ${found.map((f) => f.relPath).join(', ')}`;
    const headline =
      inheritedCount === 0
        ? where
        : ownCount === 0
          ? inheritedNote('inherited', where)
          : `${where} — ${ownCount} in this repo, ${inheritedCount} inherited from the orchestration root`;
    return makeResult('PASS', found.length, [
      headline,
      ...found.map(
        (f) =>
          `MCP config: ${f.relPath}${f.origin === 'inherited' ? ' (inherited)' : ''}`
      ),
    ]);
  }
  return makeResult('FAIL', 0, [
    `no MCP configuration file found — checked for ${ALL_MCP_CONFIG_PATHS.join(', ')}; none present`,
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
  params?: unknown
): ReturnType<typeof makeResult> {
  // Own-repo capability wins across ALL candidate paths, not just within one:
  // ALL_HOOK_PATHS lists .claude/hooks before .kiro/hooks, so without this
  // first own-only pass a member with its own .kiro/hooks is reported as
  // inheriting the root's .claude/hooks and its own hooks never appear.
  // Passing no params disables inheritance inside probeRepoPath. This also
  // orders the two mechanisms correctly — own settings.json hooks now beat an
  // inherited .claude/hooks/ — at the cost of one extra own-only scan when the
  // member has nothing of its own.
  return (
    resolveHooks(repoPath, undefined) ??
    resolveHooks(repoPath, params) ??
    makeResult('FAIL', 0, [
      'no agentic coding tool hooks found — no lifecycle hooks or settings hooks configured',
    ])
  );
}

/**
 * Resolve hooks for one inheritance setting: hook directories first, then
 * settings-file hooks. Returns null when nothing is found, so the caller can
 * fall through from the own-only pass to the inheriting one.
 */
function resolveHooks(
  repoPath: string,
  params: unknown
): ReturnType<typeof makeResult> | null {
  // Check for hook files in any agentic tool hooks directory
  for (const relHooksDir of ALL_HOOK_PATHS) {
    const probe = probeRepoPath(repoPath, params, relHooksDir);
    if (probe.path === null) continue;
    const hookFiles = iterFiles(probe.path, [
      '*.sh',
      '*.js',
      '*.ts',
      '*.py',
      '*.bash',
    ]);
    if (hookFiles.length > 0) {
      const names = hookFiles.map((p) =>
        displayPath(probe.origin, repoPath, probe.path!, relHooksDir, p)
      );
      return makeResult('PASS', hookFiles.length, [
        inheritedNote(
          probe.origin,
          `${hookFiles.length} hook file(s) found in ${relHooksDir}`
        ),
        ...names.slice(0, 10).map((n) => `hook file: ${n}`),
      ]);
    }
  }

  // Check for "hooks" key in settings files (Claude Code .claude/settings.json)
  const settingsRelPaths = [
    join('.claude', 'settings.json'),
    join('.claude', 'settings.local.json'),
  ];
  for (const relSettingsPath of settingsRelPaths) {
    const probe = probeRepoPath(repoPath, params, relSettingsPath);
    if (probe.path === null) continue;
    const settingsPath = probe.path;
    const content = readTextSafe(settingsPath);
    if (content === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If we can't parse it, look for "hooks" as a string pattern
      if (/"hooks"\s*:/.test(content)) {
        return makeResult('PASS', 1, [
          inheritedNote(
            probe.origin,
            `"hooks" key found in ${displayPath(probe.origin, repoPath, settingsPath, relSettingsPath, settingsPath)}`
          ),
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
        inheritedNote(
          probe.origin,
          `"hooks" key configured in ${displayPath(probe.origin, repoPath, settingsPath, relSettingsPath, settingsPath)}`
        ),
      ]);
    }
  }

  return null;
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
//   - mvnw or gradlew wrapper script at repo root (JVM)
//   - manage.py at repo root (Django)
//   - Procfile at repo root
//
// FAIL if none are found. A build manifest alone (pom.xml, build.gradle)
// does not count — it proves the project builds, not that an agent can run
// it; the wrapper script is the run mechanism.
// ---------------------------------------------------------------------------

export const ROOT_RUN_FILES = [
  'Makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'run.sh',
  'start.sh',
  'justfile',
  'Justfile',
  'Taskfile.yml',
  'Taskfile.yaml',
  'mvnw',
  'gradlew',
  'manage.py',
  'Procfile',
];

function hasPackageJsonRunScript(repoPath: string): boolean {
  const pkgPath = join(repoPath, 'package.json');
  const raw = readTextSafe(pkgPath);
  if (raw === null) return false;
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
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
    `no run mechanism found at repo root — checked for ${ROOT_RUN_FILES.join(', ')}, and package.json start/dev script; none present`,
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
