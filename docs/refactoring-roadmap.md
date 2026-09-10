# Refactoring Roadmap — Philosophy Alignment

- **Author:** Daria Garanina
- **Created:** 2026-09-04

## Phase overview

| Phase | What                                                                                              | Gate / dependency                                                     |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1     | Remove `/awos:flow`                                                                               | First                                                                 |
| 2     | Remove brownfield + `/awos:roadmap` (2a + 2b)                                                     | Only 2b gated on the Open question                                    |
| 3     | Remove `/awos:hire`                                                                               | Independent of Phase 2 — run while the question pends                 |
| 4     | Open-PR cleanup                                                                                   | After the removals — most contested PRs are mechanically moot by then |
| 5     | Actualize and re-organize GitHub issues                                                           | After Phase 4 — the same triage, applied to issues                    |
| 6     | Consolidate the flow: 6A `implement` absorbs `tasks` + `verify`; 6B `better:spec` folds into core | 6A after Phase 3; 6B when the better workstream calls it ready        |
| 7     | Deepen the path (registry gaps)                                                                   | After the consolidation — build into the target shape                 |
| 8     | Remove the audit stack + retire the plugins                                                       | **Successor audit passes beta**; marketplace retires only after 6B    |

**Target main flow: `spec → tech → implement`** (foundation: `product → architecture`). `tasks` and `verify` are not target-flow steps: `/awos:implement` absorbs both — it splits the scope itself, runs through it, and verifies the result, all in one. That consolidation is Phase 6A. And the spec step means `/better:spec` — **THE spec command**, WIP status notwithstanding (Daria, 2026-09-09); the roadmap plans around it, and it folds into core as Phase 6B. Phases 1–3 operate on the command set as it exists today.

**Status as of 2026-09-10:** Phases 1, 2a, 2b, and 3 executed — one commit on the `cleaning` branch. See each phase's "Executed" note below for what shipped and what was deliberately deferred. Phases 4–8 remain planned.

Companion documents: `philosophy-alignment.md` (verdicts — why each removal), `known-gaps.md` (living gap registry — diagnosis and evidence).

---

## Phase 1 — Remove `/awos:flow`

**Status: executed 2026-09-10** (one commit on `cleaning`, together with 2a, 2b, and 3).

**Goal:** awos no longer generates delivery commands; delivery belongs to the team (principle 9, "not a delivery process").

- Delete `plugins/awos/commands/flow.md`.
- Docs: strip the Delivery Flow section from `plugins/awos/README.md`, the `/awos:flow` row from `README.md`, and the flow references in `CLAUDE.md` — including its role as the `AskUserQuestion` reference example (pick a core command as the new reference).
- Lint: drop the generator-version constant check and other flow-anchored contracts; bump the plugin version as the deliberate lockstep commit.
- User projects keep their generated `/implement-feature`, `/fix-bug`, and `delivery-flow.md` — class-3 user content: never touched, explicitly disowned in the update output.
- The plugin itself stays — it still hosts the audit until Phase 8.

**Exit:** no flow generation anywhere in the repo; plugin version bumped.

**As executed:**

- The `AskUserQuestion` reference example moved to `commands/product.md`.
- Class-3 disownment for `/implement-feature`, `/fix-bug`, and `delivery-flow.md` is delivered as a note in `plugins/awos/README.md`, not as installer output — no migration touches these files; the note is the entire mechanism.
- Plugin version bumped 2.4.5 → 3.0.0, moving three files (not four): `flow.md`'s generator-version constant no longer exists to anchor a fourth, so the lockstep discipline collapsed to `marketplace.json`, `plugins/awos/.claude-plugin/plugin.json`, and the `EXPECTED_PLUGIN_VERSION` test pin.

## Phase 2 — Remove brownfield logic and `/awos:roadmap`

**Status: executed 2026-09-10** (one commit on `cleaning`, together with 1 and 3 — not a stack of two PRs as originally planned; see "As executed" below).

One coordinated phase (roadmap is one of brownfield's consumers; removing both at once avoids double-touching the same files), shipped as a **stack of two PRs**:

- **2a — roadmap removal** (ungated)
- **2b — brownfield strip** (gated: the Open question decides whether 2b deletes the gather pass or makes it modeless)

Sources dissolution is **not** part of this phase (moved to Phase 7, item 6): only the external-sources _offer_ is stripped with `product.md`. The skill stays — unreachable from the core flow, still directly invocable, still serving `/better:spec` — until Phase 7 dissolves it. Its SKILL.md description ("called by onboarding commands") goes stale then; touch it up on any passing plugin version bump.

### 2a — Roadmap removal

- Delete `commands/roadmap.md`, `claude/commands/roadmap.md`, `templates/roadmap-template.md`, `docs/commands/roadmap.md`. Verify the copy table needs no change (it copies directories wholesale).
- Update the canonical chain everywhere it is drawn (`README.md`, `CLAUDE.md`, docs).
- Installer migration `NNN-remove-roadmap.json`: delete `.awos/commands/roadmap.md` and `.awos/templates/roadmap-template.md` from user projects (idempotent, `skip_if_any` guarded, `--dry-run` validated).
- The wrapper `.claude/commands/awos/roadmap.md` follows user-file policy class 2; the user's `context/product/roadmap.md` is class 3 — never touched, explicitly disowned.

**As executed:** the spec-anchor decision — the roadmap lane is dropped from both spec commands (core `/awos:spec` and `/better:spec`); `topic` becomes the required anchor in its place. This resolves the "better workstream" dependency this section originally called out (see "The `better` workstream" below). The installer migration deletes `.awos/commands/roadmap.md` and `.awos/templates/roadmap-template.md` as planned; the stale class-2 wrapper `.claude/commands/awos/roadmap.md` in already-installed user projects is **deferred** — byte-compare-then-delete is installer copy-logic work (the file-copier's existing content-comparison for the wrapper-preservation policy), not something a JSON migration's file-existence preconditions can express. Scheduled separately, not blocking. The audit engine is untouched by this phase: `audit_patch.ts`'s comment referencing `/awos:roadmap` and the SDD detectors' roadmap-file checks are stale but ride until Phase 8 retires the audit stack.

### 2b — Brownfield strip

- `commands/product.md`: remove detection (indicator scan, prompt precedence, confirm question), the `Explore` pass, `brownfield.md` staging, the triage flow, and the external-sources offer.
- `commands/architecture.md`: remove the `## Technology` brownfield pass and the cleanup step.
- Docs: delete `docs/brownfield-adoption.md`; strip brownfield sections from `docs/commands/{product,architecture}.md`, `README.md`, `CLAUDE.md`, and the brownfield-pitch note in `plugins/awos/README.md` (audit sections stay until Phase 8). `plugins/better/README.md` is out of scope — a handoff to the better workstream.
- Lint: remove the brownfield contract tests; add the inverse guard — `brownfield` must not reappear in core prompts.
- `awos-qa`: retire the brownfield behavioral scenarios.

**Exit:** no brownfield or roadmap references outside history (audit docs excepted until Phase 8); migration validated against a fixture project.

**As executed:** resolved via the Open question's third shape (see "Open question" below) — `/awos:product` is interview-only with zero code-reading; the modeless gather pass survives but relocates entirely into `/awos:architecture`, which always runs it unconditionally (existing stack = defaults, evidence citations, confirmed in normal review). One deferral: the `configure-external-sources` restart-resume entry point, which lived in `product.md` (re-invoking the skill automatically after an MCP-server restart), is gone along with the external-sources offer — the skill itself is untouched and still directly invocable, but nothing in the core flow re-triggers it after a restart. Phase 7's sources dissolution reconciles this when it redesigns the skill's calling convention.

## Phase 3 — Remove `/awos:hire`

**Status: executed 2026-09-10** (one commit on `cleaning`, together with 1, 2a, and 2b).

**No dependency on Phase 2** — start as soon as Phases 0–1 land, while the Open question pends.

**Why removed** (decided 2026-09-09): skill/MCP installation is host provisioning ("a feature that serves the host tool rather than the method"; the Is-Not list's "Claude Code distribution"); specialist code quality is principle 4's "belongs to the host tool"; encoding project conventions into generated agents duplicates context engineering, which the rationale calls solved and not awos's job.

The one path-relevant duty — every `[Agent: name]` marker must resolve — dissolves into the path:

- `/awos:tasks`: assigns markers by introspecting whatever agents exist; when **no agent covers a task**, it surfaces the gap as an open question (principle 7 applied to staffing) instead of silently writing a name.
- `/awos:implement`: a marker with no matching agent delegates to general-purpose and says so in its report (principle 5).

Work items:

- Delete `commands/hire.md`, `claude/commands/hire.md`, `templates/agent-template.md`, and the coverage-table machinery; update the CLAUDE.md guidance naming hire as the read-the-agent-files exception.
- Docs: foundation chain becomes `product → architecture`; README foundation table, `docs/commands/hire.md`, lint tests.
- Installer migration `NNN-remove-hire.json`; the wrapper follows the user-file policy.
- A docs paragraph points at the host's own plugin/marketplace ecosystem — a pointer, not a curated list (a curated list is the "bundle of best practices" creeping back).

**Cost accepted:** the "here's your team" onboarding moment dies. By principle 1 it never moved the outcome.

**As executed:** the awos-recruitment MCP registration was removed from the installer along with hire — its setup step is gone entirely, not just its caller; `src/core/setup-orchestrator.js` now runs five steps (init → create directories → run migrations → copy files → register plugin marketplace) instead of six. The stale class-2 wrapper `.claude/commands/awos/hire.md` in already-installed user projects is deferred for the same reason as roadmap's — installer copy-logic work, not a migration.

**Interim note:** this phase's `tasks.md` changes are interim — Phase 6 absorbs tasks into implement. Executing Phases 3 and 6A together avoids touching the same files twice; landing the marker-resolution duty directly in the rewritten `implement` is the cleaner path if timing allows.

## Phase 4 — Open-PR cleanup

Runs after the removals (Phases 1–3): by then most contested PRs target code that no longer exists, so the triage is mechanical rather than argumentative — and the removals never wait on PR archaeology. Every open PR gets the five-direction test; a close on philosophy grounds names the principle and **preserves the kernel** — the problem the PR solved is carried into a phase note or an issue. The philosophy PR itself is not part of this cleanup; it lands on its own track.

Triage as of 2026-09-09:

| PR         | Verdict                        | Grounds                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #193, #187 | Close — mooted                 | Flow already removed in Phase 1 — mechanically moot                                                                                                                                                                                                                                         |
| #183       | Close — maintainer decision    | Passed the fidelity test in review; its kernel (failed criteria flow back into the work) is realized natively by Phase 6's consolidation                                                                                                                                                    |
| #148       | Close — end-of-life waste      | New feature surface on a component with a signed death warrant (principle 1)                                                                                                                                                                                                                |
| #189       | Closed (2026-09-10)            | Closed outright, superseding the split ask (maintainer decision): the definition-unification fix stays welcome as its own small PR during the beta window; the orchestration-root mode is end-of-life surface (principle 1), its kernel carried by re-targeting #172 at the successor audit |
| #167       | Close — misaligned             | Multi-host adapters (Cline/Codex): principle 10's named anti-pattern, verbatim                                                                                                                                                                                                              |
| #124, #125 | Close — misaligned             | Tutorial skill + cross-links: "not a document generator," fully outside the path                                                                                                                                                                                                            |
| #114       | Close — misaligned             | Regression-suite manager: "not a code-quality tool"; principle 9 puts test suites with what awos plugs into                                                                                                                                                                                 |
| #188       | Close — misaligned             | Serves the tool, not the method; 2 of its 3 checks mooted by the hire/plugin removals; version-drift idea moves to the installer backlog                                                                                                                                                    |
| #146       | Close — kernel extracted       | Containment plugin keeps marketplace machinery alive and re-implements the host's sandbox; the method-level kernel is #144                                                                                                                                                                  |
| #122       | Close — kernel extracted       | Change-request ledger nothing reads (memory regression); kernel → Phase 7 item 5 (spec update mode records amendment rationale)                                                                                                                                                             |
| #123       | Close — kernel extracted       | Second architecture decision record; kernel → fold alternatives + rationale capture into `/awos:architecture` (reuse its multi-select)                                                                                                                                                      |
| #199       | Merged (2026-09-10)            | One-line tagline de-hype — accurate, conflict-free with the cleaning rewrite; the surviving "production-ready" overclaim goes to the tone cleanup                                                                                                                                           |
| #144       | Close — kernel extracted       | Passed the fidelity test; closed on timing (conflicts with cleaning's implement.md; 6A rewrites the file). Kernel → 6A design inputs: delegation hands paths + verbatim work-unit text, never pasted bodies (also the kernel #146's close points at)                                        |
| #171       | Close — misaligned (confirmed) | Principle 11 verbatim: the escape hatch is the host's own planning; `context/quick/` repeats #122's parallel-ledger regression; #185's own author closed the same middle tier ("a shorter spec is still a spec"). Kernel homes: README plan-mode boundary + 6A's ceremony collapse          |

**Exit:** zero open PRs that contradict the philosophy or a planned phase; every close names its principle and its kernel's new home.

## Phase 5 — Actualize and re-organize GitHub issues

Same discipline as Phase 4, applied to the issue tracker (18 open issues as of 2026-09-09: fourteen audit reports, two flow issues, a few structural ones).

- **Close as mooted:** issues against removed components — flow (#184, #178) after Phase 1; anything touching brownfield, roadmap, or hire after Phases 2–3. Each close names the phase that removed the target.
- **Audit issues get the #189 test:** the audit lives until Phase 8's gate, so a bug producing wrong scores is fix-worthy while users keep receiving them; an enhancement is end-of-life waste (principle 1). Label each side accordingly.
- **Re-organize the survivors:** every remaining issue gets a roadmap-phase or registry-gap reference; a feature request gets the five-direction test before it earns a label; an issue that is really a diagnosis is recorded in `known-gaps.md` first — the registry holds evidence, issues track scheduled work.
- **File what this roadmap owes:** the better-workstream coordination issues (the Phase 2a `roadmap.md` dependency, the Phase 7.6 KB-lane change); the installer version-drift detection issue (kernel of closed #188); the re-target of #172 (orchestration-root mis-crediting) at the successor audit repo (from the #189 split, 2026-09-10).

**Exit:** every open issue carries a phase or gap reference, or was closed with its reason named; no issue targets removed code.

## Phase 6 — Consolidate the flow

Two consolidations, one target: the flow becomes `spec → tech → implement`, each step one command.

### 6A — `implement` absorbs `tasks` and `verify`

Decided 2026-09-09: `/awos:implement` owns the whole back half — **it splits the scope itself, runs through it, and verifies the result, all in one command.** The command is rewritten, not patched.

- Rewrite `commands/implement.md`:
  - **Split:** takes the tech spec and derives the work units itself — absorbing tasks' job, including agent assignment by introspection and the staffing-gap surfacing from Phase 3.
  - **Run:** executes the units by delegation — the orchestrator-only contract (implement never edits code itself) is preserved.
  - **Verify:** checks the result against the spec's acceptance criteria — absorbing verify's job — and loops failed criteria back into the work units, which realizes the kernel of closed #183 natively.
- Delete `commands/tasks.md`, `commands/verify.md`, their wrappers, and `docs/commands/{tasks,verify}.md`; update lint tests and the `awos-qa` scenarios in lockstep.
- Installer migration `NNN-remove-tasks-verify.json`; wrappers follow user-file policy class 2; existing `tasks.md` files inside users' spec directories are class 3 — never touched, disowned.
- Update the canonical chain everywhere: `spec → tech → implement`.
- Design questions to settle at phase start (gathered, then confirmed — not guessed now): whether the scope split remains a reviewable artifact (a confirmation moment for the plan) or stays internal; how verification reports its results; what happens to the `**[Agent: name]**` marker convention when no task file exists to carry it.
- Design inputs carried from closed PRs (recorded 2026-09-10):
  - **Delegate-by-path** (kernel of closed #144, and the method-level kernel #146's close points at): delegation hands the coding subagent document paths plus the verbatim work-unit text — never pasted or paraphrased document bodies. Two review findings travel with it: the measured leaks all followed the orchestrator authoring verification commands out of `technical-considerations.md`, so no step may force the orchestrator to re-author document content; and since the 6A orchestrator legitimately reads the tech spec to split scope, the invariant is a paths-only _delegation channel_, not "the orchestrator never reads spec bodies."
  - **Small-task pressure** (behind closed #171/#185/#187): 6A's ceremony collapse is the on-path answer to "five commands for a twenty-minute fix"; below the worth-specifying threshold, the host's own plan mode remains the documented boundary (README).

### 6B — `better:spec` becomes `commands/spec.md`

`/better:spec` is THE spec command; the plugin form is temporary. **Gate:** the better workstream calls the experiment ready. **Hard ordering:** must land before Phase 8 retires the marketplace — the better plugin rides the same `.claude-plugin/marketplace.json` as the awos plugin, so the marketplace cannot die while the spec command lives in a plugin.

- Replace `commands/spec.md` with the better prompt (wrapper updated); remove the old core spec — "a proven experiment folded into core and its predecessor removed," the direction doc verbatim.
- Relocate the `spec-verifier` agent and `render-spec.mjs` into the core install; re-point `tests/better-render.test.js` and the spec lint contracts.
- Remove `plugins/better/`, its marketplace entry, and the three-file version discipline (`EXPECTED_BETTER_PLUGIN_VERSION`).
- `awos-qa` lockstep for the spec scenarios.

## Phase 7 — Deepen the path

With the surface small and consolidated, invest in the method — built into the target shape once, not into `verify.md` first and moved later. Items 1–5 map to registry gaps; item 6 is the relocated sources dissolution.

1. **Markers travel downstream** (gap 1): `/awos:tech` opens by resolving or explicitly carrying unresolved `[NEEDS CLARIFICATION]` markers; `/awos:implement` flags work units realizing unconfirmed assumptions and, in its verification stage, reports criteria resting on them.
2. **Confirmation status for unattended runs** (gap 2): a `Draft`/`Confirmed` status stamped in the spec; `/awos:implement` refuses an unconfirmed spec without an explicit override (used by CI and `awos-qa`). The async shape: an unattended run ends by opening a PR carrying spec + tech — **approving that PR is the confirmation** — and the next run builds. Once the mechanism exists, `philosophy.md` principle 3 gains its deferred-moment sentence; the doc follows the mechanism.
3. **Enforcement** (gap 4): awos-qa behavioral assertions for the checkable contracts; lint checks where greppable.
4. **Memory** (gap 3): the post-verify absorption step — confirmed behavior folds into a living document. Largest design surface; last for a reason.
5. **Amendment rationale** (gap 7, kernel of closed #122): the owning spec's update mode records why an agreed requirement changed.
6. **Sources dissolution** (moved from Phase 2; decided 2026-09-09):
   - Delete the `configure-external-sources` skill and the `context/sources/` conventions (`sources.md`, the `## Status:` markers) — a plugin behavior change, rides a plugin version bump.
   - Add a **knowledge-sources section** to `templates/product-definition-template.md` — where the project's external intent lives (principle 8: product knowledge belongs in the product definition).
   - Establish the convention: consumers **introspect the host's connected tools at runtime**; a named source with no reachable tool becomes an open question (principle 2); setup and egress consent belong to the host (principle 10).
   - Shaped by the Open question's resolution (a modeless gather pass is the section's natural consumer) and paced with the better workstream's KB-lane adaptation.

When this phase is planned, sweep `known-gaps.md` for entries marked **unscheduled** — schedule or explicitly defer each.

## Phase 8 — Remove the audit stack (last)

**Gate: the successor audit — developed in its separate repository — has passed beta and is usable.** Until then the in-repo audit stays operational; removal is decided, not scheduled. This phase runs last because it is the only one whose timing depends on something outside this repo.

- Delete `plugins/awos/skills/ai-readiness-audit/`, `plugins/awos/agents/repo-auditor.md`, the `standards-refresh` skill, `tools/ai-readiness-audit/`, and `dist/`.
- Remove the `build:audit-engine` / `test:audit-engine` scripts, the engine layer from `npm test`, the engine devDependencies (`tsx`, `esbuild`, `typescript`), and the CI jobs (dist diff check, engine tests).
- Retire the now-empty plugin (flow left in Phase 1, sources in Phase 7 — if this gate opens first, the sources dissolution moves up): `plugins/awos/`, `.claude-plugin/marketplace.json`, the installer's marketplace-registration machinery (`src/services/marketplace-configurator.js`, orchestrator step 6), and the plugin version line with its lint discipline. **Marketplace retirement additionally requires Phase 6B done** — the better plugin rides the same marketplace; until the spec folds into core, the marketplace stays. The marketplace registration in user settings follows the user-file policy.
- Docs: strip audit sections from `plugins/awos/README.md` (or delete with the plugin), `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`; add the successor pointer — announceable by definition of this phase's gate.

**Exit:** `npm test` green with no engine layer; no `dist/`, no plugin, no marketplace machinery; README points at the successor.

---

## The `better` workstream (parallel)

`/better:spec` **is THE spec command** (Daria, 2026-09-09), WIP status notwithstanding — the roadmap plans around it while the better workstream keeps adjusting it in parallel with the philosophy. What that means for this roadmap:

- **Phase 2a touches THE spec — resolved 2026-09-10:** `roadmap.md` disappeared. The roadmap lane is dropped from both spec commands (core `/awos:spec` and `/better:spec`); `topic` is now the required anchor in its place.
- **Phase 7.6 changes THE spec's research lane:** the KB-lane gate moves from `sources.md` to host-tool introspection plus the product definition's knowledge-sources section; the lane works unchanged until then.
- **Phase 6B is the destination:** the plugin form is temporary — `commands/spec.md` is where the spec ends up, on the workstream's readiness call.

---

## Cross-cutting rules

- Lint/test updates ship in the same PR as the change they pin (repo policy).
- Removals of user-visible commands get `major` release labels; migrations are idempotent and `--dry-run` validated.
- Each phase's PR body names the philosophy principle/direction it serves.
- Before each phase, sweep open PRs for conflicts; close moot ones with a pointer to this roadmap.
- **awos-qa lockstep:** every phase that changes the command surface lands a paired `awos-qa` update in the same window — the sibling repo is part of each phase's definition of done.
- **Gap registry:** `known-gaps.md` holds diagnosis and evidence; the plan lives here. A new gap found during any phase is recorded there first, then scheduled. A gap leaves the registry only when the flow actually closes it.

### User-file policy (decided 2026-09-09)

_awos deletes only what awos wrote and the user never touched; anything carrying user intent is preserved and surfaced, never silently removed._

| Class | Files                                                                        | Treatment                                                                                      |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1     | `.awos/` internals                                                           | Migrations delete freely — the existing overwrite contract                                     |
| 2     | Wrappers in `.claude/commands/awos/`                                         | Deleted only when byte-identical to the shipped version; otherwise preserved with a notice     |
| 3     | User content (`context/product/*.md`, generated flow commands, `sources.md`) | Never touched; **explicitly disowned** in the update output ("yours to keep, move, or delete") |

Notes:

- Class 3's disownment answers the memory direction's orphaned-document regression without destroying confirmed user intent.
- The marketplace registration in user settings follows the same rule: removed when it is exactly the entry the installer wrote, left-and-notified otherwise.
- _Mechanics (verified 2026-09-09):_ migration preconditions are file-existence only, so class 2's byte-comparison cannot be a JSON migration — it lands in the installer's copy logic, which already compares content for the preservation policy. Migrations handle class 1 only.

---

## awos-qa follow-up (owed)

Phases 1, 2a, 2b, and 3 landed here on 2026-09-10 without their paired `awos-qa` update — the "awos-qa lockstep" cross-cutting rule above is not yet satisfied for this wave. Owed, not yet scheduled to a specific session:

- [ ] Retire the brownfield behavioral scenarios (detection, `brownfield.md` staging, triage protocol) — Phase 2b removed the machinery they exercise.
- [ ] Retire the flow-generation behavioral scenarios (`/awos:flow` interview, `/implement-feature`/`/fix-bug` generation, re-run reconciliation) — Phase 1 removed the command.
- [ ] Update the hire/tasks scenarios to the staffing-gap flow — Phase 3 replaced "`/awos:hire` provisions an agent" with "`/awos:tasks` introspects, surfaces a staffing gap as an open question when no agent covers a task, and `/awos:implement` falls back to general-purpose and reports the substitution."
- [ ] Update the spec scenarios to the topic-required anchor — the roadmap lane dropped from both spec commands (Phase 2a); scenarios that anchored a spec via the roadmap need a topic-anchored equivalent.

---

## Open question — RESOLVED

**Existing-codebase onboarding after brownfield removal** — ✅ resolved 2026-09-10 (Daria), decided before Phase 2b started, as planned.

**Context:** `/awos:product` was going to stop reading code — an existing-codebase user's product definition would come from the interview alone, which trips the discovery direction's regression tests head-on (the codebase is an intent source the rationale itself names).

**Resolution — a third shape, not either option as originally framed:**

- `/awos:product` has zero code-reading, full stop — matching option (b)'s discipline. It never runs `Explore`, never stages a `brownfield.md`, never triages findings against the interview.
- The discovery regression is not accepted as a permanent gap (option (b)'s fallback) — it's answered by **relocating** the gather pass rather than dissolving it (option (a)'s move), but into `/awos:architecture` instead of leaving it in `/awos:product`. `/awos:architecture` always runs an unconditional `Explore` codebase-gather pass: an existing stack becomes the architecture defaults, cited with evidence, confirmed in the normal review like any other draft — modeless, no brownfield/greenfield branching.
- Net effect: no "brownfield" concept anywhere (principle 2 with no exceptions, same as option (a)'s outcome), and `/awos:product` is interview-only (the guarantee option (b) named), because the codebase-as-intent-source duty moved downstream to the command that actually owns technical facts rather than disappearing.

**Original options, for the record:**

- **Option (a) — dissolve, don't resurrect:** the brownfield subsystem (detection, modes, staging file, triage protocol, guide) dies entirely; what survives is one unconditional, modeless gather step — `/awos:product` always runs an `Explore` pass whose findings enter the draft with evidence citations, confirmed in the normal review; `/awos:architecture` treats an existing stack as its defaults unconditionally. No "brownfield" concept anywhere — principle 2 with no exceptions.
- **Option (b) — zero code-reading:** awos never opens the repo during product definition; the discovery regression is accepted, so the direction doc cannot later be quoted against it as an oversight.
