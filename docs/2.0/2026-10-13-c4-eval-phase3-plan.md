# C4 Diagram Eval — Phase-3 Plan (Calibrated Fixture), 2026-10-13

**Status:** Historical record — phase 3 completed on 2026-10-14 (verdict in `2026-10-14-c4-eval-phase3-results.md`; program synthesis in `c4-diagram-evidence.md`). This document was pre-registered before any phase-3 run and is kept verbatim, with the calibration record appended as probes ran. Decision record: after the phase-2 `not-replicated` result (see `2026-10-12-c4-diagram-eval-results-p2.md`), the maintainer chose **option (b)** — one more campaign on a fixture calibrated so the pre-registered threshold has real headroom — over adopting diagrams as optional (a) or stopping (c). Phases 1–2 remain the record of what was measured so far; this phase existed to decide between "optional" and "required".

## What phase 2 taught about the instrument

- The +2-passes threshold needs a baseline near 5/10. MeterHub's baseline passed 8/10, leaving a maximum measurable gain of +2; ShipLog's 6/10 was marginal. Difficulty must be **verified, not assumed** — "harder feature" intuition failed in phase 2.
- Hallucinated-reference bait does not engage at this model tier on clean small fixtures (50 runs with no invented integration; see the 2026-10-16 correction note for the re-graded per-arm counts). Phase 3 drops hallucination from the success rule entirely; the metric stays reported-only.

## Pre-registered phase-3 protocol

1. **Fixture 3** ("Freightlane"): a larger, genuinely coordination-heavy system — ~5 containers, two queues with different semantics, three stores, and a feature whose correctness requires interlocking behavior across at least four modules in three services (partial availability, compensation on rejection, idempotent retries, status aggregation). Same conventions: zero deps, CommonJS, hermetic `node:test`, arm A prose-only with direction/mechanism ambiguity, arm B adding C4 Context + Container + Component sections. A and B only.
2. **Calibration probe, before the campaign:** 5 arm-A runs. The fixture qualifies when arm-A passes land in the **1–3 of 5 band** (~3–7/10). Outside the band, the fixture (not the rule) is iterated and the probe repeats; probe runs are discarded and never pooled into the campaign. The probe is blind to arm B — calibration only ever looks at the baseline.
3. **Campaign:** 10×A + 10×B, strictly interleaved, pinned `claude-sonnet-5-5`, same harness, same isolation, same single auto-continuation.
4. **Success rule (unchanged in spirit, hallucination branch removed):** B replicates iff `passes_B − passes_A ≥ 2` and mean total tokens regression ≤ 15%.
5. **Readout:** `replicated` → with phase 1, two of three campaigns met the bar: recommend the proposal's **required** template change. `not-replicated` → the effect is real-but-small at best: adopt **optional** (phase-2 note option (a)) and stop measuring; three campaigns is enough spend on this question.

Either way, phase 3 is the last campaign on this question; the decision lands with the humans per the proposal's Week-3 step.

## Calibration record (amended as probes run)

- **Fixture 3, Freightlane (83 files), probe 1 — 4/5 arm-A passes. Failed (too easy).** Its tech doc named every module; rewritten to behavior level.
- **Freightlane, probe 2 — 5/5. Failed again.** Finding: at ≤100 files the codebase is trivially explorable in-session, so structural-reconstruction difficulty does not materialize at this model tier regardless of doc specificity. Freightlane hosted no campaign and was removed from the tree — a fixture that failed calibration for being too easy has no reuse value; the probe record in this note is the record.
- **Decision (maintainer, 2026-10-13): iterate once more, much bigger**, rather than stopping at the phase-2 "adopt optional" recommendation. Fixture 4 ("Atlas", `eval-c4-multiservice-4`): ~200–260 files, 7 services, two queues, a feature interlocking 12+ rules across 5+ services, behavior-level docs from the start. Same band (1–3 of 5 arm-A passes), same discard rule. If fixture 4 also fails calibration, phase 3 closes as **calibration-infeasible** and the phase-2 recommendation (adopt as optional) stands — no further fixtures.
