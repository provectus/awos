# Design: Effort-Profit Improvement Backlog for `/awos:ai-readiness-audit`

- **Status:** Draft
- **Author:** Aleksandr Makarov + Claude
- **Source:** "Nudge SDLC automation in `/awos:ai-readiness-audit`" — AppDev Practice Effort-Profit matrix (Superhuman doc `_dCoNoiEfeSz`, row 36)

## What this is

A new, argument-gated **generate** action in the ai-readiness-audit skill. A normal audit run stays exactly as today; when invoked as `/awos:ai-readiness-audit generate <freeform request>`, the skill consumes an existing audit and produces a prioritized, dependency-aware ticket backlog: an interactive effort-profit graph (`backlog.html`) plus one Jira-style ticket file per work item. Each ticket file is written so a future `/awos:spec` invocation can be pointed at it to produce a real AWOS functional spec — spec generation itself is out of scope for this feature.

Two use cases drive it:

1. **Org mode** — Provectus audits a client's whole GitHub org and needs, besides the CEO-facing report, a concrete cross-repo list of work items that would raise the audit score.
2. **Single-repo mode** — a Provectus team audits one repo (possibly a monorepo) and gets a per-repo backlog of tickets convertible into AWOS specs or tracker issues.

**Division of labor (hybrid model):** LLM subagents do everything judgment-shaped — parsing the request, clustering failing checks into tickets, writing business-language goals, estimating effort, linking dependencies and cross-repo tickets. The engine does everything numeric — validating check references and coverage shares, computing coverage deltas from `weight_max − weight_awarded`, topological ordering, slug assignment, org aggregation, and all rendering. The LLM never hand-writes a number the engine can compute; the engine never guesses at effort or wording.

## 1. UX & argument routing

`SKILL.md` Step 2 becomes a dispatcher over `$ARGUMENTS`:

| `$ARGUMENTS` | Behavior |
| --- | --- |
| empty | Full audit (unchanged) |
| names a dimension | Single-dimension view (unchanged) |
| generate intent (freeform) | New Generate flow, no re-scoring |
| unrecognized | List dimensions + show generate syntax, stop (unchanged shape) |

The generate request is LLM-parsed; no rigid grammar. Recognized facets: dimension filter, effort ceiling ("easy to implement"), impact floor ("big impact"), top-N. Examples that must work:

- `generate improvement backlog`
- `generate backlog for dimensions 1, 2, 4, easy to implement but having big impact`
- `generate quick wins only`

**Audit selection:** one `AskUserQuestion` listing `context/audits/` dirs newest-first (timestamp, mode, score), plus a "run a fresh audit first" option. Headless default = newest audit. No audits → say so, offer to run one.

**Closing hint:** every normal audit run ends by teaching the syntax with 2–3 example invocations (plain text, non-blocking — the skill's "never prompt mid-run" rule holds).

**Model routing:** the coordinator (SKILL.md orchestrator) delegates ticket authoring to a **Sonnet** subagent and mechanical probing (dir listings, `.awos/` detection) to **Haiku** subagents. In general every subtask runs on the cheapest model adequate for it; the coordinator's model is reserved for dispatch and final review.

## 2. Artifacts (single-repo)

All under `context/audits/<timestamp>/backlog/`:

```
backlog/
  backlog.json            # engine-written source of truth (LLM fields + computed fields), provenance-stamped
  tickets/A001-<slug>.md  # one per ticket, engine-rendered
  backlog.html            # interactive graph, engine-rendered
```

### Ticket fields — LLM-authored (Sonnet subagent → `tickets-draft.json`)

- `title` — human-friendly.
- `goal` — business terms (delivery speed, maintainability, traceability, robustness…), never "raise audit score".
- `description` — high-level description of needed changes; the basis for effort estimation.
- `effort_dev_days` — number, days per developer; estimated per-project (the subagent may inspect the repo).
- `definition_of_done` — checklist.
- `depends_on[]` — references to other tickets by LLM-chosen temp id.
- `checks[]` — `[{check_id, share}]` where `share ∈ (0, 1]` is the fraction of that check's remediation this ticket delivers. A ticket may partially cover a check, and several tickets may split one check — shares express that.

### Engine-computed (`generate-backlog <auditDir> <tickets-draft.json>`)

- **Validation (run first, fail fast):** audit provenance stamp present; every `check_id` exists, `applies === true`, has missing weight; no duplicate ticket ids; every `share ∈ (0, 1]`; **Σ share ≤ 1.0 per check across all tickets** (coverage can never exceed 100% — unit-tested); dependency graph is acyclic. Violations are named individually with a non-zero exit.
- `coverage_delta` per ticket = Σ over its checks of `share × (weight_max − weight_awarded)` ÷ total applicable weight — the exact audit-coverage gain.
- **Topological sort of the dependency DAG, then slug assignment in that order:** `A001-<kebab-title>`, `A002-…`. The `A` prefix marks audit-generated items, disjoint from AWOS `context/spec/NNN-` numbering. Slugs exist only post-sort because topological order drives the numbers.
- Writes final `backlog.json` (stamped `engine.generated_by`, same provenance scheme as `audit.json`), `tickets/*.md`, `backlog.html`. **Never writes `audit.json`** — scoring artifacts untouched.

### Validation feedback loop

The orchestrator runs `generate-backlog` immediately after the draft is authored. On validation failure (cycle, share overflow, bad check_id) it does **not** patch the JSON itself — it re-dispatches the Sonnet authoring subagent with the engine's error text as task corrections. Retry once; if the second attempt still fails validation, stop and surface the error (fail-fast, no silent hand-fixes).

### Ticket file layout (`tickets/A00N-<slug>.md`)

Jira-item view: title header; field table (effort d/dev, coverage delta, depends-on with links, covered checks with shares); Goal, Description, Definition of Done sections; footer note: *"To turn this ticket into an AWOS functional spec, run `/awos:spec` pointing at this file."*

## 3. `backlog.html` (single-repo)

Self-contained (inline CSS/JS, same Provectus styling as `report.html`), rendered by the engine:

- **Sticky summary ribbon:** numeric "number of developers" input · total effort (dev-days) of enabled tickets · estimated duration · coverage gain of enabled tickets · "enable all nodes" button. The effort and coverage values have **on-hover tooltips showing the formula with the actual numbers substituted** and a plain explanation of what the value means; the coverage explanation reuses the wording from `report.html`.
- **Sublinear dev scaling:** duration = total effort ÷ speedup(n), with **Amdahl's law** `speedup(n) = 1 / ((1 − p) + p / n)` and a stated parallelizable share `p` (default 0.8, constant in the renderer). A **full-ribbon-width, always-visible warning row** explains why scaling is sublinear: part of the work is inherently sequential (the `1 − p` term) and coordination overhead grows with team size.
- **Vertical dependency graph** (topological layers top→bottom): node shows slug + effort + coverage delta; hover tooltip shows the full ticket detail; **click toggles enable/disable — disabling a node disables its entire dependent subtree**; all nodes enabled at start; ribbon totals recompute live from enabled nodes only.
- **Collapsible legend** at top: node anatomy + interaction rules.

## 4. Org mode

Runs per-repo generation first (Section 2, into each `per-repo/<repo>/backlog/`), then the org layer. Org-level artifacts are `backlog/backlog.json` + `backlog/backlog.html` at the audit-dir root only — no org-level `tickets/` files; the per-repo ticket files are the canonical work items and org nodes link to them.

- **LLM links** per-repo tickets into org tickets (e.g. "Add CI" spans 3 repos even when the per-repo work differs) → `org-tickets-draft.json` mapping each org ticket to per-repo ticket refs, with org-level title/goal/description and org-level `depends_on`.
- **Engine aggregates** — every number on an org node is computed from the per-repo `backlog.json` files, never LLM-authored: effort = sum across member tickets; coverage gain = weighted across all repos' applicable weight; repos coverage = "3/8 repositories".
- Org `backlog.html` (same template, org variant):
  - nodes show the human-friendly **title** instead of a slug, plus repos coverage, weighted coverage gain, summed effort;
  - node tooltip shows a **per-repo numbers table** (repo, member ticket, effort, coverage delta) justifying the aggregation;
  - the dev-count warning row is **wider**, adding: *some tasks are applied once for the whole org — effort is not multiplied per repo, so totals are rough*;
  - **bottom section lists all repos with links to their per-repo `backlog.html`**;
  - **wider legend** at top explaining the weighted/aggregated math, presented together with the node-anatomy legend.

## 5. Engine-skip protection

Same circuit-breaker philosophy as the audit itself, because a headless orchestrator that "goes wild" and hand-computes numbers is a known failure mode here:

- `SKILL.md`'s Generate flow makes `generate-backlog` the unconditional numeric step — there is no prose path to a rendered backlog, and the skill text states the orchestrator must not compute coverage deltas, slugs, ordering, or org aggregates itself.
- The engine stamps `backlog.json` with `engine.generated_by`; `tickets/*.md` and `backlog.html` are only ever emitted by the engine in the same invocation, so a hand-assembled backlog cannot masquerade as a rendered deliverable. Any future consumer of `backlog.json` (org aggregation already is one) refuses an unstamped file.
- Org aggregation reads only stamped per-repo `backlog.json` files and refuses unstamped ones, mirroring how `rollup` skips unstamped per-repo audits.

## 6. Files touched

| File | Change |
| --- | --- |
| `SKILL.md` | Step 2 dispatch + Generate flow section + closing hint in Step 6 |
| `cli.ts` | additive `case 'generate-backlog'` (org variant via flag or second verb) |
| new `backlog.ts` (engine) | validation, coverage math, topo sort + slugs, org aggregation, provenance stamping |
| new `backlog_render.ts` (or `render.ts` additions) | ticket `.md` renderer + interactive `backlog.html` renderer, shared Provectus CSS |
| `tests/generate_backlog.test.ts` | new engine suite |
| `dist/` | rebuilt + committed (`npm run build:audit-engine`) |
| `marketplace.json` + `plugins/awos/.claude-plugin/plugin.json` | version bump at ship time |

Scoring path (`audit_core.ts`, `detectors/`, `metrics/`, `aggregate`) — untouched. The verb runs after scoring and only reads its artifacts, so breakage risk to existing metrics is effectively zero.

## 7. Error handling

- Engine validation failures: named per item, non-zero exit → orchestrator re-dispatches the authoring subagent with the error text as corrections; one retry, then stop with the error surfaced.
- Unstamped or hand-assembled audit dir → `generate-backlog` refuses (same provenance rule as `patch-judgment`).
- Org generate with missing/unstamped per-repo backlogs → engine names the offending repos; orchestrator generates those first.
- Share overflow (Σ share > 1.0 for a check), cycles, unknown check_ids → all individually named in the validation report.

## 8. Testing

TDD throughout — tests written before the code they pin:

- Engine suite (`tests/generate_backlog.test.ts`): check_id validation; share range and **per-check Σ share ≤ 1.0** (the >100% coverage case); coverage-delta math; topo order and slug stability; cycle rejection; provenance refusal (unstamped audit, unstamped per-repo backlog); org aggregation math (sum/weighted/repos-count); HTML smoke — ribbon, graph, both legends, warning row markers present, file self-contained (no external URLs).
- Layer-1 prompt lint: new SKILL.md marker checks (dispatch section, generate flow, closing hint present).
- CI: existing `dist/` rebuild + `git diff --exit-code` job covers bundle staleness.
- **QA harness scenario** (`tools/ai-readiness-audit/qa/`) for the generate flow — in scope. A real headless session runs `generate …` against a seeded audit and the harness asserts compliance: `generate-backlog` was actually invoked (no hand-computed numbers), `backlog.json` is engine-stamped, tickets and HTML exist, share/cycle validation loop behaves. This is the e2e iteration loop for the feature: run, harvest corrections, fix, run again. Harness rules apply: never launch while another audit run is live (pgrep-check), fail fast on first failure — fix, then one rerun, never repeat a failing run unchanged.

## 9. Implementation

Implemented entirely via Claude Code. Ground rules:

- Every implementation action and every correction runs as a **separate subtask** (subagent) on the cheapest adequate model — the coordinator dispatches and reviews, it does not edit code itself when a correction is needed; it re-dispatches with the finding.
- **TDD**: each subtask starts from failing tests (engine suite first), then implementation, then re-run.
- Agent teams where parallelism helps (e.g. `backlog.ts` math vs `backlog_render.ts` HTML are independent after the JSON contract is fixed).
- Suggested subtask order: (1) JSON contracts + engine validation/math tests, (2) `backlog.ts`, (3) ticket `.md` renderer, (4) `backlog.html` renderer, (5) org aggregation + org HTML variant, (6) SKILL.md dispatch/flow/hint + lint markers, (7) `dist/` rebuild + version bumps + full suite, (8) QA harness scenario + e2e iteration loop (run headless generate, harvest corrections, fix via subtasks, rerun).

## Out of scope

- AWOS spec generation from tickets (covered by pointing `/awos:spec` at a ticket file — future feature; the ticket footer note is the only trace in this change).
- Tracker export (Jira/Linear/GitHub Issues).
- Effort fields in `standards.toml` — effort is project-specific and always LLM-estimated.
- Delta/trend logic between audits — audits remain independent snapshots.
