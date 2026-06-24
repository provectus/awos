import { makeResult, iterFiles } from './_base.ts';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// detectInvisibleUnicode — category 2400 (PAI-01, method: detected)
//
// applies_when: topology.has_ai_agent_files
//
// Scans AI agent instruction files for invisible / zero-width Unicode code
// points that could hide malicious instructions from human reviewers.
//
// Suspicious code points (checked via numeric code point — no literal
// invisible chars in source):
//   U+200B – U+200F  Zero-width space / non-joiner / joiner / bidi marks
//   U+2028 – U+202E  Line/paragraph separator and bidi embedding controls
//   U+2060 – U+206F  Word joiner and other invisible formatting
//   U+00AD           Soft hyphen
//   U+FEFF           BOM / zero-width no-break space
//   U+E0000–U+E007F  Unicode tag block (commonly used to hide text)
//
// Scanned paths: CLAUDE.md, AGENTS.md, .mcp.json, everything under .claude/
//
// PASS  if no suspicious characters found.
// WARN  if 1–2 files contain suspicious characters (may be accidental).
// FAIL  if 3+ files or any file with 5+ suspicious code point positions.
// SKIP  if no AI agent files are found.
// ---------------------------------------------------------------------------

// Returns true for invisible / zero-width Unicode code points.
// All comparisons are numeric — no literal invisible chars in source.
function isInvisibleCodePoint(cp: number): boolean {
  return (
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0x00ad ||
    cp === 0xfeff ||
    (cp >= 0xe0000 && cp <= 0xe007f)
  );
}

function countInvisible(content: string): number {
  let count = 0;
  for (const ch of content) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isInvisibleCodePoint(cp)) count++;
  }
  return count;
}

const AGENT_FILE_GLOBS = [
  'CLAUDE.md',
  'AGENTS.md',
  '*.md',
  '*.json',
  '*.sh',
  '*.ts',
  '*.js',
  '*.bash',
  '*.py',
];

function listAgentFiles(repoPath: string): string[] {
  const results: string[] = [];

  // Root-level CLAUDE.md / AGENTS.md / .mcp.json
  for (const name of ['CLAUDE.md', 'AGENTS.md', '.mcp.json']) {
    const full = join(repoPath, name);
    if (existsSync(full)) results.push(full);
  }

  // Everything under .claude/
  const claudeDir = join(repoPath, '.claude');
  if (existsSync(claudeDir)) {
    try {
      const files = iterFiles(claudeDir, AGENT_FILE_GLOBS);
      results.push(...files);
    } catch {
      // ignore scan errors
    }
  }

  return [...new Set(results)].sort();
}

export function detectInvisibleUnicode(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const agentFiles = listAgentFiles(repoPath);

  if (agentFiles.length === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no AI agent instruction files found — PAI-01 not applicable'],
      'detected'
    );
  }

  const hitFiles: Array<{ file: string; count: number }> = [];

  for (const filePath of agentFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const count = countInvisible(content);
    if (count > 0) {
      hitFiles.push({ file: relative(repoPath, filePath), count });
    }
  }

  if (hitFiles.length === 0) {
    return makeResult('PASS', 0, [
      `${agentFiles.length} AI agent file(s) scanned — no invisible Unicode characters found`,
    ]);
  }

  const maxCount = Math.max(...hitFiles.map((h) => h.count));
  const evidence = hitFiles.map(
    (h) =>
      `${h.file}: ${h.count} invisible Unicode code point(s) (U+200B/U+200D/U+FEFF/tag range)`
  );

  if (hitFiles.length >= 3 || maxCount >= 5) {
    return makeResult('FAIL', hitFiles.length, [
      `${hitFiles.length} agent file(s) contain invisible Unicode characters — potential hidden-instruction attack`,
      ...evidence,
    ]);
  }

  return makeResult('WARN', hitFiles.length, [
    `${hitFiles.length} agent file(s) contain invisible Unicode characters — review for hidden content`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectPromptInjection — category 2401 (PAI-02, method: detected)
//
// applies_when: topology.has_ai_agent_files
//
// Scans agent instruction files for prompt injection patterns — attempts to
// override the agent's behaviour, exfiltrate data, or embed out-of-band
// instructions.
//
// Pattern categories:
//   - Role/system override: "ignore previous instructions", "new instructions:"
//   - Exfiltration attempts: "curl https://...", "POST https://..."
//   - Jailbreak markers: "DAN mode", "act as DAN"
//   - Hidden-instruction delimiters: HTML comment containing instruction keywords
//
// PASS  if no patterns found.
// WARN  if 1-2 pattern matches (may be documentation).
// FAIL  if 3+ matches.
// SKIP  if no agent files found.
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: Array<{ name: string; rx: RegExp }> = [
  {
    name: 'override-instructions',
    rx: /ignore\s+(previous|above|all)\s+(instructions?|rules?|guidelines?)/i,
  },
  {
    name: 'new-instructions-override',
    rx: /^#+ new instructions:|^new system prompt:|^override:\s/im,
  },
  {
    name: 'exfiltrate-curl',
    rx: /\bcurl\s+https?:\/\/(?!localhost|127\.0\.0\.1)/i,
  },
  {
    name: 'exfiltrate-post',
    rx: /\b(?:POST|fetch|axios\.post|requests\.post)\s*\(\s*["']https?:\/\/(?!localhost|127\.0\.0\.1)/i,
  },
  {
    name: 'jailbreak-dan',
    rx: /\b(?:DAN\s+mode|act\s+as\s+DAN|you\s+are\s+now\s+(?:DAN|an\s+AI\s+without))/i,
  },
  {
    name: 'hidden-html-instruction',
    rx: /<!--\s*(?:ignore|system|override|instruction)/i,
  },
];

export function detectPromptInjection(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const agentFiles = listAgentFiles(repoPath);

  if (agentFiles.length === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no AI agent instruction files found — PAI-02 not applicable'],
      'detected'
    );
  }

  const hits: Array<{ file: string; line: number; pattern: string }> = [];

  for (const filePath of agentFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { name, rx } of INJECTION_PATTERNS) {
        if (rx.test(line)) {
          hits.push({
            file: relative(repoPath, filePath),
            line: i + 1,
            pattern: name,
          });
          break; // one hit per line
        }
      }
    }
    if (hits.length >= 20) break; // early bail
  }

  if (hits.length === 0) {
    return makeResult('PASS', 0, [
      `${agentFiles.length} agent file(s) scanned — no prompt injection patterns found`,
    ]);
  }

  const evidence = hits
    .slice(0, 10)
    .map((h) => `${h.file}:${h.line} [${h.pattern}]`);

  if (hits.length >= 3) {
    return makeResult('FAIL', hits.length, [
      `${hits.length} prompt injection pattern(s) found in agent instruction files`,
      ...evidence,
    ]);
  }

  return makeResult('WARN', hits.length, [
    `${hits.length} possible prompt injection pattern(s) found — review manually`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectHookScriptSafety — category 2402 (PAI-03, method: detected)
//
// applies_when: topology.has_hooks
//
// Checks that hook scripts under .claude/hooks/ contain only legitimate
// automation — no exfiltration, obfuscation, or download-and-execute patterns.
//
// Red flags:
//   - curl/wget to non-localhost URLs (potential exfiltration or drive-by download)
//   - eval of dynamic content (obfuscation / arbitrary code execution)
//   - base64 decode piped to shell (download-and-execute)
//   - nc / ncat (netcat — data exfiltration)
//
// PASS  if no hooks directory exists OR no red-flag patterns found in any hook.
// WARN  if 1-2 hooks contain red-flag patterns.
// FAIL  if 3+ hooks contain red-flag patterns.
// SKIP  if no .claude/hooks/ directory found.
// ---------------------------------------------------------------------------

const HOOK_RED_FLAGS: Array<{ name: string; rx: RegExp }> = [
  {
    name: 'exfiltrate-curl-wget',
    rx: /\b(curl|wget)\s+(?:-[a-zA-Z]+\s+)*https?:\/\/(?!localhost|127\.0\.0\.1)/,
  },
  {
    name: 'eval-exec-dynamic',
    rx: /\beval\s+["'`]?\s*\$[({]/,
  },
  {
    name: 'base64-pipe-shell',
    rx: /base64\s+(?:-[a-zA-Z]+\s+)?(?:\S+\s+)?[|]\s*(?:sh|bash|zsh|exec)\b/i,
  },
  {
    name: 'netcat-exfiltration',
    rx: /\b(nc|ncat)\s+(?!-[lL])\S+\s+\d{2,5}/,
  },
  {
    name: 'download-execute',
    rx: /(?:curl|wget)\s+[^|]*\|\s*(?:sh|bash|zsh|python|node|ruby)/i,
  },
];

const HOOK_SCRIPT_GLOBS = ['*.sh', '*.bash', '*.js', '*.ts', '*.py'];

export function detectHookScriptSafety(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hooksDir = join(repoPath, '.claude', 'hooks');

  if (!existsSync(hooksDir)) {
    return makeResult(
      'SKIP',
      null,
      ['no .claude/hooks/ directory found — PAI-03 not applicable'],
      'detected'
    );
  }

  let hookFiles: string[] = [];
  try {
    hookFiles = iterFiles(hooksDir, HOOK_SCRIPT_GLOBS);
  } catch {
    hookFiles = [];
  }

  if (hookFiles.length === 0) {
    return makeResult('PASS', 0, [
      'no hook scripts found in .claude/hooks/ — PAI-03 not applicable',
    ]);
  }

  const flaggedFiles: Array<{ file: string; flags: string[] }> = [];

  for (const filePath of hookFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const flags: string[] = [];
    for (const { name, rx } of HOOK_RED_FLAGS) {
      if (rx.test(content)) flags.push(name);
    }
    if (flags.length > 0) {
      flaggedFiles.push({ file: relative(repoPath, filePath), flags });
    }
  }

  if (flaggedFiles.length === 0) {
    return makeResult('PASS', hookFiles.length, [
      `${hookFiles.length} hook script(s) scanned — no exfiltration or obfuscation patterns found`,
    ]);
  }

  const evidence = flaggedFiles.map(
    (f) => `${f.file}: suspicious patterns [${f.flags.join(', ')}]`
  );

  if (flaggedFiles.length >= 3) {
    return makeResult('FAIL', flaggedFiles.length, [
      `${flaggedFiles.length} hook script(s) contain exfiltration or obfuscation patterns`,
      ...evidence,
    ]);
  }

  return makeResult('WARN', flaggedFiles.length, [
    `${flaggedFiles.length} hook script(s) contain suspicious patterns — review manually`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectMcpEndpointSafety — category 2403 (PAI-04, method: detected)
//
// applies_when: topology.has_mcp_config
//
// Checks MCP server configurations for untrusted endpoints:
//   - HTTP (non-HTTPS) remote URLs
//   - Bare IP addresses (not localhost/127.0.0.1)
//   - Embedded credentials (user:pass@ in URLs)
//   - API keys in URL query strings
//
// PASS  if no .mcp.json found (SKIP), or all endpoints use HTTPS / localhost.
// FAIL  if bare IPs, embedded credentials, or non-localhost HTTP remotes found.
// SKIP  if no .mcp.json present.
// ---------------------------------------------------------------------------

const BARE_IP_RX =
  /https?:\/\/(?!localhost|127\.0\.0\.1)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
const HTTP_REMOTE_RX = /http:\/\/(?!localhost|127\.0\.0\.1)/;
const EMBEDDED_CRED_RX = /https?:\/\/[^@\s]{3,}:[^@\s]{3,}@/;
const API_KEY_IN_URL_RX =
  /[?&](?:api_?key|token|secret|password)=[A-Za-z0-9]{8,}/i;

export function detectMcpEndpointSafety(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const mcpPath = join(repoPath, '.mcp.json');

  if (!existsSync(mcpPath)) {
    return makeResult('SKIP', null, [
      'no .mcp.json found — PAI-04 not applicable',
    ]);
  }

  let content: string;
  try {
    content = readFileSync(mcpPath, 'utf8');
  } catch {
    return makeResult('SKIP', null, [
      '.mcp.json could not be read — PAI-04 skipped',
    ]);
  }

  const issues: string[] = [];

  if (BARE_IP_RX.test(content)) {
    issues.push(
      'bare IP address found in MCP endpoint URL — use hostname instead'
    );
  }
  if (HTTP_REMOTE_RX.test(content)) {
    issues.push(
      'HTTP (non-HTTPS) remote endpoint found in .mcp.json — use HTTPS for remote servers'
    );
  }
  if (EMBEDDED_CRED_RX.test(content)) {
    issues.push(
      'embedded credentials (user:pass@host) found in MCP URL — use environment variables instead'
    );
  }
  if (API_KEY_IN_URL_RX.test(content)) {
    issues.push(
      'API key or token embedded in MCP URL query string — use environment variables instead'
    );
  }

  if (issues.length === 0) {
    return makeResult('PASS', 1, [
      '.mcp.json uses safe endpoints (HTTPS or localhost only, no embedded credentials)',
    ]);
  }

  return makeResult('FAIL', issues.length, [
    `${issues.length} MCP endpoint safety issue(s) found in .mcp.json`,
    ...issues,
  ]);
}

// ---------------------------------------------------------------------------
// detectAgentFilesTracked — category 2404 (PAI-05, method: detected)
//
// applies_when: topology.has_ai_agent_files
//
// Verifies that AI agent instruction and configuration files are tracked in
// git. Untracked agent files cannot be audited via git history.
//
// Algorithm:
//   1. List agent files (same list as PAI-01).
//   2. For each file, run `git ls-files --error-unmatch <file>` to check.
//   3. Count untracked files.
//
// PASS  if all agent files are tracked.
// WARN  if 1-2 untracked agent files found.
// FAIL  if 3+ untracked agent files found.
// SKIP  if no agent files found or not a git repo.
// ---------------------------------------------------------------------------

function isGitTracked(repoPath: string, filePath: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', filePath], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

export function detectAgentFilesTracked(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const agentFiles = listAgentFiles(repoPath);

  if (agentFiles.length === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no AI agent instruction files found — PAI-05 not applicable'],
      'detected'
    );
  }

  // Verify this is a git repo
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return makeResult('SKIP', null, [
      'not a git repository — git provenance check (PAI-05) skipped',
    ]);
  }

  const untracked: string[] = [];
  const tracked: string[] = [];

  for (const filePath of agentFiles) {
    if (isGitTracked(repoPath, filePath)) {
      tracked.push(relative(repoPath, filePath));
    } else {
      untracked.push(relative(repoPath, filePath));
    }
  }

  if (untracked.length === 0) {
    return makeResult('PASS', tracked.length, [
      `all ${tracked.length} AI agent file(s) are tracked in git — auditable change history`,
    ]);
  }

  const evidence = untracked.map((f) => `untracked: ${f}`);

  if (untracked.length >= 3) {
    return makeResult('FAIL', untracked.length, [
      `${untracked.length} AI agent file(s) are not tracked in git — changes bypass code review`,
      ...evidence,
    ]);
  }

  return makeResult('WARN', untracked.length, [
    `${untracked.length} AI agent file(s) are not tracked in git — add to git for auditability`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectNoSecurityBypass — category 2405 (PAI-06, method: detected)
//
// applies_when: topology.has_commands_or_skills
//
// Checks that skill and command files contain no instructions to bypass
// security controls, access secrets directly, or modify security configuration.
//
// Scanned paths: .claude/commands/, .claude/skills/
// File types: *.md, *.sh, *.ts, *.js, *.py, *.bash
//
// Bypass patterns:
//   - "bypass security", "skip security", "disable security"
//   - "read .env", "access secrets", "cat .env"
//   - "chmod 777"
//   - "--no-verify" in git commands
//   - "rm -rf /"
//   - SSL/TLS verification disabled
//
// PASS  if no bypass patterns found.
// WARN  if 1-2 matches (may be documentation/comments about NOT doing this).
// FAIL  if 3+ matches.
// SKIP  if no command or skill directories found.
// ---------------------------------------------------------------------------

const BYPASS_PATTERNS: Array<{ name: string; rx: RegExp }> = [
  {
    name: 'bypass-security',
    rx: /\b(?:bypass|skip|disable|circumvent)\s+(?:security|auth|authentication|authorization|ssl|tls|https?)\b/i,
  },
  {
    name: 'read-env-secrets',
    rx: /\b(?:cat|read|open|access)\s+\.env\b|read\s+(?:secrets?|credentials?)\b/i,
  },
  {
    name: 'chmod-world-writable',
    rx: /chmod\s+(?:0?777|a\+rwx|ugo\+rwx)/,
  },
  {
    name: 'git-no-verify',
    rx: /git\s+commit\s+.*--no-verify|git\s+push\s+.*--no-verify/,
  },
  {
    name: 'rm-root-destructive',
    rx: /rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\/(?:\s|$)|rm\s+-rf\s+\//,
  },
  {
    name: 'disable-ssl-verify',
    rx: /--no-check-certificate|ssl_verify\s*=\s*false|verify\s*=\s*false|insecure\s+https?/i,
  },
];

const COMMAND_SKILL_GLOBS = ['*.md', '*.sh', '*.ts', '*.js', '*.py', '*.bash'];

export function detectNoSecurityBypass(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const commandsDir = join(repoPath, '.claude', 'commands');
  const skillsDir = join(repoPath, '.claude', 'skills');

  const hasCmds = existsSync(commandsDir);
  const hasSkills = existsSync(skillsDir);

  if (!hasCmds && !hasSkills) {
    return makeResult(
      'SKIP',
      null,
      [
        'no .claude/commands/ or .claude/skills/ directories found — PAI-06 not applicable',
      ],
      'detected'
    );
  }

  const allFiles: string[] = [];
  for (const dir of [commandsDir, skillsDir]) {
    if (!existsSync(dir)) continue;
    try {
      allFiles.push(...iterFiles(dir, COMMAND_SKILL_GLOBS));
    } catch {
      // skip
    }
  }

  const hits: Array<{ file: string; line: number; pattern: string }> = [];

  for (const filePath of allFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip pure comment lines
      if (/^\s*(#|\/\/|<!--)/.test(line)) continue;
      for (const { name, rx } of BYPASS_PATTERNS) {
        if (rx.test(line)) {
          hits.push({
            file: relative(repoPath, filePath),
            line: i + 1,
            pattern: name,
          });
          break;
        }
      }
    }
    if (hits.length >= 20) break;
  }

  if (hits.length === 0) {
    return makeResult('PASS', allFiles.length, [
      `${allFiles.length} command/skill file(s) scanned — no security bypass instructions found`,
    ]);
  }

  const evidence = hits
    .slice(0, 10)
    .map((h) => `${h.file}:${h.line} [${h.pattern}]`);

  if (hits.length >= 3) {
    return makeResult('FAIL', hits.length, [
      `${hits.length} security bypass pattern(s) found in command/skill files`,
      ...evidence,
    ]);
  }

  return makeResult('WARN', hits.length, [
    `${hits.length} possible security bypass pattern(s) found — review manually`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each prompt-agent-integrity code to its function.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2400: detectInvisibleUnicode, // PAI-01 no invisible Unicode in agent files
  2401: detectPromptInjection, // PAI-02 no prompt injection patterns
  2402: detectHookScriptSafety, // PAI-03 hook script safety (SKIP if no hooks)
  2403: detectMcpEndpointSafety, // PAI-04 MCP endpoint safety (SKIP if no .mcp.json)
  2404: detectAgentFilesTracked, // PAI-05 agent files tracked in git
  2405: detectNoSecurityBypass, // PAI-06 no security bypass in commands/skills
};
