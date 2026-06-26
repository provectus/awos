# AI-readiness-audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `ai-readiness-audit` plugin correct at the prompt layer, tool-agnostic across agentic coding tools, uniform across programming languages, clearer in its report, and cheaper to run — delivered as four staged commits (A–D) on `feat/ai-sdlc-metrics`.

**Architecture:** The audit engine is TypeScript bundled by esbuild to a committed `dist/cli.js`. Two new registry modules (`languages.ts`, `agent_tools.ts`) centralize per-language and per-tool conventions; detectors iterate the registries instead of hardcoding JS/Claude. The renderer is deterministic — new report content is threaded into `audit.json` first. Each engine-touching phase ends with rebuild + tests + committed `dist/`.

**Tech Stack:** TypeScript, esbuild, `tsx`, Node `node:test`, smol-toml, web-tree-sitter. GitHub Actions for CI. Markdown prompt/reference files.

## Global Constraints

- Engine source lives under `plugins/awos/skills/ai-readiness-audit/`. After editing any `.ts`, run `npm run build:engine` then `npm run test:engine`, and commit the regenerated `dist/`. CI runs `git diff --exit-code` on `dist/` — a stale bundle fails the build.
- Use the real Node toolchain, not the Bun shim: prefix Node/npm commands with the real binary dir, e.g. `PATH="/opt/homebrew/bin:$PATH" npm run test:engine`. The engine tests rely on `node:test`, which the Bun `node` shim does not implement.
- Never run the AWOS installer in this repo.
- Prettier is CI-enforced: single quotes, semicolons, 80-col for code, 2-space, LF, `es5` trailing commas. Run `PATH="/opt/homebrew/bin:$PATH" npx prettier --write .` on changed files before each commit.
- Markdown prose is NOT hard-wrapped at 80 columns (except YAML frontmatter). One logical line per paragraph/bullet.
- Scoring is additive/weighted and uncapped. Broadening a detector moves scores; update the affected engine tests in the same phase and report fixture score deltas in the commit body.
- `disable-model-invocation: true` stays in SKILL.md (command-only audit).
- Supported agentic tools = exactly Claude + Cursor, GitHub Copilot, Codex, Gemini, Kiro, Windsurf, Cline.
- Dimension `.md` files and `standards.toml` category records must stay in sync with detector code: if a detector/category is removed, remove its `standards.toml` record and the dimension `.md` check; if added, add both.

---

## Phase A — Prompt/frontmatter, CI, docs (one commit, no engine rebuild)

**Deliverable:** Correct SKILL.md frontmatter, stable cross-references, bumped CI actions, pruned `docs/design/`. Verified by `prettier --check`, the prompt linter, and a YAML-frontmatter sanity read.

### Task A1: SKILL.md frontmatter + cross-reference

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/SKILL.md` (frontmatter lines 1–11; body line ~26)

**Interfaces:**

- Produces: corrected frontmatter consumed by the plugin host; no code depends on it.

- [ ] **Step 1: Rewrite the frontmatter description and argument-hint.** Replace the current frontmatter block (lines 1–11) with:

```yaml
---
name: ai-readiness-audit
description: >-
  Command-invoked AI-SDLC readiness audit. Runs the deterministic scoring
  engine across all dimensions in one pass and compiles a report. Invoked by
  the /awos:ai-readiness-audit command; not auto-triggered. Dimensions are
  discovered automatically from dimensions/ — drop a new .md to extend.
disable-model-invocation: true
argument-hint: '[dimension] — omit for a full audit'
---
```

- [ ] **Step 2: Fix the fragile cross-reference in the body.** In SKILL.md, find the Step 0 bullet referencing topology (currently: `... workspace configs (`pnpm-workspace.yaml`, `turbo.json`, etc.; see project-topology TOPO-01).`). Replace `see project-topology TOPO-01` with ``see `dimensions/project-topology.md` → TOPO-01``. Search the whole file for any other occurrence of `project-topology TOPO` and apply the same replacement.

- [ ] **Step 3: Verify prompt linter still passes.**

Run: `PATH="/opt/homebrew/bin:$PATH" npm run test:lint`
Expected: PASS (no frontmatter/marker/cross-reference errors).

### Task A2: data-sources.md cross-ref + linked-repo documentation

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/references/data-sources.md` (line ~21; "Default behavior" section)

- [ ] **Step 1: Fix the cross-reference.** Replace `see project-topology TOPO-01` (line ~21) with ``see `dimensions/project-topology.md` → TOPO-01``.

- [ ] **Step 2: Make the reference self-contained.** Under the "Default behavior" section, immediately after the three-method list, add a subsection that documents the detection rather than only pointing elsewhere:

```markdown
### Monorepo & linked-repo detection (TOPO-01)

The monorepo flag (`dimensions/project-topology.md` → TOPO-01) is set when a workspace manifest is present at the repo root — any of `pnpm-workspace.yaml`, `package.json` with a `workspaces` field, `turbo.json`, `nx.json`, `lerna.json`, `pants.toml`, `WORKSPACE`/`MODULE.bazel`, or a Cargo/Go workspace declaration. When set, packages/apps declared by that manifest are treated as additional build roots for the audit. Git submodules (`.gitmodules`) and in-repo symlinks pointing outside the repo root are linked in the same way. This flag gates the `applies_when` of the end-to-end-delivery checks.
```

- [ ] **Step 3: Verify.**

Run: `PATH="/opt/homebrew/bin:$PATH" npx prettier --check plugins/awos/skills/ai-readiness-audit/references/data-sources.md plugins/awos/skills/ai-readiness-audit/SKILL.md`
Expected: PASS (or run `--write` then re-check).

### Task A3: CI action version bumps

**Files:**

- Modify: `.github/workflows/quality-check.yml` (every `uses:` line)

- [ ] **Step 1: Confirm the current latest major for each action.**

Run: `gh api repos/actions/checkout/releases/latest --jq .tag_name; gh api repos/actions/setup-node/releases/latest --jq .tag_name`
Expected: a tag like `v7.x.y` for checkout and `v6.x.y` for setup-node. Use the actual latest major returned (pin to the major: `@v7`, `@v6`). If the returned major differs from v7/v6, use the returned major and note it in the commit body.

- [ ] **Step 2: Apply the bumps.** In `.github/workflows/quality-check.yml`, replace every `uses: actions/checkout@v4` with `uses: actions/checkout@v7` and every `uses: actions/setup-node@v4` with `uses: actions/setup-node@v6` (or the majors confirmed in Step 1). There are 5 jobs (`prettier`, `test`, `coverage-report`, `node-engine`, `coverage-gate`), each with both actions.

- [ ] **Step 3: Verify no v4 remains.**

Run: `grep -nE 'actions/(checkout|setup-node)@v4' .github/workflows/quality-check.yml || echo "clean"`
Expected: `clean`.

### Task A4: docs/design pruning + CLAUDE.md dangling reference

**Files:**

- Delete: `docs/design/2026-06-25-audit-headless-and-coverage-plan.md`
- Delete: `docs/design/2026-06-25-report-redesign-design.md`
- Keep: `docs/design/ai-sdlc-measurement-and-scoring-plan.md`, `docs/design/ai-sdlc-exec-deliverable.md`, and the two new spec/plan docs.
- Modify: `CLAUDE.md` (the "Known gap" paragraph in the Measurement-engine section that cites the deleted headless/coverage plan)

- [ ] **Step 1: Delete the two dated planning docs.**

Run: `git rm docs/design/2026-06-25-audit-headless-and-coverage-plan.md docs/design/2026-06-25-report-redesign-design.md`

- [ ] **Step 2: Fix the dangling reference in CLAUDE.md.** Find the sentence in CLAUDE.md referencing `docs/design/2026-06-25-audit-headless-and-coverage-plan.md`. Remove the citation and keep the still-true guidance inline. Replace the clause `— see `docs/design/2026-06-25-audit-headless-and-coverage-plan.md`;` with `;` so the surrounding sentence still reads correctly.

- [ ] **Step 3: Confirm no other references to the deleted files.**

Run: `grep -rn "2026-06-25-audit-headless-and-coverage-plan\|2026-06-25-report-redesign-design" --include=*.md . || echo "clean"`
Expected: `clean`.

### Task A5: Commit Phase A

- [ ] **Step 1: Format, stage, commit.**

```bash
PATH="/opt/homebrew/bin:$PATH" npx prettier --write .github/workflows/quality-check.yml plugins/awos/skills/ai-readiness-audit/SKILL.md plugins/awos/skills/ai-readiness-audit/references/data-sources.md CLAUDE.md
git add -A
git commit -m "chore(audit): fix SKILL frontmatter, stable cross-refs, bump CI actions, prune design docs"
```

---

## Phase B — De-Claude-ify: agentic-tool registry + reference refresh (one commit, engine rebuild)

**Deliverable:** A new `agent_tools.ts` registry; collectors/detectors recognize all eight tools; references refreshed and de-Jellyfished. Verified by new + updated engine tests and the dist diff gate.

### Task B1: Create the agentic-tool registry

**Files:**

- Create: `plugins/awos/skills/ai-readiness-audit/agent_tools.ts`
- Test: `plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts`

**Interfaces:**

- Produces:
  - `interface AgentToolDef { id: string; displayName: string; instructionFiles: string[]; ruleOrCommandDirs: string[]; skillDirs: string[]; mcpConfigPaths: string[]; hookPaths: string[]; configDirs: string[]; commitAttribution: RegExp[]; }`
  - `export const AGENT_TOOLS: AgentToolDef[]`
  - `export const ALL_INSTRUCTION_FILES: string[]`
  - `export const ALL_RULE_COMMAND_DIRS: string[]`
  - `export const ALL_SKILL_DIRS: string[]`
  - `export const ALL_MCP_CONFIG_PATHS: string[]`
  - `export const ALL_HOOK_PATHS: string[]`
  - `export const ALL_TOOL_CONFIG_DIRS: string[]`
  - `export const ALL_COMMIT_ATTRIBUTION: RegExp[]`
  - `export function detectAgentTools(repoPath: string): AgentToolDef[]`

- [ ] **Step 1: Write the failing test.**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_TOOLS,
  ALL_INSTRUCTION_FILES,
  ALL_MCP_CONFIG_PATHS,
  detectAgentTools,
} from './agent_tools.ts';

test('registry covers exactly the eight supported tools', () => {
  const ids = AGENT_TOOLS.map((t) => t.id).sort();
  assert.deepEqual(ids, [
    'claude',
    'cline',
    'codex',
    'copilot',
    'cursor',
    'gemini',
    'kiro',
    'windsurf',
  ]);
});

test('union helpers include each tool primary instruction file', () => {
  assert.ok(ALL_INSTRUCTION_FILES.includes('CLAUDE.md'));
  assert.ok(ALL_INSTRUCTION_FILES.includes('GEMINI.md'));
  assert.ok(ALL_INSTRUCTION_FILES.includes('AGENTS.md'));
  assert.ok(ALL_MCP_CONFIG_PATHS.includes('.mcp.json'));
});

test('detectAgentTools finds present tools by any attribute', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agt-'));
  writeFileSync(join(dir, 'GEMINI.md'), '# gemini');
  mkdirSync(join(dir, '.windsurf'), { recursive: true });
  const found = detectAgentTools(dir)
    .map((t) => t.id)
    .sort();
  assert.deepEqual(found, ['gemini', 'windsurf']);
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts`
Expected: FAIL (cannot find module `./agent_tools.ts`).

- [ ] **Step 3: Implement the registry.**

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface AgentToolDef {
  id: string;
  displayName: string;
  instructionFiles: string[];
  ruleOrCommandDirs: string[];
  skillDirs: string[];
  mcpConfigPaths: string[];
  hookPaths: string[];
  configDirs: string[];
  commitAttribution: RegExp[];
}

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    instructionFiles: ['CLAUDE.md'],
    ruleOrCommandDirs: ['.claude/commands'],
    skillDirs: ['.claude/skills'],
    mcpConfigPaths: ['.mcp.json', '.claude/mcp.json'],
    hookPaths: ['.claude/hooks'],
    configDirs: ['.claude'],
    commitAttribution: [/Co-authored-by:.*Claude/i, /claude@anthropic/i],
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    instructionFiles: ['.cursorrules'],
    ruleOrCommandDirs: ['.cursor/rules', '.cursor/commands'],
    skillDirs: [],
    mcpConfigPaths: ['.cursor/mcp.json'],
    hookPaths: [],
    configDirs: ['.cursor'],
    commitAttribution: [/Co-authored-by:.*Cursor/i],
  },
  {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    instructionFiles: ['.github/copilot-instructions.md'],
    ruleOrCommandDirs: ['.github/prompts', '.github/instructions'],
    skillDirs: [],
    mcpConfigPaths: [],
    hookPaths: [],
    configDirs: [],
    commitAttribution: [/Co-authored-by:.*Copilot/i, /copilot.*\[bot\]/i],
  },
  {
    id: 'codex',
    displayName: 'OpenAI Codex',
    instructionFiles: ['AGENTS.md'],
    ruleOrCommandDirs: ['.codex/prompts'],
    skillDirs: [],
    mcpConfigPaths: ['.codex/config.toml'],
    hookPaths: [],
    configDirs: ['.codex'],
    commitAttribution: [/Co-authored-by:.*Codex/i],
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    instructionFiles: ['GEMINI.md'],
    ruleOrCommandDirs: ['.gemini/commands'],
    skillDirs: [],
    mcpConfigPaths: ['.gemini/settings.json'],
    hookPaths: [],
    configDirs: ['.gemini'],
    commitAttribution: [/Co-authored-by:.*Gemini/i],
  },
  {
    id: 'kiro',
    displayName: 'Kiro',
    instructionFiles: [],
    ruleOrCommandDirs: ['.kiro/steering', '.kiro/specs'],
    skillDirs: [],
    mcpConfigPaths: ['.kiro/settings/mcp.json'],
    hookPaths: ['.kiro/hooks'],
    configDirs: ['.kiro'],
    commitAttribution: [/Co-authored-by:.*Kiro/i],
  },
  {
    id: 'windsurf',
    displayName: 'Windsurf',
    instructionFiles: ['.windsurfrules'],
    ruleOrCommandDirs: ['.windsurf/rules', '.windsurf/workflows'],
    skillDirs: [],
    mcpConfigPaths: ['.windsurf/mcp_config.json'],
    hookPaths: [],
    configDirs: ['.windsurf'],
    commitAttribution: [/Co-authored-by:.*(Windsurf|Cascade)/i],
  },
  {
    id: 'cline',
    displayName: 'Cline',
    instructionFiles: ['.clinerules'],
    ruleOrCommandDirs: ['.clinerules'],
    skillDirs: [],
    mcpConfigPaths: ['.cline/mcp.json'],
    hookPaths: [],
    configDirs: ['.cline'],
    commitAttribution: [/Co-authored-by:.*Cline/i],
  },
];

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export const ALL_INSTRUCTION_FILES = uniq(
  AGENT_TOOLS.flatMap((t) => t.instructionFiles)
);
export const ALL_RULE_COMMAND_DIRS = uniq(
  AGENT_TOOLS.flatMap((t) => t.ruleOrCommandDirs)
);
export const ALL_SKILL_DIRS = uniq(AGENT_TOOLS.flatMap((t) => t.skillDirs));
export const ALL_MCP_CONFIG_PATHS = uniq(
  AGENT_TOOLS.flatMap((t) => t.mcpConfigPaths)
);
export const ALL_HOOK_PATHS = uniq(AGENT_TOOLS.flatMap((t) => t.hookPaths));
export const ALL_TOOL_CONFIG_DIRS = uniq(
  AGENT_TOOLS.flatMap((t) => t.configDirs)
);
export const ALL_COMMIT_ATTRIBUTION = AGENT_TOOLS.flatMap(
  (t) => t.commitAttribution
);

export function detectAgentTools(repoPath: string): AgentToolDef[] {
  return AGENT_TOOLS.filter((t) => {
    const paths = [
      ...t.instructionFiles,
      ...t.ruleOrCommandDirs,
      ...t.skillDirs,
      ...t.mcpConfigPaths,
      ...t.hookPaths,
      ...t.configDirs,
    ];
    return paths.some((p) => existsSync(join(repoPath, p)));
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/agent_tools.test.ts`
Expected: PASS (3 tests).

### Task B2: git collector consumes the registry

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/collectors/git.ts` (`getAiMarkedCommits` ~48–71; `TOOLING_CANDIDATES` ~74–81)
- Test: `plugins/awos/skills/ai-readiness-audit/collectors/git.test.ts` (add cases; create if absent)

**Interfaces:**

- Consumes: `ALL_COMMIT_ATTRIBUTION`, `ALL_TOOL_CONFIG_DIRS`, `ALL_INSTRUCTION_FILES` from `../agent_tools.ts`.

- [ ] **Step 1: Add/extend the failing test.** In a git temp repo helper (mirror existing git.test.ts setup if present; otherwise create commits with `execFileSync('git', ...)`), assert that a commit trailer `Co-authored-by: Cursor <cursor@cursor.com>` and a `GEMINI.md` file are detected:

```ts
test('git collector counts non-Claude AI commits and tooling', () => {
  // arrange: temp git repo with a Cursor-attributed commit + GEMINI.md committed
  // ...existing helpers to init repo and commit...
  const raw = collect(repoPath, period).raw as GitRaw;
  assert.ok(raw.ai_marked_commits >= 1, 'Cursor-attributed commit counted');
  assert.ok(
    raw.tooling_paths.includes('GEMINI.md'),
    'GEMINI.md surfaced as tooling'
  );
});
```

- [ ] **Step 2: Run to confirm it fails.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/collectors/git.test.ts`
Expected: FAIL (Cursor commit not counted / GEMINI.md not in tooling_paths).

- [ ] **Step 3: Replace the Claude-only patterns with the registry.** At the top of git.ts add `import { ALL_COMMIT_ATTRIBUTION, ALL_TOOL_CONFIG_DIRS, ALL_INSTRUCTION_FILES } from '../agent_tools.ts';`. Rewrite `getAiMarkedCommits` to iterate `ALL_COMMIT_ATTRIBUTION` (convert each RegExp to a `--grep` source string via `pat.source`, keep `--regexp-ignore-case` and the dedupe-by-SHA Set). Replace the `TOOLING_CANDIDATES` constant body with `const TOOLING_CANDIDATES = [...ALL_INSTRUCTION_FILES, ...ALL_TOOL_CONFIG_DIRS];`.

- [ ] **Step 4: Run to confirm it passes.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/collectors/git.test.ts`
Expected: PASS.

### Task B3: ai_development_tooling detectors consume the registry

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.ts` (`detectCustomCommands`, `detectClaudeSkills`, `detectMcpConfig`, `detectClaudeHooks`; `MCP_CONFIG_PATHS`)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.test.ts`

**Interfaces:**

- Consumes: `ALL_RULE_COMMAND_DIRS`, `ALL_SKILL_DIRS`, `ALL_MCP_CONFIG_PATHS`, `ALL_HOOK_PATHS` from `../agent_tools.ts`.

- [ ] **Step 1: Add failing tests** asserting a Cursor commands dir (`.cursor/commands/x.md`), a Windsurf rules dir, and a `.cursor/mcp.json` are each detected as PASS by the respective functions:

```ts
test('detectCustomCommands passes for Cursor commands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tool-'));
  mkdirSync(join(dir, '.cursor/commands'), { recursive: true });
  writeFileSync(join(dir, '.cursor/commands/build.md'), '# build');
  assert.equal(detectCustomCommands(dir).status, 'PASS');
});

test('detectMcpConfig passes for non-Claude MCP config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tool-'));
  mkdirSync(join(dir, '.cursor'), { recursive: true });
  writeFileSync(join(dir, '.cursor/mcp.json'), '{}');
  assert.equal(detectMcpConfig(dir).status, 'PASS');
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Add the registry import. In `detectCustomCommands`, iterate `ALL_RULE_COMMAND_DIRS` (collect `*.md` files across all that exist; PASS if any). In `detectClaudeSkills`, iterate `ALL_SKILL_DIRS` (keep the symlink-resolution logic, applied per skill dir). In `detectMcpConfig`, replace `MCP_CONFIG_PATHS` with `ALL_MCP_CONFIG_PATHS`. In `detectClaudeHooks`, iterate `ALL_HOOK_PATHS` for hook files and also check each tool's settings file for a `"hooks"` key. Evidence strings should name the matched path (which implies the tool) rather than saying "Claude".

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.test.ts`
Expected: PASS.

### Task B4: prompt_agent_integrity + security detectors consume the registry

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity.ts` (`listAgentFiles`, `AGENT_FILE_GLOBS`, `detectNoSecurityBypass` dirs)
- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/security.ts` (`detectAgentSafetyHooks`)
- Test: existing `*.test.ts` for these detectors (extend) or create alongside.

**Interfaces:**

- Consumes: `ALL_INSTRUCTION_FILES`, `ALL_RULE_COMMAND_DIRS`, `ALL_SKILL_DIRS`, `ALL_HOOK_PATHS`, `ALL_TOOL_CONFIG_DIRS`.

- [ ] **Step 1: Add a failing test** asserting `listAgentFiles` (via `detectInvisibleUnicode`/`detectAgentFilesTracked`) picks up `GEMINI.md` and `.windsurf/rules/r.md`, and that `detectAgentSafetyHooks` checks `.kiro/hooks`. Example:

```ts
test('prompt-integrity scans non-Claude agent files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pai-'));
  writeFileSync(join(dir, 'GEMINI.md'), '# gemini instructions');
  const res = detectInvisibleUnicode(dir);
  assert.notEqual(res.status, 'SKIP'); // agent files were found
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity.test.ts`
Expected: FAIL (GEMINI.md not scanned → SKIP).

- [ ] **Step 3: Implement.** In prompt_agent_integrity.ts: rewrite `listAgentFiles` to scan `ALL_INSTRUCTION_FILES` at root plus every dir in `ALL_TOOL_CONFIG_DIRS` (using `AGENT_FILE_GLOBS` for the file types within those dirs). In `detectNoSecurityBypass`, replace the hardcoded `.claude/commands`/`.claude/skills` with `ALL_RULE_COMMAND_DIRS` + `ALL_SKILL_DIRS`. In security.ts `detectAgentSafetyHooks`, iterate `ALL_HOOK_PATHS` (and per-tool settings hooks) instead of `.claude/hooks` only.

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test "plugins/awos/skills/ai-readiness-audit/detectors/prompt_agent_integrity.test.ts" "plugins/awos/skills/ai-readiness-audit/detectors/security.test.ts"`
Expected: PASS.

### Task B5: De-Claude-ify references + drop Jellyfish + refresh metric years

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml`
- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.md`
- Modify: `plugins/awos/skills/ai-readiness-audit/references/data-sources.md`
- Modify: `plugins/awos/skills/ai-readiness-audit/references/ai-sdlc-metrics-catalog.md`

- [ ] **Step 1: Find Claude-specific and Jellyfish text.**

Run: `grep -rniE "jellyfish|for claude|claude code skill|\.claude/|CLAUDE\.md|\b20(23|24)\b" plugins/awos/skills/ai-readiness-audit/references/`
Expected: a list of lines to revise.

- [ ] **Step 2: Rewrite tool-agnostic.** In `standards.toml`, change category `definition`/`evidence_required`/`source` text that names Claude specifically to tool-agnostic phrasing ("AI coding agent" / "agentic coding tool"), and where an example path is given, give the cross-tool set (e.g. `CLAUDE.md / AGENTS.md / GEMINI.md / .cursorrules / .github/copilot-instructions.md`). Do not change numeric `code`/`weight` values in this phase. Apply the same de-Claude-ification to `standards.md` and `data-sources.md`, and ensure `data-sources.md` lists all seven tools.

- [ ] **Step 3: Update metric years and remove Jellyfish.** In `ai-sdlc-metrics-catalog.md`, replace 2023/2024-dated metric references with their 2025/2026 equivalents (DORA, DX Core 4, SPACE — cite the latest published year), and delete every Jellyfish mention and any Jellyfish-derived metric row, substituting a vendor-neutral or DORA/DX-Core-4 source.

- [ ] **Step 4: Confirm Jellyfish is gone repo-wide.**

Run: `grep -rni "jellyfish" . --exclude-dir=.git || echo "clean"`
Expected: `clean`.

### Task B6: Rebuild, full engine test, commit Phase B

- [ ] **Step 1: Rebuild the bundle.**

Run: `PATH="/opt/homebrew/bin:$PATH" npm run build:engine`
Expected: writes `dist/cli.js` + grammars, exit 0.

- [ ] **Step 2: Run the full engine test layer.**

Run: `PATH="/opt/homebrew/bin:$PATH" npm run test:engine`
Expected: PASS (all engine tests, including the new agent_tools tests).

- [ ] **Step 3: Format + commit (include regenerated dist).**

```bash
PATH="/opt/homebrew/bin:$PATH" npx prettier --write plugins/awos/skills/ai-readiness-audit
git add -A
git commit -m "feat(audit): recognize all agentic tools via agent-tools registry; de-Jellyfish + refresh references"
```

---

## Phase C — Language registry + coverage breadth (one commit, engine rebuild)

**Deliverable:** A `languages.ts` registry consumed by the detectors; broadened CI/spec/test/coverage/monorepo coverage; E2E-02 removed and E2E-01 gated. Verified by updated engine tests; fixture score deltas reported.

### Task C1: Create the language registry

**Files:**

- Create: `plugins/awos/skills/ai-readiness-audit/languages.ts`
- Test: `plugins/awos/skills/ai-readiness-audit/languages.test.ts`

**Interfaces:**

- Produces:
  - `interface LanguageDef { id: string; displayName: string; sourceGlobs: string[]; testFileGlobs: string[]; testDirNames: string[]; depFiles: string[]; importRx?: RegExp; }`
  - `export const LANGUAGES: LanguageDef[]`
  - `export const ALL_SOURCE_GLOBS: string[]`
  - `export const ALL_TEST_GLOBS: string[]`
  - `export const ALL_TEST_DIRS: string[]`
  - `export const ALL_DEP_FILES: string[]`
  - `export function detectLanguages(repoPath: string): LanguageDef[]`

- [ ] **Step 1: Write the failing test.**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, ALL_SOURCE_GLOBS, ALL_DEP_FILES } from './languages.ts';

test('registry covers the grammar languages plus glob-only ones', () => {
  const ids = new Set(LANGUAGES.map((l) => l.id));
  for (const id of [
    'javascript',
    'typescript',
    'python',
    'go',
    'java',
    'kotlin',
    'ruby',
    'php',
    'c',
    'cpp',
    'csharp',
    'rust',
    'swift',
    'scala',
    'dart',
  ]) {
    assert.ok(ids.has(id), `missing language ${id}`);
  }
});

test('union helpers aggregate per-language attributes', () => {
  assert.ok(ALL_SOURCE_GLOBS.includes('*.kt'));
  assert.ok(ALL_SOURCE_GLOBS.includes('*.py'));
  assert.ok(ALL_DEP_FILES.includes('pyproject.toml'));
  assert.ok(ALL_DEP_FILES.includes('go.mod'));
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/languages.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the registry.** Create `languages.ts` with one `LanguageDef` per language. Concrete entries (abbreviated — fill each field as shown for the first, follow the pattern for the rest):

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface LanguageDef {
  id: string;
  displayName: string;
  sourceGlobs: string[];
  testFileGlobs: string[];
  testDirNames: string[];
  depFiles: string[];
  importRx?: RegExp;
}

export const LANGUAGES: LanguageDef[] = [
  {
    id: 'javascript',
    displayName: 'JavaScript',
    sourceGlobs: ['*.js', '*.jsx', '*.mjs', '*.cjs'],
    testFileGlobs: ['*.test.js', '*.test.jsx', '*.spec.js', '*.spec.jsx'],
    testDirNames: ['__tests__', 'test', 'tests'],
    depFiles: ['package.json'],
    importRx:
      /(?:import\s.*from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/,
  },
  {
    id: 'typescript',
    displayName: 'TypeScript',
    sourceGlobs: ['*.ts', '*.tsx'],
    testFileGlobs: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'],
    testDirNames: ['__tests__', 'test', 'tests'],
    depFiles: ['package.json', 'tsconfig.json'],
    importRx: /import\s.*from\s+['"]([^'"]+)['"]/,
  },
  {
    id: 'python',
    displayName: 'Python',
    sourceGlobs: ['*.py'],
    testFileGlobs: ['test_*.py', '*_test.py'],
    testDirNames: ['tests', 'test'],
    depFiles: [
      'requirements.txt',
      'pyproject.toml',
      'Pipfile',
      'poetry.lock',
      'setup.cfg',
      'setup.py',
    ],
    importRx: /(?:from\s+(\S+)\s+import|import\s+(\S+))/,
  },
  {
    id: 'go',
    displayName: 'Go',
    sourceGlobs: ['*.go'],
    testFileGlobs: ['*_test.go'],
    testDirNames: ['test', 'tests'],
    depFiles: ['go.mod', 'go.sum'],
    importRx: /import\s+(?:\(\s*)?["]([^"]+)["]/,
  },
  {
    id: 'java',
    displayName: 'Java',
    sourceGlobs: ['*.java'],
    testFileGlobs: ['*Test.java', 'Test*.java', '*Tests.java'],
    testDirNames: ['test', 'tests'],
    depFiles: [
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
    ],
    importRx: /import\s+([\w.]+);/,
  },
  {
    id: 'kotlin',
    displayName: 'Kotlin',
    sourceGlobs: ['*.kt', '*.kts'],
    testFileGlobs: ['*Test.kt', '*Spec.kt', '*Tests.kt'],
    testDirNames: ['test', 'tests'],
    depFiles: [
      'build.gradle.kts',
      'build.gradle',
      'pom.xml',
      'settings.gradle.kts',
    ],
    importRx: /import\s+([\w.]+)/,
  },
  {
    id: 'ruby',
    displayName: 'Ruby',
    sourceGlobs: ['*.rb'],
    testFileGlobs: ['*_spec.rb', '*_test.rb'],
    testDirNames: ['spec', 'test'],
    depFiles: ['Gemfile', 'Gemfile.lock', '*.gemspec'],
    importRx: /require(?:_relative)?\s+['"]([^'"]+)['"]/,
  },
  {
    id: 'php',
    displayName: 'PHP',
    sourceGlobs: ['*.php'],
    testFileGlobs: ['*Test.php'],
    testDirNames: ['tests', 'test'],
    depFiles: ['composer.json', 'composer.lock'],
    importRx: /(?:use|require|include)\s+([\w\\]+)/,
  },
  {
    id: 'c',
    displayName: 'C',
    sourceGlobs: ['*.c', '*.h'],
    testFileGlobs: ['*_test.c', 'test_*.c'],
    testDirNames: ['test', 'tests'],
    depFiles: ['Makefile', 'CMakeLists.txt', 'conanfile.txt'],
    importRx: /#include\s+["<]([^">]+)[">]/,
  },
  {
    id: 'cpp',
    displayName: 'C++',
    sourceGlobs: ['*.cpp', '*.cc', '*.cxx', '*.hpp', '*.hh'],
    testFileGlobs: ['*_test.cpp', '*_test.cc', 'test_*.cpp'],
    testDirNames: ['test', 'tests'],
    depFiles: ['CMakeLists.txt', 'conanfile.txt', 'vcpkg.json', 'Makefile'],
    importRx: /#include\s+["<]([^">]+)[">]/,
  },
  {
    id: 'csharp',
    displayName: 'C#',
    sourceGlobs: ['*.cs'],
    testFileGlobs: ['*Test.cs', '*Tests.cs'],
    testDirNames: ['test', 'tests'],
    depFiles: [
      '*.csproj',
      '*.sln',
      'packages.config',
      'Directory.Packages.props',
    ],
    importRx: /using\s+([\w.]+);/,
  },
  {
    id: 'rust',
    displayName: 'Rust',
    sourceGlobs: ['*.rs'],
    testFileGlobs: ['*_test.rs'],
    testDirNames: ['tests'],
    depFiles: ['Cargo.toml', 'Cargo.lock'],
    importRx: /use\s+([\w:]+)/,
  },
  {
    id: 'swift',
    displayName: 'Swift',
    sourceGlobs: ['*.swift'],
    testFileGlobs: ['*Tests.swift', '*Test.swift'],
    testDirNames: ['Tests', 'tests'],
    depFiles: ['Package.swift', '*.xcodeproj', 'Podfile'],
    importRx: /import\s+(\w+)/,
  },
  {
    id: 'scala',
    displayName: 'Scala',
    sourceGlobs: ['*.scala', '*.sc'],
    testFileGlobs: ['*Spec.scala', '*Test.scala'],
    testDirNames: ['test', 'tests'],
    depFiles: ['build.sbt', 'build.sc'],
    importRx: /import\s+([\w.]+)/,
  },
  {
    id: 'dart',
    displayName: 'Dart',
    sourceGlobs: ['*.dart'],
    testFileGlobs: ['*_test.dart'],
    testDirNames: ['test', 'tests'],
    depFiles: ['pubspec.yaml', 'pubspec.lock'],
    importRx: /import\s+['"]([^'"]+)['"]/,
  },
];

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export const ALL_SOURCE_GLOBS = uniq(LANGUAGES.flatMap((l) => l.sourceGlobs));
export const ALL_TEST_GLOBS = uniq(LANGUAGES.flatMap((l) => l.testFileGlobs));
export const ALL_TEST_DIRS = uniq(LANGUAGES.flatMap((l) => l.testDirNames));
export const ALL_DEP_FILES = uniq(LANGUAGES.flatMap((l) => l.depFiles));

export function detectLanguages(repoPath: string): LanguageDef[] {
  return LANGUAGES.filter((l) =>
    l.depFiles.some((f) => !f.includes('*') && existsSync(join(repoPath, f)))
  );
}
```

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/languages.test.ts`
Expected: PASS.

### Task C2: ci_platforms — add Concourse + Woodpecker

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/ci_platforms.ts` (`CI_DIRS`, `CI_FILES`)
- Test: `plugins/awos/skills/ai-readiness-audit/ci_platforms.test.ts` (extend or create)

- [ ] **Step 1: Failing test.**

```ts
test('detects Woodpecker and Concourse', () => {
  const d1 = mkdtempSync(join(tmpdir(), 'ci-'));
  writeFileSync(join(d1, '.woodpecker.yml'), 'steps: {}');
  assert.equal(detectCiConfigPath(d1), '.woodpecker.yml');
  const d2 = mkdtempSync(join(tmpdir(), 'ci-'));
  mkdirSync(join(d2, '.concourse'), { recursive: true });
  assert.equal(detectCiConfigPath(d2), '.concourse');
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/ci_platforms.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Add `'.concourse'` to `CI_DIRS` and `'.woodpecker'` (dir) to `CI_DIRS`; add `'.woodpecker.yml'`, `'.woodpecker.yaml'`, `'ci/pipeline.yml'`, `'ci/pipeline.yaml'` to `CI_FILES`.

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/ci_platforms.test.ts`
Expected: PASS.

### Task C3: code_architecture consumes the registry; broaden arch docs

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.ts` (`ARCH_DOC_PATTERNS`, `SOURCE_GLOBS`, `NAMING_SOURCE_GLOBS`, `FILE_SIZE_GLOBS`, `IMPORT_RX`)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.test.ts`

**Interfaces:**

- Consumes: `ALL_SOURCE_GLOBS` from `../languages.ts`.

- [ ] **Step 1: Failing test** — assert `detectArchPattern` PASSes on `docs/architecture.rst` and `docs/ARCHITECTURE.adoc`, and that `detectFileSizes` counts a 400-line `*.kt` file:

```ts
test('arch doc detection accepts rst/adoc and docs/ location', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/architecture.adoc'), '= Arch');
  assert.equal(detectArchPattern(dir).status, 'PASS');
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Import `ALL_SOURCE_GLOBS`. Replace the local `SOURCE_GLOBS`, `NAMING_SOURCE_GLOBS`, `FILE_SIZE_GLOBS` with `ALL_SOURCE_GLOBS` (keep `.cs` etc. now covered by registry). Broaden `ARCH_DOC_PATTERNS` to `['ARCHITECTURE.*', 'architecture.*', 'docs/architecture.*', 'docs/ARCHITECTURE.*', 'design/*.md']` matching `*.md`, `*.rst`, `*.txt`, `*.adoc` (extend `detectArchPattern` to glob those extensions and the `docs/`/`design/` locations). Keep `IMPORT_RX` but note it now applies across more languages; the layer-tier heuristic remains best-effort.

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.test.ts`
Expected: PASS.

### Task C4: end_to_end_delivery — registry, gating, drop E2E-02, broaden constants

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/end_to_end_delivery.ts`
- Modify: `plugins/awos/skills/ai-readiness-audit/dimensions/end-to-end-delivery.md` (remove E2E-02 check)
- Modify: `plugins/awos/skills/ai-readiness-audit/references/standards.toml` (remove category 2301)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/end_to_end_delivery.test.ts`

**Interfaces:**

- Consumes: `ALL_SOURCE_GLOBS` from `../languages.ts`; `CI_CONFIG_CANDIDATES` from `../ci_platforms.ts`; layer-presence detection shared with `detectLayerCoverage`.
- Produces: `DETECTORS` map no longer contains key `2301`.

- [ ] **Step 1: Failing tests.**
  - `detectVerticalDelivery` returns `SKIP` for a single-layer repo (only a `src/*.py` tree, feature branch present).
  - The `DETECTORS` map has no `2301` key.

```ts
test('E2E-01 SKIPs single-layer repos', () => {
  // arrange a git repo with one layer + one feature branch
  const res = detectVerticalDelivery(repoPath);
  assert.equal(res.status, 'SKIP');
});

test('E2E-02 detector is removed', () => {
  assert.equal(DETECTORS[2301], undefined);
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/end_to_end_delivery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Delete `detectNoLayerSplit`, `BACKEND_RX`, `FRONTEND_RX`, `stripLayerSuffix`, and the `2301` entry in `DETECTORS`.
  - Extract the layer-presence logic from `detectLayerCoverage` into a shared `function detectedLayers(repoPath): { hasApi: boolean; hasUi: boolean; hasDb: boolean }` and reuse it.
  - In `detectVerticalDelivery`, after the feature-branch check, compute `detectedLayers`; if fewer than 2 layers present, return `SKIP` ('fewer than 2 architectural layers present — vertical delivery not applicable').
  - Replace local `SOURCE_GLOBS` with `ALL_SOURCE_GLOBS`.
  - `IMPL_PATH_RX`: change to `/(?:^|\/)(src|app|lib|packages?|cmd|internal|pkg)\//i` and also accept top-level source files at root (treat a spec→impl reference as satisfied if it cites any registry source extension at repo root).
  - `SPEC_REF_RX`: broaden to `/context\/spec\/\d{3}-|(?<!\/)spec\/\d{3}-|\.specify\/|openspec\/|specs?\/[\w-]+\/(spec|design|tasks)\.md/i` (AWOS, SpecKit, OpenSpec, GSD-style).
  - `TRUNK_NAMES`: add `'dev'`, `'prod'`, `'trunk'`.
  - `ROOT_TOOLING_FILES`: add `'WORKSPACE'`, `'WORKSPACE.bazel'`, `'MODULE.bazel'`, `'BUILD.bazel'`, `'nx.json'`, `'pants.toml'`, `'turbo.json'`, `'lerna.json'`, `'pnpm-workspace.yaml'`.
  - In `detectCrossLayerTooling`, iterate the full `CI_CONFIG_CANDIDATES` (dirs + files), not just `CI_DIRS`, so GitLab/Bitbucket/Jenkins file configs count. Import `CI_CONFIG_CANDIDATES`.
  - Remove the E2E-02 check block from `dimensions/end-to-end-delivery.md` and the `[[category]]` / record for code `2301` from `standards.toml`.

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/end_to_end_delivery.test.ts`
Expected: PASS.

### Task C5: quality_assurance — flat test dirs + more frameworks/coverage tools

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/quality_assurance.ts`
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/quality_assurance.test.ts`

**Interfaces:**

- Consumes: `ALL_TEST_GLOBS`, `ALL_TEST_DIRS`, `ALL_SOURCE_GLOBS` from `../languages.ts`.

- [ ] **Step 1: Failing tests** — a repo with all tests under a flat `tests/` (no `unit/` split) still PASSes `detectUnitTests`; a `pytest.ini` with `[tool:pytest]`/`--cov` or a `jacoco` config PASSes `detectCoverageConfig`; a Vitest/k6 reference PASSes integration/e2e detection.

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/quality_assurance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Replace `TEST_FILE_GLOBS` / `SOURCE_FILE_GLOBS` with `ALL_TEST_GLOBS` / `ALL_SOURCE_GLOBS`.
  - `UNIT_DIR_RX` / `E2E_DIR_RX`: when no tier-named dir exists, fall back to the registry test-file globs + content signals so a flat `tests/` (or `test/`, `spec/`) still counts as unit evidence. Concretely: keep the dir regexes but make `detectUnitTests` PASS on any registry test file regardless of dir (it already does — confirm the broadened globs flow through).
  - `INTEGRATION_CONTENT_RX` / `E2E_CONTENT_RX`: add `vitest`, `k6`, `gatling`, `rest[- ]?assured`, `karate`, `robot framework`, `wdio`, `webdriverio`, `pytest.mark.integration`, `@Tag\("integration"\)`.
  - `E2E_GLOBS`: add `playwright.config.mjs`, `cypress.config.mjs`, `wdio.conf.mjs`, `codeceptjs.conf.js`, `robot` suite dirs.
  - `COVERAGE_CONFIG_FILES` + content: add `pytest.ini`, `tox.ini`, `.simplecov`, `jacoco.xml`/`jacoco` in `pom.xml`/`build.gradle`, `tarpaulin.toml`, `lcov.info`, `.coverage`, and content patterns `pytest-cov|--cov|JaCoCo|go test .*-cover|SimpleCov|tarpaulin`.

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/quality_assurance.test.ts`
Expected: PASS.

### Task C6: application_security — broaden SQL_GLOBS

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/detectors/application_security.ts` (`SQL_GLOBS`)
- Test: `plugins/awos/skills/ai-readiness-audit/detectors/application_security.test.ts`

**Interfaces:**

- Consumes: `ALL_SOURCE_GLOBS` from `../languages.ts`.

- [ ] **Step 1: Failing test** — a string-built query inside a `*.sql` template or a `*.cs` file is detected.

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/application_security.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Set `const SQL_GLOBS = [...ALL_SOURCE_GLOBS, '*.sql', '*.sql.j2', '*.sql.erb', '*.psql', '*.tmpl'];` and keep the existing string-SQL pattern set (the registry now brings C#, Rust, etc. into scope).

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/detectors/application_security.test.ts`
Expected: PASS.

### Task C7: Rebuild, full test, report deltas, commit Phase C

- [ ] **Step 1: Rebuild + full engine tests.**

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build:engine
PATH="/opt/homebrew/bin:$PATH" npm run test:engine
```

Expected: PASS.

- [ ] **Step 2: Capture fixture score deltas.** Run `audit-core` against the repo fixtures used by the engine tests (or the repo itself) before/after is implicit in test updates; summarize the net effect of removing category 2301 and broadening detectors in the commit body (audit_total change, any dimension whose PASS/FAIL counts shifted).

- [ ] **Step 3: Format + commit.**

```bash
PATH="/opt/homebrew/bin:$PATH" npx prettier --write plugins/awos/skills/ai-readiness-audit
git add -A
git commit -m "feat(audit): language registry + multi-language/CI/spec coverage; drop name-based E2E split, gate E2E-01"
```

---

## Phase D — Report + performance (one commit, engine rebuild)

**Deliverable:** Acronym-correct titles, vertically-stacked headline band, a Connections & Sources section fed from `audit.json`, faster-model guidance, and a minified bundle. Verified by renderer tests + dist diff gate.

### Task D1: Acronym-aware title-caser

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (`labelize` ~232)
- Test: `plugins/awos/skills/ai-readiness-audit/render.test.ts` (extend or create)

- [ ] **Step 1: Failing test.**

```ts
test('labelize uppercases known acronyms', () => {
  assert.equal(labelize('ai-sdlc-adoption'), 'AI SDLC Adoption');
  assert.equal(labelize('ai-development-tooling'), 'AI Development Tooling');
  assert.equal(labelize('code-architecture'), 'Code Architecture');
});
```

If `labelize` is not exported, export it for the test.

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts`
Expected: FAIL ("Ai Sdlc Adoption" !== "AI SDLC Adoption").

- [ ] **Step 3: Implement.**

```ts
const ACRONYMS = new Set([
  'ai',
  'sdlc',
  'ci',
  'cd',
  'api',
  'ui',
  'ux',
  'db',
  'mcp',
  'e2e',
  'tls',
  'cors',
  'sql',
  'ml',
  'dora',
  'pii',
  'qa',
  'sbom',
  'csrf',
  'xss',
  'http',
  'https',
  'url',
  'cli',
  'llm',
]);

export function labelize(slug: string): string {
  return slug
    .split('-')
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');
}
```

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts`
Expected: PASS.

### Task D2: Stack the headline band vertically

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (`.exec-blocks` CSS ~691)

- [ ] **Step 1: Change the grid.** Replace `.exec-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:16px}` with `.exec-blocks{display:flex;flex-direction:column;gap:18px;margin-top:16px}`. Keep `.exec-col` styling; the columns now stack.

- [ ] **Step 2: Visual check.** Render the bundled sample/fixture audit JSON to HTML and confirm the three blocks stack with no overlap:

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx plugins/awos/skills/ai-readiness-audit/cli.ts render <fixture-audit.json> --format html > /tmp/report.html` (use a fixture under the engine tests; if none, defer to D5's full render)
Expected: HTML contains a single-column `exec-blocks`.

### Task D3: Thread collector availability into audit.json

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/audit_core.ts` (write a `sources` block)
- Modify: `plugins/awos/skills/ai-readiness-audit/cli.ts` (`aggregate` preserves/recomputes `sources`)
- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (`AuditJson` type + new section)
- Test: extend `audit_core` / render tests

**Interfaces:**

- Produces: in `audit.json`, a top-level `sources: { source: string; available: boolean; reason_if_absent: string | null; history_available_days: number | null }[]` (per repo in org mode, nested under each `per_repo` entry).
- Consumes (renderer): `audit.sources` to build the new section.

- [ ] **Step 1: Failing test** — `audit-core` output JSON contains a `sources` array including an entry for `git` with `available: true`, and (when no CI) a `ci` entry with `available: false` and a non-null `reason_if_absent`.

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/audit_core.test.ts`
Expected: FAIL (`sources` undefined).

- [ ] **Step 3: Implement.** In `audit_core.ts`, after collectors run, read each `collected/<source>.json` and assemble the `sources` array (`source`, `available`, `reason_if_absent`, `period.history_available_days`); write it into `audit.json`. In `cli.ts` `aggregate`, re-read `collected/` and rewrite `sources` (it is derived, like dimension sums; preserve report blocks). Add `sources?: SourceSummary[]` to the `AuditJson` interface in render.ts.

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/audit_core.test.ts`
Expected: PASS.

### Task D4: Render the Connections & Sources section

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/render.ts` (md + html section builders; add after `reposSection`)
- Test: `plugins/awos/skills/ai-readiness-audit/render.test.ts`

**Interfaces:**

- Consumes: `audit.sources` (from D3).

- [ ] **Step 1: Failing test** — rendering an audit with `sources` produces a "Connections & Sources" heading, lists available sources, and lists missed sources with their reason; a source with low `history_available_days` shows a "limited history" note.

```ts
test('report renders connections and missed-sources section', () => {
  const audit = {
    /* minimal AuditJson */ sources: [
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        history_available_days: 400,
      },
      {
        source: 'ci',
        available: false,
        reason_if_absent: 'no CI config or connector found',
        history_available_days: null,
      },
      {
        source: 'tracker',
        available: true,
        reason_if_absent: null,
        history_available_days: 14,
      },
    ],
  };
  const md = renderMarkdown(audit);
  assert.match(md, /Connections & Sources/);
  assert.match(md, /no CI config or connector found/);
  assert.match(md, /14 days|limited history/i);
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Add a `connectionsSection(audit)` builder for both md and html, rendered at the bottom (after Repositories & Connections). Two lists: "Connected" (sources with `available=true`, plus a "limited history (~N days)" note when `history_available_days` is below the lookback and small) and "Missed / limited" (sources with `available=false`, each showing `reason_if_absent`). Wire it into both `renderMarkdown` and the HTML overview assembly.

- [ ] **Step 4: Run to confirm pass.**

Run: `PATH="/opt/homebrew/bin:$PATH" node --import tsx --test plugins/awos/skills/ai-readiness-audit/render.test.ts`
Expected: PASS.

### Task D5: Faster-model guidance + bundle minification

**Files:**

- Modify: `plugins/awos/skills/ai-readiness-audit/SKILL.md` (Step 0 discovery; Step 6 judgment/narrative)
- Modify: `plugins/awos/skills/ai-readiness-audit/references/data-sources.md` (Phase 1 discovery dispatch)
- Modify: `scripts/build-engine.mjs` (esbuild `minify`)
- Modify: `CLAUDE.md` (note grammars are intentional; dist minified)

- [ ] **Step 1: Add model guidance.** In SKILL.md Step 0 and data-sources.md Phase 1 (the discovery subagent dispatch), add: "Dispatch this discovery work with a fast model (Haiku) — it is mechanical file/PATH probing." In SKILL.md Step 6 (judgment + narrative authoring), add: "Use a mid-tier model (Sonnet) for the judgment checks and narrative authoring — moderate reasoning, single pass." Keep it as plain guidance (no agent files exist to pin).

- [ ] **Step 2: Enable minification.** In `scripts/build-engine.mjs`, add `minify: true` to the esbuild build options object (alongside `bundle`, `platform`, `format`, `target`). Keep the CommonJS banner.

- [ ] **Step 3: Document in CLAUDE.md.** In the Measurement-engine section, add one line: "The bundle is minified; `dist/`'s bulk is the ~24.5 MB of tree-sitter grammar `.wasm` files, which are required for multi-language complexity parsing and are intentionally shipped, not stripped."

- [ ] **Step 4: Rebuild and confirm size dropped.**

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build:engine
wc -c plugins/awos/skills/ai-readiness-audit/dist/cli.js
```

Expected: cli.js noticeably smaller than 432 KB (~300 KB), exit 0.

### Task D6: Rebuild, full test, render both reports, commit Phase D

- [ ] **Step 1: Rebuild + full engine tests + prompt lint.**

```bash
PATH="/opt/homebrew/bin:$PATH" npm run build:engine
PATH="/opt/homebrew/bin:$PATH" npm run test:engine
PATH="/opt/homebrew/bin:$PATH" npm run test:lint
```

Expected: PASS.

- [ ] **Step 2: Full-suite sanity.**

Run: `PATH="/opt/homebrew/bin:$PATH" npm test`
Expected: PASS (markdown/installer layers + engine).

- [ ] **Step 3: Format + commit.**

```bash
PATH="/opt/homebrew/bin:$PATH" npx prettier --write .
git add -A
git commit -m "feat(audit): acronym titles, stacked headline band, Connections & Sources report section, faster-model guidance, minified bundle"
```

---

## Self-Review (completed)

**Spec coverage:** A1–A4 cover SKILL frontmatter/argument-hint/cross-ref, data-sources cross-ref + linked-repo doc, CI bumps, docs pruning + CLAUDE.md. B1–B5 cover the agent-tools registry, git collector, ai-dev-tooling/prompt-integrity/security detectors, references de-Claude-ify + de-Jellyfish + year refresh. C1–C6 cover the language registry, CI Concourse/Woodpecker, code_architecture + arch docs, end_to_end (drop E2E-02, gate E2E-01, broaden IMPL/SPEC/TRUNK/monorepo/CI), quality_assurance (flat dirs + frameworks + coverage), application_security SQL globs. D1–D5 cover acronym titles, headline stacking, sources threading + section, model guidance, minify. All spec sections map to a task.

**Placeholder scan:** New modules (`languages.ts`, `agent_tools.ts`, `labelize`) have complete code. Detector edits specify exact constants/values. Tests give concrete assertions. No "TBD"/"handle edge cases"/"similar to".

**Type consistency:** Registry exports (`ALL_*`, `detectLanguages`, `detectAgentTools`, `AgentToolDef`, `LanguageDef`) are referenced with the same names in consuming tasks. `sources`/`SourceSummary` shape defined in D3 and consumed verbatim in D4. `labelize` signature consistent across D1/D4.
