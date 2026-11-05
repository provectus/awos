# C4 Eval — Grader Correction and Re-Grade, 2026-10-16

**Status:** Correction note. A pre-PR code review found two defects in `tools/c4-evals/grade-run.mjs`'s hallucinated-reference metric. All 70 archived runs were re-graded with the fixed graders; the campaign tables under `data/` carry the corrected numbers. **Every campaign verdict is unchanged** — the decision rule's hallucination branch requires a nonzero baseline mean, and arm A's remained 0.0 in all three campaigns, so the pass-count branch alone decided every readout, before and after the fix.

## The two defects

1. **Over-resolution (masked true flags).** The resolver's bare-basename fallback resolved _any_ path whose filename exists somewhere in the tree. The fixtures deliberately repeat basenames across services (`errors.js`, `retry.js`, …), so wrong-directory references — exactly the cross-service confusion under measurement — never got flagged. Fixed: the basename fallback now applies only to references with no directory part.
2. **Under-resolution (potential false flags).** The endpoint check was meant to read a concatenated post-run source file the harness never actually wrote, falling back to the diff — so references to pre-existing fixture endpoints could have been false-flagged (none were observed in the archives, but the hole was real). Fixed: the harness writes `postrun-sources.txt`, and the grader additionally resolves endpoints against the fixture's `symbols.json` manifest (previously generated but unread).

Related hardening in the same review, none of which affects archived numbers: the auto-continuation session now passes the auth-validity guard, archives are cleared before re-runs, the `--spec` argument is derived from the fixture instead of defaulted, the node-test summary parse is anchored, the run lock is atomic, and `commands/architecture.md`'s `# PROCESS` heading (clobbered by the `# DIAGRAMS` insertion) was restored.

## What the re-grade changed

Only the hallucinated-reference columns. Every other metric — passes, tokens, scope, drift, questions — reproduced identically.

| Campaign           | A (was → is) | B (was → is) | C (was → is) |
| ------------------ | ------------ | ------------ | ------------ |
| Phase 1 (ShipLog)  | 0.0 → 0.0    | 0.0 → 0.2    | 0.0 → 0.8    |
| Phase 2 (MeterHub) | 0.0 → 0.0    | 0.0 → 2.3    | —            |
| Phase 3 (Atlas)    | 0.0 → 0.0    | 0.0 → 0.0    | —            |

## What the corrected flags actually are

Every flagged reference was inspected. None invents a service, endpoint, or integration that does not exist conceptually. They are two mundane kinds:

- **Planned-but-never-created paths**: tasks.md names a new file the plan intends (e.g. `clients/tracking-view.js`, which the B/C arm documents themselves introduce) and the run then implements that responsibility elsewhere or not at all. The pre-registered definition ("a reference that fails to resolve against the post-run tree") counts these mechanically; semantically they are unrealized plan items — a drift-family signal, not an invented integration.
- **`src/`-segment omissions**: paths like `services/ingest-api/routes/meters.js` for the real `services/ingest-api/src/routes/meters.js`.

The arm asymmetry (A stays at zero) is therefore largely an artifact of the treatment itself: the B/C documents name planned components, so their tasks documents reference paths that may never materialize; the prose-only arm never names paths at all. The metric as registered conflates "invented integration" with "unrealized planned path" — a limitation to fix (e.g. by excluding references the context documents themselves introduce) before this metric is used as a gate in any future campaign.

## Corrected program-level claims

- Old claim: "zero hallucinated references in 90 runs." Corrected claim: **"zero invented integrations in 90 runs; arm A showed zero unresolvable references of any kind; arms B/C showed a small number of unresolvable references, all of which are unrealized planned paths or `src/`-omitted spellings, not invented services or endpoints."**
- The v2 proposal's "fewer hallucinated integrations" claim remains retired: the failure mode it predicts (inventing integrations) was never observed in either arm.
- Phase 3's decision to drop hallucination from the success rule is retroactively reinforced: the metric was measuring plan-path realization, not hallucination.
