# Known Gaps — Roadmap Inputs

Gaps in the current flow observed on 2026-09-08 while reviewing PR #194 (philosophy, direction, rationale) against the shipped commands. None of them blocks that PR — they are things the docs promise or imply that the flow does not yet do, recorded here so they can be prioritized into a roadmap later. Each entry states what was observed, why it matters, and what a fix could look like; the fix sketches are starting points, not designs.

## 1. Unresolved `[NEEDS CLARIFICATION]` markers are invisible downstream

**Observed.** `commands/spec.md` (Step 6) leaves unresolved markers in the saved spec and says "the user — or `/awos:tech` — can resolve them later." No downstream command mentions the markers at all: `tech.md`, `tasks.md`, `implement.md`, and `verify.md` contain zero references to `NEEDS CLARIFICATION` (verified by grep). The same applies to `/better:spec`'s markers.

**Why it matters.** In an attended run the human resolves markers interactively, so the gap is masked. In an unattended chain (`claude -p`, `AWOS_UNATTENDED`) an assumption is drafted, labeled, turned into a tech spec, built, and then verified against acceptance criteria that were themselves derived from the unconfirmed assumption. The label marks the content as an assumption to any reader who looks — and no downstream reader looks. This breaks the confirmed-before-built contract (philosophy principles 3 and 4) precisely in the mode where it matters most.

**A fix could look like.** `/awos:tech` opens by listing unresolved markers in the functional spec and either resolves them with the user (attended) or carries each into the tech spec as an explicit named assumption (unattended). `/awos:implement` flags tasks that realize unconfirmed assumptions. `/awos:verify` reports which acceptance criteria rest on unconfirmed assumptions instead of silently passing them.

## 2. No confirmation story for unattended runs

**Observed.** The flow is carefully engineered to _survive_ `claude -p` — deliverables are written before any question that could end the turn, and `AWOS_UNATTENDED` skips interviews outright — but nothing replaces the confirmation those questions were for. A spec produced unattended is indistinguishable, to every downstream command, from one a human confirmed line by line.

**Why it matters.** We want awos to run as an automated action eventually (CI-triggered, scheduled, `claude -p`). Without a deferred-confirmation mechanism, automation quietly downgrades "agreement" to "assumption": the philosophy's central moment — a human saying "yes, that" before code exists — has no asynchronous equivalent.

**A fix could look like.** A confirmation status stamped in the spec itself (e.g. `Draft` / `Confirmed`, set by Step 6 or its unattended skip). Unattended runs stop after spec + tech and emit an assumptions ledger for async human review. `/awos:implement` refuses — or requires an explicit override — when the spec it is fed was never confirmed.

## 3. Nothing keeps completed specs current

**Observed.** PR #194 removes the README tip to delete specs after implementation (it contradicted principle 8, "the project remembers"), but no mechanism replaces the advice: stale specs still accumulate and still confuse agents, `/awos:verify` marks a spec Completed and nothing absorbs its knowledge, and no artifact describes the product's _current_ behavior as opposed to its history of intentions.

**Why it matters.** This is the "toward memory" direction with no feature behind it. Until something keeps knowledge current, users get the worst interim state: the pruning advice is gone and the staleness problem remains.

**A fix could look like.** A post-verify absorption step that folds confirmed behavior into a living document (the product definition, or a dedicated current-behavior artifact the flow maintains). Alternatively, an explicit spec lifecycle (active → absorbed → archived) with the archival step owned by the flow rather than left to people.

## 4. The philosophy's behavioral contracts have no enforcement

**Observed.** The incoming `docs/philosophy.md` states contracts that are checkable in principle — every assumption is labeled, confirmation precedes build, verification checks against the agreement — but nothing asserts any of them. Repo history already demonstrates the failure mode: the audit engine needed a three-layer circuit-breaker because prose instructions alone were repeatedly reverted under headless pressure.

**Why it matters.** CONTRIBUTING calls these "the principles every change is measured against," and nothing measures. Principles that live only in prose will be violated by the same dynamics the audit engine already had to engineer around.

**A fix could look like.** awos-qa behavioral assertions for the checkable contracts (an unattended spec run produces a marker for every assumption; an implement run over a spec with unresolved markers flags them). Lint-layer checks where the contract is greppable — e.g. once gap 1 is fixed, a Layer 1 check that `tech.md` references the marker convention, the same discipline as the four-file plugin-version lint.

## 5. The legacy in-repo audit is pending removal

**Observed.** _(Updated 2026-09-08 — the original entry recorded this as an undecided question; it is now decided.)_ The in-repo AI-readiness audit is legacy: its successor is a standalone audit developed in a separate repository, and the audit portion of `plugins/awos/` will be retired once the successor replaces it. Nothing in the repo marks this yet — the plugin README still presents the audit without any deprecation notice. This decision also dissolves the tension with the incoming philosophy's "not a code-quality or engineering-metrics tool" — once the audit is gone, the denial is simply true, and the "toward a smaller surface" direction is advanced exactly as it prescribes (an owned capability replaced by something outside the repo).

**Why it matters.** Until the removal happens, the repo carries a large deprecated surface: the TypeScript engine and its committed `dist/` bundle (~26 MB of grammar `.wasm` files), the manual plugin version line and its four-file lint discipline, the engine test layer in `npm test` and CI, the QA harness, the `repo-auditor` agent, the `standards-refresh` skill, and audit references woven through the docs (README brownfield path, CONTRIBUTING, the brownfield adoption guide).

**A fix could look like.** First, a "soon to be removed" notice in the plugin README so new adopters stop investing in the legacy audit. Then a removal checklist executed when the successor is ready: retire the audit portion of `plugins/awos/` while keeping `/awos:flow`, drop the engine build/test layers from CI and `npm test`, remove the engine-specific dev dependencies, and repoint the brownfield-path docs at the new audit.
