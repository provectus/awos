# AWOS Commands — Alignment Audit vs. Claude Code Best Practices

**Audit date:** 2026-05-18
**Audited assets:** `commands/*.md`, `claude/commands/*.md`, `templates/*.md`, `plugins/awos/agents/dimension-auditor.md`, `plugins/awos/skills/ai-readiness-audit/SKILL.md`
**Goal:** Address Oleg Shuralev's item #2 from `AWOS improvement ideas.pdf` — _"AWOS Commands need alignment with Claude Code development guidelines (best practices, prompting best practices)"_.
**Status:** Plan only. **No framework files were modified.** Each finding includes a concrete patch proposal.

---

## 1. Authoritative sources used

The "best practices" referenced in the original task are these living Anthropic docs. Each finding below cites the section it relies on so reviewers can verify.

| # | Doc | URL | What it covers |
|---|---|---|---|
| 1 | Claude Code best practices | <https://code.claude.com/docs/en/best-practices> | CLAUDE.md, verification, plan mode, context management, subagents, skills, hooks, permissions, auto mode |
| 2 | Prompting best practices (current models: Opus 4.7 / Sonnet 4.6 / Haiku 4.5) | <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices> | Clarity, XML tags, examples, tool-use, parallel calls, adaptive thinking, agentic systems, overengineering |
| 3 | Slash commands & Skills (custom commands have been merged into Skills) | <https://code.claude.com/docs/en/slash-commands> | Frontmatter schema, `$ARGUMENTS`, dynamic context, `disable-model-invocation`, `allowed-tools`, supporting files |
| 4 | Sub-agents | <https://code.claude.com/docs/en/sub-agents> | Subagent frontmatter, tools/disallowedTools, skills preloading, `Agent` tool (renamed from `Task` in v2.1.63), built-in agents (Explore, Plan, general-purpose) |
| 5 | Memory / CLAUDE.md | <https://code.claude.com/docs/en/memory> | CLAUDE.md placement, imports with `@path`, path-specific rules |
| 6 | Permission modes | <https://code.claude.com/docs/en/permission-modes> | auto / plan / acceptEdits / bypassPermissions |
| 7 | Hooks | <https://code.claude.com/docs/en/hooks-guide> | Deterministic event-driven actions |

**Important fact for this audit:** Best practices and model behavior have shifted in 2025–2026 toward _less_ scaffolding. Specifically, latest models (Opus 4.6+, Sonnet 4.6) are now described as _"more responsive to the system prompt than previous models. If your prompts were designed to reduce undertriggering on tools or skills, these models may now overtrigger. The fix is to dial back any aggressive language."_ ([source #2, "Tool usage" section](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)). Several findings below stem from this shift.

---

## 2. Cross-cutting findings (apply to most AWOS commands)

Ordered by impact. Severity: 🔴 high · 🟠 medium · 🟡 low.

### 🔴 F1. Heavy CAPS / "CRITICAL" / "STRICTLY PROHIBITED" emphasis is now an anti-pattern

**Evidence (samples):**
- `commands/spec.md:51` — `**CRITICAL - Scope Boundary:**`
- `commands/spec.md:56` — `**CRITICAL - Focus on Your Topic Only:**`
- `commands/spec.md:71` — `**Self-Check Before Every Question:**`
- `commands/tasks.md:48` — `**CRITICAL RULE: Create Runnable Tasks…**`
- `commands/implement.md:57` — `**CRITICAL RULE:** You are **strictly prohibited** from writing…`
- `commands/tech.md:67` — `**CRITICAL BEHAVIOR:**`

**Why it's a problem:** Source #2 (Prompting best practices, _"Tool usage"_ subsection) says verbatim:
> "Claude Opus 4.5 and Claude Opus 4.6 are also more responsive to the system prompt than previous models… The fix is to dial back any aggressive language. Where you might have said `CRITICAL: You MUST use this tool when…`, you can use more normal prompting like `Use this tool when…`."

Source #1, _"Write an effective CLAUDE.md"_, adds:
> "You can tune instructions by adding emphasis (e.g., 'IMPORTANT' or 'YOU MUST') to improve adherence." — but it follows with: _"If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long and the rule is getting lost."_

So emphasis is allowed sparingly — but AWOS overuses it.

**Fix:** Replace the bold-CAPS scaffolding with plain declarative sentences in roughly 80 % of cases. Reserve `IMPORTANT` / one boldface for at most one rule per file — the one most likely to be ignored.

---

### 🔴 F2. Outdated tool name: `Task` → `Agent` (renamed in Claude Code v2.1.63)

**Evidence:**
- `commands/tech.md:45,47` — "Analyze the **Task tool** definition to extract all available subagent_type values…"
- `commands/tasks.md:64,66` — same phrasing
- `commands/architecture.md:90` — same phrasing
- `commands/hire.md:64` — same phrasing
- `plugins/awos/skills/ai-readiness-audit/SKILL.md:46` — "launch all dimensions in the phase in parallel using the **Task tool**"

**Why it's a problem:** Source #4, _Note inside frontmatter table_:
> "In version 2.1.63, the Task tool was renamed to Agent. Existing `Task(...)` references in settings and agent definitions still work as aliases."

So the legacy name still functions, but new docs and onboarding material use `Agent`. AWOS users following along with current Anthropic docs will be confused.

**Fix:** Globally rename "Task tool" → "Agent tool" in prompts; keep `subagent_type` parameter name (still correct).

---

### 🔴 F3. Brittle "introspect the Agent tool to discover subagent_type values" pattern

**Evidence:**
- `commands/tech.md:45` — "Analyze the Task tool definition to extract all available subagent_type values **with their descriptions** to check that corresponding subagents exist."
- `commands/tasks.md:64`, `commands/architecture.md:90`, `commands/hire.md:64` — same.

**Why it's a problem:** Source #4 explicitly states the dispatch mechanism:
> "Claude uses each subagent's description to decide when to delegate tasks."

You don't need to read the tool definition. Subagents already advertise themselves in their `description` field, and Claude's dispatch logic matches against those. Source #2, _"Subagent orchestration"_:
> "**Let Claude orchestrate naturally:** Claude will delegate appropriately without explicit instruction."

The current AWOS pattern (a) is fragile if the tool schema changes, (b) bloats context with a meta-step, (c) duplicates work Claude already does internally.

**Fix:** Replace with: _"Delegate each sub-task to the subagent whose description best matches. Use `general-purpose` if no specialist fits, and flag those for the recommendations table."_

---

### 🔴 F4. No CLAUDE.md template ships to end-user projects

**Evidence:** This repo has a `CLAUDE.md` at root (it governs work on the AWOS source itself — good), but the installer (`src/config/setup-config.js`) does not copy any CLAUDE.md template into end-user projects. End users get `.awos/`, `.claude/commands/awos/`, and `context/` but no persistent-context file in their project root.

**Why it's a problem:** Source #1 entire section _"Write an effective CLAUDE.md"_ is about this. CLAUDE.md is the canonical place to:
- Pin code-style and workflow rules
- Document AWOS conventions (e.g., "Edit `.claude/commands/awos/*` not `.awos/commands/*`")
- Persist context across sessions

Users adopting AWOS get zero help here. They eventually run `/init`, which generates a generic CLAUDE.md that knows nothing about AWOS.

**Fix:** Ship a `CLAUDE.md` template under `templates/CLAUDE-template.md` and have the installer copy it to the user's project root **only if one doesn't already exist** (never overwrite). Add the copy operation to `src/config/setup-config.js`. Proposed content is in §4 of this report.

---

### 🔴 F5. No verification mechanism — violates the single highest-leverage best practice

**Evidence:**
- `commands/verify.md` Step 3 — _"Verify: Check if the implementation satisfies the criterion"_ — never says **how**. No `Bash`, no `npm test`, no Playwright MCP call.
- `commands/implement.md` Step 4 — _"Wait for the subagent to complete its work and report a successful outcome. **You should assume that a success signal from the subagent means the task was completed as instructed.**"_

**Why it's a problem:** Source #1, _"Give Claude a way to verify its work"_, opens with:
> "**This is the single highest-leverage thing you can do.** Claude performs dramatically better when it can verify its own work…"

And later:
> "Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

AWOS's `verify` command performs textual reasoning over acceptance criteria. That's not verification.

**Fix:**
1. In `implement.md`, change Step 4 from "assume success" to "run the project's verification command (tests/lint/typecheck) and confirm the task's stated success criteria are observable".
2. In `verify.md`, add explicit Bash test runs and Playwright MCP / curl checks per criterion type. For UI specs, screenshot before/after.
3. Add to all generated tasks a "verification" sub-task that runs concrete commands.

---

### 🟠 F6. Built-in subagents `Explore` and `Plan` are not leveraged

**Evidence:**
- `commands/tech.md` Step 2 — reads functional spec, architecture, AND analyzes codebase, all in main context.
- `commands/spec.md` Step 2 — reads product-definition + roadmap in main context.
- `commands/hire.md` Step 3 — uses Explore agent (✅ correct usage — keep this).

**Why it's a problem:** Source #4, _"Built-in subagents"_:
> "**Explore** — A fast, read-only agent optimized for searching and analyzing codebases. Model: Haiku (fast, low-latency). Tools: Read-only tools… Claude delegates to Explore when it needs to search or understand a codebase without making changes."

And source #1, _"Use subagents for investigation"_:
> "Since context is your fundamental constraint, subagents are one of the most powerful tools available. When Claude researches a codebase it reads lots of files, all of which consume your context."

`tech.md` reads the full codebase synchronously in the orchestrator's main context — this can flood it before drafting starts.

**Fix:** In `tech.md` Step 2 and `tasks.md` Step 2, delegate the codebase analysis to `Explore` (read-only, Haiku) instead of the orchestrator doing it itself. `hire.md` already does this correctly.

---

### 🟠 F7. Plan mode is not used for the exploratory phases of spec/tech/tasks

**Evidence:** None of the AWOS commands instruct the user (or themselves) to use plan mode.

**Why it's a problem:** Source #1, _"Explore first, then plan, then code"_:
> "Letting Claude jump straight to coding can produce code that solves the wrong problem. Use plan mode to separate exploration from execution."

`/awos:spec`, `/awos:tech`, `/awos:tasks` are essentially the explore-and-plan phases of a feature. They're a perfect fit.

**Fix:** Optional but valuable — have spec/tech/tasks mention they pair well with plan mode for the interview portion. Not strictly required since they don't make code changes themselves, but in `/awos:implement` strongly worth recommending plan mode for the implementing subagent.

---

### 🟠 F8. Overengineering / overeagerness mitigation missing

**Evidence:** Nothing in `implement.md` or `tasks.md` tells the implementing subagent to keep solutions minimal.

**Why it's a problem:** Source #2, _"Overeagerness"_:
> "Claude Opus 4.5 and Claude Opus 4.6 have a tendency to overengineer by creating extra files, adding unnecessary abstractions, or building in flexibility that wasn't requested."

It provides a ready-to-use prompt snippet, and a separate one (_"Reduce file creation in agentic coding"_) for cleanup of scratch files.

**Fix:** Add a small `<scope_discipline>` block to `implement.md`'s formulated subagent prompt:
> "Avoid over-engineering. Only make changes that are directly requested or clearly necessary by the spec. Don't add features, refactor unrelated code, or add validation for scenarios outside the task. If the spec is unclear, ask rather than guessing."

---

### 🟠 F9. Hallucination-prevention guidance missing in `implement.md`

**Evidence:** The implementing subagent is given context but no instruction to ground claims in files it has actually opened.

**Why it's a problem:** Source #2, _"Minimizing hallucinations in agentic coding"_, provides the snippet:
> `<investigate_before_answering>` "Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer — give grounded and hallucination-free answers." `</investigate_before_answering>`

**Fix:** Append this snippet to the subagent prompt formulated by `implement.md` Step 3.

---

### 🟠 F10. Parallel tool calls not requested in audit/implement orchestration

**Evidence:**
- `ai-readiness-audit/SKILL.md:62` — _"Within a phase, launch all Tasks in a **single message** (parallel execution)"_ — ✅ good
- `commands/tech.md` Step 2.3 — _"For features spanning multiple technologies, you may delegate to multiple experts sequentially or in parallel"_ — passive; should be opinionated
- `commands/tasks.md`, `commands/implement.md` — silent on parallelism

**Why it's a problem:** Source #2, _"Optimize parallel tool calling"_ provides a ready snippet `<use_parallel_tool_calls>` that explicitly boosts parallel-call success.

**Fix:** Where multiple independent reads or subagent calls happen, instruct: _"Issue all independent tool calls in a single message; sequence only when one's output feeds the next."_

---

### 🟠 F11. Wrapper command frontmatter is bare — no `argument-hint`, `allowed-tools`, `disable-model-invocation`, `model`

**Evidence:** Every file in `claude/commands/` uses only `description:`.

**Why it's a problem:** Source #3, _Frontmatter reference_, lists 15 fields. The most relevant for AWOS commands:
- `argument-hint` — shown in autocomplete. `/awos:spec` accepts an optional topic; `/awos:tech` accepts a spec name. Users would benefit from `argument-hint: '[topic] or blank to use next roadmap item'`.
- `disable-model-invocation: true` — per source #3: _"Use this for workflows with side effects or that you want to control timing"_. All AWOS cycle commands write files. Without this, Claude can spontaneously invoke `/awos:spec` mid-conversation if a description matches.
- `allowed-tools` — `/awos:hire` runs `npx @provectusinc/awos-recruitment …`. Adding `allowed-tools: Bash(npx *)` reduces prompts.
- `model` — not strictly needed but lets users pin a model per command.

**Fix:** Add these fields per command. See §3 per-file patches.

---

### 🟠 F12. Wrapper "AskUserQuestion" line comes BEFORE the `Refer to` pointer — inverts AWOS's own docs

**Evidence:**
```
.claude/commands/awos/spec.md (current):
---
description: Creates the Functional Spec…
---

Use `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.

Refer to the instructions located in this file: .awos/commands/spec.md
```
But `README.md:101-110` shows the documented pattern with the `Refer to` line **first**, customizations **after**:
```
Refer to the instructions located in this file: .awos/commands/implement.md

+ - Always run tests after implementing each task
+ - Follow the code style guide in docs/style-guide.md
```

**Why it's a problem:** Reading order of skill content matters (it stays in context). User customizations should follow the framework reference for clarity and predictable layering.

**Fix:** Flip the order; or better, lift `AskUserQuestion` guidance into the underlying `.awos/commands/*.md` so it isn't duplicated 9 times.

Better still — use the `@`-import: source #1 mentions file-references with `@`. Replace `Refer to the instructions located in this file: .awos/commands/spec.md` with `@.awos/commands/spec.md` — Claude reads it inline. Cleaner and faster.

---

### 🟠 F13. Verbose ceremonial output ("I will now…", "All done! 📝")

**Evidence:**
- `commands/product.md:60` — _Introduction: "Hi, I'm Poe 📝. I'll help you create…"_
- `commands/product.md:81` — _"All done! I've saved your product definition…"_
- `commands/architecture.md:46,82` — _"I see you're ready to define the system architecture…"_, _"Great! I am now saving…"_
- Most files have a "Confirm/Announce/Conclude" cadence.

**Why it's a problem:** Source #2, _"Communication style and verbosity"_:
> "**More direct and grounded:** Provides fact-based progress reports rather than self-celebratory updates. **Less verbose:** May skip detailed summaries for efficiency unless prompted otherwise."

Latest models trim this naturally. AWOS prompts force them back to a chatty 2024 cadence — fighting the default style.

**Fix:** Strip mandatory greetings and sign-offs. Keep at most one short transition ("Saved to `<path>`. Next: `/awos:roadmap`."). Persona names (Poe) are fine if you want them — just don't mandate emoji or filler sentences.

---

### 🟡 F14. Examples are inline prose, not `<example>` tags

**Evidence:** All commands use `**Example interaction:**` followed by quoted prose.

**Why it's a problem:** Source #2, _"Use examples effectively"_:
> "**Structured:** Wrap examples in `<example>` tags (multiple examples in `<examples>` tags) so Claude can distinguish them from instructions."

Source #2 also lists multi-document `<documents>`/`<document>` for long-context prompting.

**Fix:** Low priority cosmetic change. Wrap a few key examples in `<example>` tags. Don't bulk-rewrite — only worth it where examples are dense.

---

### 🟡 F15. `agent-template.md` is too thin for current subagent capabilities

**Evidence:**
```yaml
---
name: [agent-name]
description: [When Claude should delegate to this agent]
skills: []
---
```

**Why it's a problem:** Source #4 lists 14 supported frontmatter fields. Most useful additions for AWOS-generated agents:
- `tools` / `disallowedTools` — scope what each specialist can do.
- `model` — `haiku` for fast research-only agents, `sonnet`/`opus` for implementers.
- `effort` — `xhigh` for hard coding, `low` for simple writes.
- `color` — readability in transcripts.

The template also doesn't tell `/awos:hire` to consider these.

**Fix:** Expand the template, and update `hire.md` to populate them.

---

### 🟡 F16. Roles like "Poe" are inconsistent

**Evidence:** `product.md`, `roadmap.md`, `architecture.md` use _Poe_; `spec.md`, `tech.md`, `tasks.md`, `implement.md`, `verify.md`, `hire.md` don't.

**Why it's a problem:** Not an Anthropic best-practice violation — source #2 only says _"Setting a role in the system prompt focuses Claude's behavior"_. But the inconsistency is jarring.

**Fix:** Either give every command a persona or none. Recommendation: drop persona names entirely; they add tokens and friction.

---

### 🟡 F17. No use of `${CLAUDE_SKILL_DIR}` or `@`-imports for templates

**Evidence:** Commands hard-code paths like `.awos/templates/functional-spec-template.md`.

**Why it's a problem:** Source #3 documents `${CLAUDE_SKILL_DIR}` for plugin-portable references and `@path/to/file` imports in skill bodies.

**Fix:** Since AWOS uses absolute paths under `.awos/` (post-install), this is _technically_ fine. But if AWOS commands ever become true plugin skills, switch to `${CLAUDE_SKILL_DIR}`. Low priority.

---

### 🟡 F18. Description inconsistency between root command and wrapper

**Evidence:**
- `commands/hire.md` description: _"Hires specialist agents — finds, installs skills, MCPs, **and agents from registry**, generates agent files."_
- `claude/commands/hire.md` description: _"Hires specialist agents — finds, installs skills and MCPs, generates agent files."_

**Why it's a problem:** Slash-command palette shows the wrapper's description. Users see a less accurate description than the framework's own.

**Fix:** Sync the wrappers' `description` fields to the root.

---

### 🟡 F19. `dimension-auditor.md` claims read-only but has `Write`

**Evidence:** `plugins/awos/agents/dimension-auditor.md:10` lists `tools: Read, Write, Grep, Glob, Bash` while line 42 says _"Do not modify any project files — this is a read-only audit"_.

**Why it's a problem:** Mild contradiction. The agent has Write because it writes the per-dimension artifact, which is correct, but the prose makes it sound like Write is a bug.

**Fix:** Rephrase to _"Do not modify project source files; Write is restricted to the per-dimension artifact at the provided output path."_

---

## 3. Per-file diff plan

Each entry shows: file → list of proposed changes with line refs. **Nothing applied yet.**

### 3.1 `claude/commands/{architecture,hire,implement,product,roadmap,spec,tasks,tech,verify}.md` — wrappers

Apply the same shape change to every wrapper:

```diff
 ---
 description: <unchanged>
+argument-hint: '[optional topic or spec name]'   # F11 — tune per command, see table below
+disable-model-invocation: true                   # F11 — workflow with side effects
 ---

-Use `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.
-
-Refer to the instructions located in this file: .awos/commands/spec.md
+@.awos/commands/spec.md                          # F12 — @-import inlines underlying instructions
+
+# User customizations go below this line.
```

Per-command `argument-hint` recommendations:

| Wrapper | `argument-hint` |
|---|---|
| product.md | `[initial idea, optional]` |
| roadmap.md | `[change request, optional]` |
| architecture.md | `[change request, optional]` |
| hire.md | `[focus areas, optional]` |
| spec.md | `[topic, optional — defaults to next roadmap item]` |
| tech.md | `[spec name or index]` |
| tasks.md | `[spec name or index, optional]` |
| implement.md | `[spec or task, optional — defaults to next pending]` |
| verify.md | `[spec name or index, optional]` |

For `hire.md`, also add:
```diff
+allowed-tools: Bash(npx *), Read, Write, Glob, Grep
```
…since it shells out to `npx @provectusinc/awos-recruitment ...`.

Also fix F18 by syncing the wrapper description to match the root command exactly.

---

### 3.2 `commands/product.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 7, 60 | F13/F16 — persona + emoji | Strip "Poe 📝" greetings. Keep role as `expert Product Manager assistant`. |
| 51, 60, 81 | F13 — ceremonial text | Replace "Welcome back!… Let's update it." / "All done!…" with single-line status messages. |
| Frontmatter | F11 | (covered by wrapper changes — no root change needed) |
| 49–55 (Update Mode menu) | F1 — emphasis | Remove bold "**Display Menu:**" cadence; keep numbered steps but drop bold. |
| New | F10 | Add: _"When loading the template and existing definition, read both in parallel."_ |

---

### 3.3 `commands/roadmap.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 7, 48, 64, 78–80 | F13 / F16 | Drop "Poe", "I see you don't have a roadmap yet", "Done. I've saved…" Replace with terse single-line messages. |
| Step 1 prerequisite (33–35) | F1 | Tone down: _"Stop and tell the user to run `/awos:product` first."_ instead of bold-quoted scripted line. |

---

### 3.4 `commands/architecture.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 7 | F16 | Drop "Poe" |
| 46, 64, 82, 108 | F13 | Strip "I see you're ready…", "Great! I am now…", multi-sentence conclusions. |
| 90 | F2/F3 | Replace _"Analyze the Task tool definition to extract all available subagent_type values"_ with _"For each technology in the architecture, check whether a subagent with a matching description exists (the Agent tool surfaces these). Mark missing ones."_ |
| 96–104 (coverage table) | OK | Keep — useful structured output. |

---

### 3.5 `commands/hire.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 13 | Typo/encoding | The smart quote in "AI‑driven" is fine, but the trailing sentence runs on — proofread. |
| 33 (description in frontmatter) | F18 | Match wrapper. |
| 39 (Prioritize User Prompt) | F1 | Acceptable emphasis; keep one bold per file. |
| 61–66 (Explore usage) | ✅ keep | Correct usage of Explore agent — good. |
| 64 | F2/F3 | Replace _"Analyze the Task tool definition to extract all available `subagent_type` values"_ with _"Read existing agent descriptions; Claude already exposes them in the Agent tool's dispatch metadata — no introspection needed."_ |
| 78–106 | F10 | When searching MCP server, run multiple queries in parallel (one tool call per role) rather than sequentially. |
| 94, 98, 102 | F11 | Document that `Bash(npx *)` should be in wrapper's `allowed-tools`. |

---

### 3.6 `commands/spec.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 7 (role) | OK | Keep — strong role definition. |
| 10–18 (Language Rules) | OK | Strong; keep. |
| 51 | F1 | `**CRITICAL - Scope Boundary:**` → `Scope boundary: …` (no emphasis). |
| 56 | F1 | Same. |
| 71 (Self-Check Before Every Question) | F1 | Same. |
| 41–49 (Step 1) | F11 | Add `AskUserQuestion` instruction — interview-style flow per source #1 _"Let Claude interview you"_. |
| 65 (Before asking questions) | ✅ good | Keep — this matches "interview me" pattern. |
| 86 (`[NEEDS CLARIFICATION]` tags) | ✅ good | Strong pattern; keep. |
| 100 (Self-Review) | ✅ good | Keep. |

---

### 3.7 `commands/tech.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 7 (role) | OK | Keep. |
| 44 (Step 2.2 Read Documents) | F6 | Have Claude read functional spec and architecture **in parallel**. |
| 45–49 (Step 2.3–2.4) | F2/F3/F6 | Rewrite: _"Delegate codebase analysis to the Explore agent (read-only, Haiku). If the feature spans multiple stacks, spawn one Explore per stack in parallel. After Explore reports back, consult any registered specialist subagents (their descriptions appear in the Agent tool) for technology-specific recommendations."_ |
| 60 (LEVEL OF DETAIL) | ✅ good | Keep — strong scope discipline; matches F8 spirit. |
| 67–69 (Assume but Verify) | ✅ good | Keep. |
| 83 (Check for New Capabilities) | OK | Keep. |

---

### 3.8 `commands/tasks.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 7 (role) | OK | Keep. |
| 48 (CRITICAL RULE) | F1 | `**CRITICAL RULE: Create Runnable Tasks…**` → `Rule: create runnable, vertically-sliced tasks.` |
| 62–69 (subagent assignment) | F2/F3 | Replace introspection step with: _"Read existing subagent descriptions (Claude exposes them via the Agent tool dispatch metadata). Match each sub-task to the best-fitting subagent's description; fall back to `general-purpose` if none fit."_ |
| 88 (Verify with browser MCP) | ✅ good | Keep — matches F5 verification principle. |

Also add at end of Step 3:
> Each slice's verification sub-task should include the concrete command to run (e.g. `pytest tests/test_avatar.py`, `curl localhost:3000/profile`, Playwright MCP navigate). Vague "verify the slice works" is not acceptable. (F5)

---

### 3.9 `commands/implement.md`

This is the most impactful command; several findings stack here.

| Line(s) | Issue | Patch |
|---|---|---|
| 7 (role) | OK | Keep. |
| 57 (CRITICAL RULE you don't write code) | F1 | `**CRITICAL RULE:** … **strictly prohibited** …` → `You do not write or edit code. Your role is to delegate via the Agent tool.` |
| 59–69 (Formulate Subagent Prompt) | F8/F9/F10 | **Major rewrite.** The formulated subagent prompt must include: (a) full context from the three files, (b) the specific task, (c) `<scope_discipline>` snippet (F8), (d) `<investigate_before_answering>` snippet (F9), (e) explicit verification commands the subagent must run before reporting success (F5), (f) request to issue parallel tool calls for independent reads (F10). See exact text in §5. |
| 71–73 (Await and Verify Completion) | 🔴 F5 | Currently: _"You should assume that a success signal from the subagent means the task was completed."_ Replace with: _"After the subagent reports done, run the verification commands stated in the task. Only mark `[x]` if they pass. If they fail, do not mark the task; surface the failure to the user."_ |
| 89 (Announce Status) | F13 | Keep brief; the existing one-liner is fine. |

Also add a new Step 0:
> **Step 0 — Suggest plan mode:** If the user invoked `/awos:implement` without first running spec/tech, suggest they reconsider. For complex tasks, recommend the implementing subagent run in plan mode for the first read-through, then switch to default mode for edits.

---

### 3.10 `commands/verify.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 7 (role) | OK | Keep. |
| 42–48 (Step 3 Verify and Mark) | 🔴 F5 | Rewrite to invoke real verification:
> _"For each acceptance criterion: (a) if it involves a UI, navigate via Playwright MCP and check the observable behavior; (b) if it involves an API, curl/HTTP-call the endpoint and inspect the response; (c) if it's a data condition, run the matching test or SQL; (d) for properties verifiable by lint/type-check/tests, run the project's test command. Only after the criterion is observably true, mark `[x]`."_ |
| 59–73 (Step 5 Review Product Context) | ✅ good | Keep — good practice. |

---

### 3.11 `plugins/awos/agents/dimension-auditor.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 10 (tools) | OK / F19 | Keep tools list; clarify prose. |
| 42 ("read-only audit") | F19 | Change to: _"Do not modify project source files. Write is restricted to the per-dimension artifact at the provided output path."_ |
| Frontmatter | F15 | Consider adding `model: haiku` (matches Explore — fast read-only). Or `model: sonnet` if checks need more nuance. Adding `color:` aids the transcript view. |

---

### 3.12 `plugins/awos/skills/ai-readiness-audit/SKILL.md`

| Line(s) | Issue | Patch |
|---|---|---|
| 46 ("Task tool") | F2 | → "Agent tool". |
| 9 (`disable-model-invocation: true`) | ✅ good | Keep. |
| Step 5 parallel execution | ✅ good | Already follows F10. |

---

### 3.13 `templates/agent-template.md`

Expand to expose modern subagent fields, and add inline guidance:

```diff
 ---
 name: [agent-name]
 description: [Trigger phrase + when Claude should delegate to this agent — be specific]
+tools: [optional allowlist, e.g. Read, Write, Edit, Bash, Grep, Glob]
+disallowedTools: [optional denylist]
+model: [haiku | sonnet | opus | inherit — default inherit]
+effort: [low | medium | high | xhigh | max — optional]
+color: [red | blue | green | yellow | purple | orange | pink | cyan — optional]
 skills: []
 ---

 You are a specialized [domain] agent with deep expertise in [technology list].

 Key responsibilities:

 - [Responsibility aligned with the agent's domain]

 When working on tasks:

 - Follow established project patterns and conventions
 - Reference the technical specification for implementation details
 - Ensure all changes maintain a working, runnable application state
+- Before claiming a task is done, run the verification commands the orchestrator provided. Do not report success based on code-write alone.
```

Update `hire.md` Step 6 placeholder list to include the new fields (`tools`, `model`, `effort`, `color`).

---

## 4. Proposed `CLAUDE.md` (new, ship at repo root via installer)

The user's brief asked for this explicitly. Suggested content — short, links to authoritative docs, no bloat. Copy this into `templates/CLAUDE-template.md` and install to user's project root.

```markdown
# AWOS — collaboration rules for Claude Code

This project uses the AWOS framework. Follow these conventions and the Anthropic best-practices linked below.

## Anthropic references (read these once)

- Claude Code best practices — https://code.claude.com/docs/en/best-practices
- Prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Slash commands & skills — https://code.claude.com/docs/en/slash-commands
- Sub-agents — https://code.claude.com/docs/en/sub-agents
- Plan mode & permissions — https://code.claude.com/docs/en/permission-modes

## AWOS workflow

- Run `/awos:product` → `/awos:roadmap` → `/awos:architecture` → `/awos:hire` once at project start.
- Per feature: `/awos:spec` → `/awos:tech` → `/awos:tasks` → `/awos:implement` → `/awos:verify`.
- For hotfixes and trivial edits, skip the cycle and use plan mode directly.

## Verification (this is the highest-leverage rule)

- Never mark a task or acceptance criterion complete without running verification — tests, lint/typecheck, curl, or Playwright MCP for UIs.
- "It compiled" is not verification. "The test passed" is.

## Scope and prompt discipline

- Keep solutions minimal. Don't add features, refactor unrelated code, or build flexibility that wasn't requested.
- Don't speculate about code you haven't opened. Read first, claim second.
- When delegating to a subagent, prefer parallel reads / parallel subagent calls when work is independent.

## File layout

- `.awos/` — framework internals, **do not edit** (overwritten on update).
- `.claude/commands/awos/` — your customization layer, **safe to edit**.
- `.claude/agents/` — generated specialist subagents (by `/awos:hire`).
- `context/product/` — product / roadmap / architecture docs (source of truth).
- `context/spec/<NNN>-<short-name>/` — per-feature specs.

## Tone

- Skip preambles ("Great!", "I will now…"). State actions, then act.
- For interactive interviews, use the `AskUserQuestion` tool — never plain numbered lists for multiple-choice.
```

---

## 5. Concrete subagent-prompt template for `implement.md` Step 3.1 (the heart of F5/F8/F9)

This is the exact text the new `implement.md` should formulate. It bundles fixes F5/F8/F9/F10 and uses XML tags per source #2.

```text
You are implementing one task from the AWOS spec at <spec_dir>{path}</spec_dir>.

<context>
{contents of functional-spec.md}
---
{contents of technical-considerations.md}
---
Current task list (your task is the one starting with `[ ]` matching the description below):
{contents of tasks.md}
</context>

<task>
{exact task description, with its agent assignment stripped}
</task>

<success_criteria>
- Code change matches what the task description requests, no more.
- All verification commands below pass.
- The application starts and the slice's user-visible behavior is observable.
</success_criteria>

<verification_commands>
{The orchestrator fills these in based on the slice's verification sub-task. Examples:
- `pytest tests/test_<area>.py -q`
- `npm run lint && npm run typecheck`
- `curl -fsS localhost:3000/profile`
- Playwright MCP: navigate to /profile and screenshot}
</verification_commands>

<scope_discipline>
Avoid over-engineering. Only make changes that this task requires. Don't add features, refactor surrounding code, or add validation for scenarios outside the task. If the spec is unclear about a detail, ask rather than guessing.
</scope_discipline>

<investigate_before_answering>
Never speculate about code you have not opened. Read the relevant files before editing. Issue independent reads in parallel in a single tool-call batch.
</investigate_before_answering>

<finish>
After your edits, run every command in <verification_commands>. If any fail, fix the cause (not the test) and re-run. Only report success when all commands pass and the user-visible behavior is observable. Then report:
- files changed,
- verification command outputs (last 20 lines each),
- a one-line statement of what is now possible that wasn't before.
</finish>
```

---

## 6. Prioritized action list

If you only do five things, do these — they capture ~80 % of the value.

1. **F5 + §5 prompt template** — make verification non-optional in `implement.md` and `verify.md`. Highest leverage per source #1.
2. **F4 + §4 CLAUDE.md** — ship a CLAUDE.md template; it's the canonical persistent-context mechanism and AWOS doesn't use it.
3. **F11 + §3.1 wrapper frontmatter** — add `argument-hint` and `disable-model-invocation: true` to every wrapper; switch the `Refer to` line to `@`-import.
4. **F1 + F13 — emphasis & ceremony cleanup** — global pass to remove `CRITICAL`/`MUST`/`STRICTLY` and ceremonial greetings. Modern models behave better without this.
5. **F2 + F3 — Task→Agent rename and drop the introspection step** — one find-and-replace plus a rewrite of the four "extract subagent_type values" paragraphs in `architecture.md`, `tech.md`, `tasks.md`, `hire.md`.

Items F6/F7/F8/F9/F10 are second-tier; F14/F15/F16/F17/F18/F19 are cosmetic / nice-to-have.

---

## 7. What was NOT changed in this audit

- Templates other than `agent-template.md` (`product-definition-template.md`, `roadmap-template.md`, etc.) — these are content templates, not prompts; out of scope.
- `docs/commands/*.md` — user-facing docs; these mirror what commands do, not the prompts themselves. Update only if the commands' behavior changes.
- `src/` — installer; out of scope, but if you ship a new CLAUDE-template.md (F4), `src/config/setup-config.js` needs one new copy operation.
- `scripts/create-spec-directory.sh` — out of scope.

---

## 8. Verification of this audit

Cross-check any finding against its cited source URL. The two foundational docs (#1 and #2) are versioned by Anthropic and change over time — if you're reading this report >3 months after 2026-05-18, re-fetch both URLs before applying changes; some recommendations may have shifted again.
