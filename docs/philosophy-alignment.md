# Philosophy Alignment Review

The existing product surface judged against the philosophy on PR #194 — the eleven principles, the five directions, and the "What `awos` Is Not" list.

- **Role:** the verdict record — _why_ each item was convicted or acquitted.
- **Companions:** `known-gaps.md` (living gap registry) · `refactoring-roadmap.md` (execution plan — every disposition below names its phase there).
- **Reviewed:** 2026-09-09; dispositions updated the same day as decisions landed.

**The test applied to each item:**

1. Does it sit on the one path (intent → confirmed understanding → implementation → verification), or feed it?
2. Does it survive the "What `awos` Is Not" list?
3. Does it advance or regress the five directions?

## Verdict summary

| #   | Item                                     | Verdict                   | Disposition                                  |
| --- | ---------------------------------------- | ------------------------- | -------------------------------------------- |
| 1   | AI-readiness audit stack                 | Misaligned                | Remove — Phase 8 (last, gated on successor)  |
| 2   | `/awos:roadmap`                          | Misaligned                | Remove — Phase 2a                            |
| 3   | `/awos:hire`                             | Misaligned                | Remove — Phase 3                             |
| 4   | `/awos:flow`                             | Misaligned                | Remove — Phase 1                             |
| 5   | `configure-external-sources`             | Misaligned (reclassified) | Dissolve — Phase 7, item 6                   |
| 6   | `/awos:spec` + `/better:spec` coexisting | Tension (resolved)        | `better:spec` is THE spec — Phase 6B fold-in |
| 7   | `implement` → `verify` marker blindness  | Tension (flow gap)        | Registry gaps 1–2 — Phase 7, items 1–2       |
| —   | Everything else                          | Aligned                   | Keep                                         |

## Misaligned

### 1. The audit stack (`/awos:ai-readiness-audit`)

The engine, the `dist/` bundle, the `repo-auditor` agent, the `standards-refresh` skill.

**Convicted by:**

- "Not a code-quality or engineering-metrics tool" — it is a scored, weighted metrics engine.
- The smaller-surface regression, verbatim: "a capability that sits outside the path, however useful."
- It serves assessment, not agreement — nothing in it makes a confirmation moment cheaper or more reliable.

**Disposition:** removal decided, scheduled **last** — Phase 8, gated on the successor audit (separate repository) passing beta. The in-repo audit stays operational until that gate opens.

### 2. `/awos:roadmap` (+ `roadmap-template.md`)

**Convicted by:**

- "Not a planning or backlog tool"; principle 9 lists "backlog" first among the things awos plugs into, _never provides_.
- The discovery regression: `roadmap.md` is "a file the human must maintain so that the agent can read it" — a duplicate of the tracker awos should be reading.

**Disposition:** removed — Phase 2a. The tracker-reading successor the rationale presumes is registry gap 10, unscheduled.

### 3. `/awos:hire`

**Convicted by:**

- "Not a Claude Code distribution or a bundle of best practices" — finding and installing agents, skills, and MCPs is exactly that.
- The smaller-surface regression: "a feature that serves the host tool rather than the method."
- Its one path link — `[Agent: name]` markers must resolve — does not require awos to own discovery and installation.

**Disposition:** removed — Phase 3. The marker-resolution duty dissolves into `/awos:tasks` (gap surfacing) and `/awos:implement` (general-purpose fallback, reported).

### 4. `/awos:flow` (and the generated `/implement-feature`, `/fix-bug`)

**Convicted by:**

- "Not a delivery process — git flow, review gates, release management" — the generated commands drive exactly that. (CodeRabbit independently flagged the same collision on PR #194.)
- The adapter defense ("flow only encodes the team's own process") was written nowhere, and the generated commands own the end-to-end drive.

**Disposition:** removed entirely — Phase 1; the adapter defense was considered and not taken. Already-generated commands in user projects are class-3 user content: never touched, explicitly disowned.

### 5. `configure-external-sources` (+ `sources.md`, the `context/sources/` conventions)

_Reclassified 2026-09-09: the first pass listed this under Aligned as "the purest discovery artifact in the repo." Interrogating what problem it solves reversed the verdict._ The problem — location, access, and permission for intent living outside the repo — is genuinely core-path (principle 2's precondition). The artifact is not:

**Convicted by:**

- Guiding MCP/CLI setup is **host provisioning** — the same conviction as hire.
- `sources.md` is the discovery regression verbatim — "a file the human must maintain so that the agent can read it" — duplicating connection state the host already holds.
- The source locations it records are **product knowledge filed outside the product definition** (principle 8).

**Disposition:** dissolved — Phase 7, item 6. Locations/scope move into the product definition; consumers introspect the host's connected tools; setup and consent belong to the host. Until then the skill stays functional — unreachable from core after Phase 2, still directly invocable, still serving `/better:spec`.

## Tensions — aligned in purpose, misaligned in current shape

### 6. `/awos:spec` and `/better:spec` coexisting

- The smaller-surface regression "two ways to do the same step kept alive indefinitely" — **resolved by decision** (Daria, 2026-09-09): `/better:spec` **is THE spec command**, WIP status notwithstanding; the old core `spec.md` is the predecessor the direction doc says to remove, scheduled as roadmap Phase 6B on the better workstream's readiness call.
- Fitting, not ironic anymore: `/better:spec` is individually the most philosophy-aligned artifact in the repo — discovery fan-out, evidence-labeled assumptions, blind self-check, derived human view (principles 2, 5, 6, 7 embodied) — which is exactly why it won.

### 7. `/awos:implement` → `/awos:verify` marker blindness

- The commands are the path itself, but they verify the spec _as written_, blind to unresolved `[NEEDS CLARIFICATION]` markers — enforcing a contract nobody fully agreed to (principles 3, 4).
- A flow gap, not an existence question: registry gaps 1–2, scheduled as Phase 7, items 1–2.

## Aligned

| Item                                                              | Why it passes                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/awos:product`, `/awos:architecture`                             | Intent gathering and durable memory. (Brownfield machinery goes in Phase 2; the gather pass's fate is the Open question.)                              |
| the spec (= `/better:spec`), `/awos:tech`                         | The target main flow itself (`spec → tech → implement`); the spec folds into core as `commands/spec.md` in Phase 6B.                                   |
| `/awos:tasks`, `/awos:verify`                                     | Serve the path today, but are not target-flow steps — absorbed by roadmap Phase 6: `implement` splits the scope, runs it, and verifies it, all in one. |
| `spec-verifier` agent                                             | Principle 5 — awos checks its own work. (Better-plugin scope.)                                                                                         |
| `render-spec.mjs`                                                 | Principle 6 — a derived human view from the agent-facing source. (Better-plugin scope.)                                                                |
| `create-spec-directory.sh`, templates (roadmap's aside), wrappers | Neutral mechanics; templates are agreement _storage_, which the philosophy explicitly permits.                                                         |

## End state

**Target main flow: `spec → tech → implement`** (foundation: `product → architecture`).

After this roadmap executes, the surviving commands are `product`, `architecture`, `spec`, `tech`, `tasks`, `implement`, `verify` — but `tasks` and `verify` are **not steps of the target flow**: roadmap Phase 6 rewrites `/awos:implement` to absorb both — it splits the scope itself, runs through it, and verifies the result, all in one command. One Open question also remains: whether awos ever reads the codebase it builds in.
