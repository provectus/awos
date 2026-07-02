# Metric range & interference (implicitly broken metrics)

A metric only discriminates if a real project state can drive it to **0** and a different state can drive it to its **max**. Two failure modes break that:

- **Degenerate range** — the metric can't reach 0 (it awards on an empty/minimal/bad repo) or can't reach max (capped below full even when the capability is fully present).
- **Interference** — two metrics are coupled so that no single project state can be extremal for both: the _same file_ is a positive signal for A and a negative signal for B. You can max A or max B, never both.

Data behind this doc: `data/range-analysis.txt` — per-check min/max `score` across a minimum-score, a regular, a maximum-score, and a backend+frontend fixture. Caveat: judgment checks (`AI-01/AI-06/ARCH-03/AS-*`) store `score=0` even when PASS (see `01-…` consistency notes), so their range rows are capture artifacts, not real degeneracy.

---

## A. Cannot reach zero (no low-end discrimination)

These score high even on a deliberately minimal/bad repo, so a low-maturity project can't be distinguished from a high one on these axes. Grouped by root cause:

### A1. Self-pollution (see `01-…` B3)

`ADP-06`, `SDD-01` — award because the audit writes `context/` into the repo. Fix B3 restores their 0.

### A2. Saturating presence/activity/scale descriptors

- `ADP-07` (active contributors) — a 1-commit, 1-author repo scores max. "Any activity" = full credit.
- `ADP-11` (code churn) — a repo with almost no history scores max (low churn reads as healthy).
- `ADP-22` (scale) — a 7-LOC repo scores max (small = good).

These have no low end: the _absence_ of a codebase maxes them. They behave as **descriptors**, not maturity signals. **Resolution:** either make them informational (report the number, don't score it toward readiness), or require a minimum signal before awarding (e.g. contributors/churn only score once there is enough history to be meaningful; below that → SKIP, not PASS).

### A3. Vacuous-absence passes ("nothing to check" scored as "does it well")

- `ARCH-02` (import-layer violations) — no cross-module imports → "no violations" → max.
- `SDD-03` (arch-doc tech matches code) — no arch doc → check skipped → **PASS**.
- `SDD-05` (spec triad complete) / `SDD-06` (no stale specs) — no spec dirs → **PASS**.
- `SEC-05` (sensitive files git-ignored) — no sensitive files → **PASS**.
- `SBP-06` (Python-2 except syntax) — no Python → **PASS**.

Conflating "not applicable / empty" with "compliant" inflates weak repos. **Resolution:** when the precondition is absent, emit **SKIP** (excluded from coverage) rather than PASS, so absence never reads as strength. (Contrast: `SDD-04` correctly SKIPs when there are no feature branches.)

### A4. Inverted range (scores _worse_ as the repo improves)

- `ARCH-05` (file naming) — scores **max on a 1-file repo** ("no source files — skipped") but **FAILs on a well-tested repo** because `*.test.ts` files count as naming violations (see `01-…` B2). This is A3 + interference (below) combined into a metric whose range runs the wrong way.

---

## B. Cannot reach max

- `DOC-06` — capped at 0.86 even at 100% documentation coverage (`01-…` B5).
- (`QA-04` e2e / `DOC-03` API docs / `AS-02` security headers never PASSed in our fixtures — but those are simply capabilities we didn't seed, not bugs: add a Cypress config / OpenAPI spec / security middleware and they pass. Listed for completeness, not as defects.)

---

## C. Interference (the "one file helps A, hurts B" problem)

### C1. Test coverage (`QA-01/02/05/08`) ↔ file naming (`ARCH-05`) — CONFIRMED

A `*.test.ts` file is **required** to raise the QA metrics (test ratio, unit tier, mocks) but is **counted as a naming violation** by ARCH-05. Direct evidence: ARCH-05 = PASS on the min fixture (no tests) and FAIL on the max fixture (has tests). You cannot simultaneously max QA and max ARCH-05 in a TS/JS project.

**Diverge:** ARCH-05 must judge test files against the test-naming convention (or exclude them). Then "well-tested" and "consistently named" become independent axes that a good repo can both satisfy. (Same fix as `01-…` B2.)

### C2. Scale/complexity (`ADP-21`, `ADP-22`, `ARCH-06`) ↔ capability breadth

These reward _small and simple_; a feature-complete, high-capability repo is necessarily larger and more complex, which pushes them down. They can only reach max on a trivial repo — the opposite end from where the rest of the audit wants to be. So "more AI-SDLC capability" and "top scale/complexity score" trade off.

**Diverge:** treat size/complexity as **descriptors** (informational), or band them so a _reasonable_ size/complexity earns full credit and only _pathological_ extremes are penalized — decoupling them from raw smallness.

### C3. Spec presence vacuity (`SDD-05/06`) ↔ spec usage (`SDD-04`)

A repo with **zero** specs scores max on SDD-05/06 (vacuous pass, A3) while SDD-04 (branches touch specs) correctly SKIPs/fails. So the spec dimension can look strong on a repo that does no spec-driven work at all. Fixing A3 (SKIP-on-absence for SDD-05/06) removes the contradiction.

---

## Suggested plan shape

1. **Fix the explicit bugs** in `01-…` (B1–B5) — several directly repair range/interference here (B2→C1, B3→A1).
2. **SKIP-on-absence** pass over A3/C3 checks: precondition absent → SKIP, not PASS.
3. **Reclassify saturating descriptors** (A2, C2): make size/scale/complexity/contributor-count informational, or add a meaningfulness floor before they score.
4. For each surviving interference pair, decide **diverge vs. merge vs. remove** — the goal is that every scored metric can independently span 0→max for some real project, and no two scored metrics are forced to trade off on the same file.
