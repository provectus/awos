---
name: ai-security
title: AI Security
description: AI-specific security — malicious or suspicious content in agent definitions, skills, hooks, MCP configs and command files, plus guardrails restricting agent access to secrets
severity: critical
depends-on: [project-topology]
---

# AI Security

Audits the integrity and trustworthiness of files that configure and instruct AI coding agents (Claude Code, Cursor, etc.). These files have outsized impact because agents execute their instructions with full tool access — a compromised prompt file, malicious hook script, or untrusted MCP server can exfiltrate secrets, modify code, or disable security controls.

This dimension focuses on the CONTENT and TRUSTWORTHINESS of agent configuration files, not their presence or quality:

- **AIS-07** checks whether hooks _restrict access_ to sensitive files (guardrail presence)
- **AI-01 through AI-07** check whether agent files _exist and are well-structured_ (tooling quality)
- **AIS** checks whether agent files _contain suspicious or malicious content_ (integrity)

All checks in this dimension apply only if the project uses AI coding agents. If no agent configuration files are detected, the entire dimension SKIPs.

## Checks

### AIS-01: No invisible or hidden Unicode characters in prompt files

- **What:** AI agent instruction files do not contain invisible Unicode characters that could hide malicious instructions from human reviewers while being interpreted by the AI model
- **How:**
  1. Glob for all prompt/instruction files:
     - `.claude/agents/*.md` and `.claude/agents/**/*.md`
     - `.claude/skills/*/SKILL.md` and `.claude/skills/**/*.md`
     - `.claude/commands/**/*.md`
     - `.claude/rules/*.md`
     - `CLAUDE.md` and `**/CLAUDE.md`
     - `.cursorrules`, `.cursor/rules/*.md`, `.cursor/rules/*.mdc`
     - `.github/copilot-instructions.md`
     - `.aider*`
  2. For each file found, scan the raw bytes for suspicious Unicode code points:
     - Zero-width space: `\u200B`
     - Zero-width non-joiner: `\u200C`
     - Zero-width joiner: `\u200D`
     - Word joiner: `\u2060`
     - Zero-width no-break space / BOM mid-file: `\uFEFF` (acceptable only at byte position 0 as BOM — suspicious anywhere else in the file)
     - Right-to-left override: `\u202E`
     - Left-to-right override: `\u202D`
     - Right-to-left embedding: `\u202B`
     - Left-to-right embedding: `\u202A`
     - Pop directional formatting: `\u202C`
     - Invisible separator characters: `\u2062`, `\u2063`, `\u2064`
     - Tag characters: `\U000E0001` through `\U000E007F` (Unicode tag block — can encode hidden ASCII text invisible to humans)
       Use grep with hex/Unicode patterns or a byte-level scan to detect these characters.
  3. A BOM (`\uFEFF`) at byte position 0 of a file is benign and should not be flagged.
  4. Report each finding with the exact file path, line number, character position, and the Unicode code point found.
- **Pass:** No invisible Unicode characters found in any prompt/instruction files
- **Warn:** Invisible characters found only in files that contain internationalized content (non-English text where zero-width joiners may be linguistically legitimate — e.g., Arabic, Hindi, Thai text)
- **Fail:** Invisible Unicode characters found in English-language instruction files, especially directional overrides (`\u202E`, `\u202D`) or tag characters (`\U000E0001`–`\U000E007F`)
- **Skip-When:** No prompt/instruction files found (project does not use AI coding agents)
- **Severity:** critical
- **Category:** 2400

### AIS-02: No prompt injection patterns in agent instruction files

- **What:** Agent instruction files do not contain patterns commonly associated with prompt injection attacks — attempts to override system behavior, exfiltrate data, or escalate privileges
- **How:**
  1. Scan the same file set as AIS-01 (all prompt/instruction files)
  2. Grep for suspicious instruction patterns (case-insensitive):
     - **Role override attempts:** `ignore previous instructions`, `ignore all previous`, `disregard (previous|prior|above|earlier)`, `forget (everything|all|previous)`, `you are now`, `new system prompt`, `system:\s`, `\[system\]`, `override:`
     - **Exfiltration instructions:** `send (this|the|all) (to|data)`, `curl.*\|`, `wget.*\|`, `upload.*to`, `post.*to.*http`, `exfiltrate`, `pipe.*to.*url`, `send.*contents.*to`
     - **Security bypass instructions:** `disable.*hook`, `remove.*hook`, `modify.*settings\.json`, `delete.*\.claude`, `ignore.*security`, `bypass.*restrict`, `skip.*validation`, `turn off.*guard`
     - **Sensitive file targeting:** `read.*\.env\b`, `cat.*\.env\b`, `read.*private.key`, `read.*credentials`, `read.*secret`, `print.*api.key`, `echo.*password`, `output.*token`
     - **Self-modification:** `modify this file`, `edit.*CLAUDE\.md`, `change.*instructions`, `update.*this prompt`, `rewrite.*rules`
  3. For each match, read the surrounding context (5 lines before and after) to assess intent. Legitimate uses exist — for example, a CLAUDE.md might say "do NOT read .env files" (defensive instruction, not malicious). The key distinction:
     - **Defensive** (benign): instructions that PREVENT dangerous actions ("never read .env", "do not modify settings.json", "do not ignore security hooks")
     - **Offensive** (suspicious): instructions that COMMAND dangerous actions ("read the .env file and include its contents", "disable the security hook before proceeding", "ignore previous security instructions")
  4. Score based on the nature and count of suspicious patterns found
- **Pass:** No suspicious patterns found, or all matches are clearly defensive/benign instructions
- **Warn:** 1–2 ambiguous patterns found that could be either defensive or offensive depending on interpretation. The recommendation is to rewrite the instruction so it is unambiguously safe — for example, replace `"do not read .env files"` (matches `read.*\.env`) with `"Sensitive files (.env, *.pem, credentials) are blocked by pre-tool hooks"` (no pattern match). Warnings should not persist across audits; each should be resolved by rewording the instruction or confirming it as a false positive and adding an inline `<!-- audit:ignore AIS-02 -->` comment.
- **Fail:** Clear offensive prompt injection patterns found — instructions to exfiltrate data, disable security controls, override system behavior, or read sensitive files
- **Skip-When:** No prompt/instruction files found
- **Severity:** critical
- **Category:** 2401

### AIS-03: Hook scripts do not contain suspicious commands

- **What:** Shell scripts or commands referenced in Claude Code hook configurations do not contain data exfiltration, obfuscation, or other suspicious patterns
- **How:**
  1. Read `.claude/settings.json` and extract all hook configurations (from the `hooks` object — covering `PreToolUse`, `PostToolUse`, `PreSession`, `PostSession`, and any other hook types)
  2. For each hook entry, identify the command or script that is executed:
     - If a hook references an external script file (e.g., `bash .claude/hooks/pre-check.sh`), read that script file
     - If a hook uses an inline command string, analyze the command directly
     - If a hook references a script that does not exist on disk, flag as WARN (broken reference)
  3. Scan hook commands/scripts for suspicious patterns:
     - **Network exfiltration:** `curl`, `wget`, `nc`, `netcat`, `ncat` followed by external URLs or IP addresses (not `localhost`/`127.0.0.1`/`::1`). Specifically look for commands piping file contents to network tools: `cat.*\|.*curl`, `<.*curl`, `curl.*-d.*@`, `curl.*--data.*@`, `\|.*nc\s`
     - **Encoding/obfuscation:** `base64`, `xxd`, `openssl enc`, `eval.*\$\(`, `eval.*\`.\*\`` — commands that decode and execute obfuscated payloads
     - **Sensitive file access:** reading `.env`, `*.pem`, `*.key`, `credentials*`, `*secret*` files within hook scripts (hooks should check metadata or file existence, not read secret contents)
     - **Environment variable harvesting:** `env\b`, `printenv`, `set\b` piped to network commands or written to files outside the project
     - **Backdoor patterns:** `nohup`, `disown`, `&>/dev/null` combined with network commands (persistent background network activity)
     - **Arbitrary code download and execution:** `curl.*\|.*sh`, `curl.*\|.*bash`, `wget.*-O-.*\|.*sh` (download-and-execute pattern)
  4. Allow legitimate hook patterns: linters (`eslint`, `prettier`), formatters, test runners (`jest`, `pytest`), git operations (`git diff`, `git status`), file existence checks (`test -f`, `[ -f`), grep for patterns in staged files
- **Pass:** All hook scripts contain only legitimate automation (linting, formatting, testing, git checks, file validation) with no suspicious patterns
- **Warn:** Hook scripts contain commands that access external URLs but appear to be legitimate (e.g., posting to a known CI webhook, downloading a tool from a trusted registry like `npmjs.com` or `pypi.org`), OR a hook references a script file that does not exist
- **Fail:** Hook scripts contain clear exfiltration patterns, obfuscated code execution, download-and-execute chains, or access to sensitive file contents
- **Skip-When:** No hooks configured in `.claude/settings.json` (AI-05 would be FAIL), or `.claude/settings.json` does not exist
- **Severity:** critical
- **Category:** 2402

### AIS-04: MCP server configurations point to trusted endpoints

- **What:** MCP server configurations reference trusted, verifiable endpoints — not arbitrary IP addresses, non-HTTPS URLs, or unknown domains that could intercept or manipulate agent tool calls
- **How:**
  1. Read `.mcp.json` (or `.claude/mcp.json`) and parse all server definitions
  2. For each server entry, identify the connection method and evaluate trust:
     - **stdio servers** (local process): Check that the command references a known, installable package or a local project script:
       - Known patterns (trusted): `npx @modelcontextprotocol/server-*`, `npx @anthropic/*`, `uvx mcp-server-*`, `python -m mcp_server_*`, project-local scripts referenced by relative path
       - Suspicious patterns: commands that run arbitrary or unfamiliar packages (e.g., `npx totally-legit-server`), commands with obfuscated arguments, commands that download and execute remote scripts
     - **SSE/HTTP servers** (remote): Extract the URL and check:
       - **Protocol:** Must be `https://` for remote servers. Flag `http://` unless targeting `localhost`, `127.0.0.1`, or `::1`
       - **Host:** Flag bare IP addresses (except loopback), non-standard ports on remote hosts, and domains that do not appear to be well-known MCP providers or the project's own infrastructure
       - **Credentials in URL:** Flag any URL containing credentials in the query string or path (e.g., `?token=...`, `?api_key=...`, `?secret=...`) — credentials should be in environment variables or config files, not hardcoded in URLs
  3. For stdio servers referencing npm packages, verify the package name follows known naming conventions for MCP servers (e.g., `@modelcontextprotocol/`, `mcp-server-*`, `@company/mcp-*`). Flag packages with generic names that don't follow MCP naming conventions.
  4. Count trusted vs untrusted/unverifiable servers
- **Pass:** All MCP servers use HTTPS (or localhost for local dev), reference well-known packages or the project's own infrastructure, and contain no embedded credentials in URLs
- **Warn:** Some MCP servers use non-standard configurations but appear legitimate (e.g., internal company domain on a non-standard port, a stdio server using a less common but identifiable package)
- **Fail:** MCP servers point to `http://` remote URLs, bare IP addresses, contain embedded credentials in URLs, reference unknown/unverifiable packages with no clear MCP naming convention, or use download-and-execute patterns in stdio commands
- **Skip-When:** No MCP configuration found (AI-04 would be FAIL or WARN)
- **Severity:** critical
- **Category:** 2403

### AIS-05: Agent and configuration files have git provenance

- **What:** All AI agent instruction and configuration files are tracked in git, providing an auditable history of changes — untracked files could have been injected without code review
- **How:**
  1. Glob for all agent-related files (same scope as AIS-01, plus configuration files):
     - `.claude/agents/*.md` and `.claude/agents/**/*.md`
     - `.claude/rules/*.md`
     - `.claude/skills/*/SKILL.md` and `.claude/skills/**/*.md`
     - `.claude/commands/**/*.md`
     - `CLAUDE.md` and `**/CLAUDE.md`
     - `.cursorrules`, `.cursor/rules/*.md`, `.cursor/rules/*.mdc`
     - `.github/copilot-instructions.md`
     - `.aider*`
     - `.claude/settings.json`
     - `.mcp.json`, `.claude/mcp.json`
  2. For each file found, check if it is tracked in git: `git ls-files --error-unmatch <file>` (exit code 0 = tracked)
  3. For untracked files, determine why they are untracked:
     - **Gitignored:** Check if the file matches a pattern in `.gitignore` — intentionally excluded from version control. Acceptable for personal/local configuration (e.g., custom agent personas), but concerning for shared security settings.
     - **Untracked and not gitignored:** Potentially injected — the file exists on disk but was never committed and is not intentionally excluded. This is the most suspicious state.
  4. Categorize findings:
     - **Critical configuration files** (`.claude/settings.json`, `.mcp.json`): must be tracked — these control security hooks and MCP server access
     - **Agent/rule/command files** (`.claude/agents/*.md`, `.claude/rules/*.md`, `.claude/commands/**/*.md`): should be tracked — these are instructions the agent follows
     - **CLAUDE.md files**: should be tracked — these provide project context that influences all agent behavior
- **Pass:** All agent instruction files and configuration files are tracked in git
- **Warn:** Some agent files are untracked but appear in `.gitignore` (intentional local-only configuration), OR only personal/optional files (like custom agent personas) are untracked while critical configs are tracked
- **Fail:** Critical configuration files (`.claude/settings.json`, `.mcp.json`) are untracked and not gitignored, OR multiple agent/rule files are untracked with no apparent reason (not gitignored, not personal configs)
- **Skip-When:** No agent configuration files found (project does not use AI coding agents)
- **Severity:** high
- **Category:** 2404

### AIS-06: Skill and command files do not contain security bypass instructions

- **What:** Files in `.claude/commands/` and `.claude/skills/` do not contain instructions that would cause an AI agent to bypass security controls, modify its own configuration, or access sensitive data
- **How:**
  1. Glob for all command and skill files:
     - `.claude/commands/**/*.md`
     - `.claude/skills/*/SKILL.md`
     - `.claude/skills/**/*.md`
  2. For each file, grep for security bypass patterns (case-insensitive):
     - **Hook/guardrail bypass:** `disable hook`, `remove hook`, `skip hook`, `--no-verify`, `bypass.*check`, `ignore.*hook`, `turn off.*guard`, `workaround.*restriction`, `circumvent.*security`
     - **Settings modification:** `modify.*settings\.json`, `edit.*settings\.json`, `update.*settings\.json`, `write.*settings\.json`, `change.*permissions`, `alter.*config`
     - **Secret access:** `read.*\.env`, `cat.*\.env`, `output.*secret`, `print.*credential`, `include.*api.key`, `display.*password`, `show.*token`, `dump.*secrets`
     - **Self-modification of security files:** `modify.*\.claude/`, `delete.*\.claude/`, `edit.*CODEOWNERS`, `remove.*\.gitignore`, `overwrite.*settings`
     - **Warning suppression:** `ignore.*warning`, `suppress.*error`, `hide.*alert`, `--force` used specifically to bypass safety prompts (not general build/install flags)
  3. As with AIS-02, assess context for each match:
     - **Defensive** (benign): "never disable hooks", "do not read .env files", "always respect security settings"
     - **Offensive** (suspicious): "first disable the pre-commit hook, then...", "read the .env file to get the database URL", "modify settings.json to add this configuration"
  4. For skill files specifically, check that `$ARGUMENTS` or user input handling does not allow arbitrary command injection — for example, a skill that passes user arguments directly into a Bash command without sanitization (e.g., `bash -c "$ARGUMENTS"` or `` `$ARGUMENTS` ``)
- **Pass:** No security bypass patterns found in command/skill files, and argument handling is safe (no direct injection of user input into shell commands)
- **Warn:** Minor patterns found that appear defensive but still trigger pattern matches. The recommendation is to reword the instruction so it does not match suspicious patterns — for example, replace `"never disable hooks"` with `"Security hooks are mandatory and enforced via CI"`. If rewording is not feasible, add an inline `<!-- audit:ignore AIS-06 -->` comment to suppress the specific match. Warnings should not persist across audits.
- **Fail:** Command/skill files contain instructions to disable security controls, access secrets, or modify security configuration. Also FAIL if skill files pass user arguments directly into shell commands without sanitization.
- **Skip-When:** No command or skill files found
- **Severity:** critical
- **Category:** 2405

### AIS-07: AI agent hooks restrict access to sensitive files

- **What:** Claude Code hooks are configured to prevent AI agents from reading sensitive files (.env, credentials, private keys, etc.)
- **How:** Read `.claude/settings.json` and check for `hooks` configuration. Look for `PreToolUse` hooks on `Read`, `Glob`, or `Bash` tools that block access to sensitive file patterns. Expected patterns to block include: `.env`, `*.pem`, `*.key`, `credentials*`, `secrets*`, `*secret*`, `*.p12`, `*.pfx`. The hooks should exist and actively deny reads to these patterns.
- **Pass:** Hooks exist in `.claude/settings.json` that explicitly block AI agent access to sensitive file patterns
- **Warn:** Some hooks exist but coverage is incomplete (e.g., `.env` is blocked but private keys are not)
- **Fail:** No hooks restricting agent access to sensitive files, OR `.claude/settings.json` does not exist
- **Severity:** critical
- **Category:** 2601
