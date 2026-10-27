# C4 Diagram Eval — Phase-3 Results and Program Closure, 2026-10-14

**Status:** Final results note for the eval program pre-registered in `c4-diagram-eval-plan.md`, phase-3 protocol in `2026-10-13-c4-eval-phase3-plan.md`. Per that protocol, phase 3 is the last campaign on this question.

## Verdict

**The phase-3 readout: `not-replicated` — on the pass margin alone B qualified, but the token gate vetoed it.** Arm B (diagrams) passed 2/10 runs vs arm A's 0/10 — exactly the pre-registered +2 margin, and the only passes Atlas has ever produced — but B's mean total tokens came in at +65% over A (11,717 vs 7,110), far beyond the +15% budget, so the rule reads B ≈ A.

Per the pre-registered phase-3 readout table, `not-replicated` resolves the program to: **adopt C4 diagrams as an _optional_ template convention (the phase-2 note's option (a)) and stop measuring.**

## Campaign conditions and incidents

- Fixture: `tests/fixtures/eval-c4-multiservice-4` (Atlas, 240 files, 7 services), the only fixture of four to pass calibration (probe: 1/5 arm-A passes).
- 20 runs, 10 per arm, pinned `claude-sonnet-5-5`, Claude Code 2.1.272, subscription account.
- **Incident:** an overnight OAuth expiry invalidated five late runs (4-second sessions whose only output was an auth error, initially graded as 0-pass attempts). The harness now refuses sessions with no real usage (`assertSessionValid`), the five archives were purged, and the slots re-run ~12 hours later under the same pinned model. Consequence: strict A/B interleaving was broken for run slots 8–10 — a validity caveat that cuts both ways and is noted here rather than hidden.
- Raw archives: `tmp/c4-eval-runs/2026-10-13-p3/` (local, gitignored); per-run table in the archived `campaign-summary.md`.

## Per-arm summary

| Metric                    | A (baseline) | B (diagrams)  |
| ------------------------- | ------------ | ------------- |
| Runs                      | 10           | 10            |
| Fixture-tests passes      | 0            | **2**         |
| Hallucinated refs (mean)  | 0.0          | 0.0           |
| Out-of-scope edits (mean) | 0.1          | 1.0           |
| Total tokens (mean ± sd)  | 7110 ± 898   | 11717 ± 16037 |
| Duration ms (mean)        | 58953        | 251325        |
| Drift items (mean)        | 7.2          | 18.5          |

## Honest reading

1. **The token veto is one outlier run.** Run 10B spent 57,324 tokens (10× the arm median) grinding on the feature and still failed; it alone pushed B's mean past the gate (B's other nine runs averaged ~6,650 — _cheaper_ than A's mean). The rule uses the mean, the rule was written before the data, and so the verdict stands — but anyone reading the result should know its shape: B both produced the only successes and the only runaway spend. Diagrams appear to make the agent _try harder_ on a very hard problem: sometimes that lands (two full passes), sometimes it burns tokens without landing.
2. **Only diagram runs ever passed Atlas.** 0/15 valid A-runs across probe and campaign vs 2/10 B-runs. On a fixture hard enough that the baseline never succeeds, the only observed route to success went through the diagrams.
3. **B's passes came in the post-incident slots.** Both successes were reruns executed after the auth gap. Same pinned model and fixture, but the broken interleaving for those slots means a time-of-day or backend-drift explanation cannot be fully excluded. (Against that: rerun 9A and 10A, executed in the same window, still failed.)
4. **Secondary metrics flipped sign on the hard fixture.** B showed _more_ out-of-scope edits (1.0 vs 0.1) and more drift (18.5 vs 7.2, outlier-skewed) — on an easy fixture diagrams reduced wandering; on a near-impossible one they fueled more ambitious, wider-ranging attempts.
5. **No invented integrations, for the third campaign.** Across 90 valid runs, no arm ever referenced a service, endpoint, or integration that does not exist conceptually. _Correction 2026-10-16: the corrected grader shows small unresolvable-reference counts in phases 1–2's B/C arms (unrealized planned paths, src-omitted spellings — not invented integrations); phase 3 stays 0.0/0.0. See `2026-10-16-c4-eval-grader-correction.md`; no verdict is affected._

## The program's combined result (70 valid comparison runs, 3 campaigns)

| Campaign              | Fixture  | A passes | B passes | Gate met?                          |
| --------------------- | -------- | -------- | -------- | ---------------------------------- |
| Phase 1 (A/B/C, n=10) | ShipLog  | 6/10     | 8/10     | **Yes** (`notation-effect`)        |
| Phase 2 (A/B, n=10)   | MeterHub | 8/10     | 9/10     | No (+1, ceiling)                   |
| Phase 3 (A/B, n=10)   | Atlas    | 0/10     | 2/10     | No (margin yes, token gate vetoed) |

Direction: **B beat A on passes in all three campaigns, 19/30 vs 14/30 pooled** (pooling was not a pre-registered endpoint; stated for texture, not as evidence). Cost: ~0–3.5% token overhead in normal conditions, with a heavy-tail risk on very hard tasks. No campaign found diagrams making anything worse except the phase-3 wander/spend tail.

## Closing recommendation

Per the pre-registration: **adopt C4 diagrams as an optional convention in the `architecture` and `tech` templates, and close the measurement program.** The evidence for _requiring_ them did not clear the bar in two of three campaigns; the evidence that they are safe, cheap in the common case, and directionally helpful is consistent across all three. The proposal's real-project pilot can proceed on the optional convention and gather real-project experience, which is now more informative than a fourth synthetic campaign. If a future model tier or a real-repo replication reopens the question, the harness, fixtures, and pre-registration discipline in `tools/c4-evals/` are ready to reuse.
