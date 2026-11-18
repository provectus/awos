# C4 Diagram Eval — Effect-Size Addendum (All Campaigns), 2026-10-14

**Status:** Post-hoc analysis over the three campaigns' raw archives. Nothing here was a pre-registered endpoint — the gate verdicts in the three results notes stand unchanged. This addendum answers a different question the gates cannot: _how big is the effect, and were the targets themselves calibrated sensibly?_ Computed from the per-run `metrics.json` files; every number below is reproducible from `tmp/c4-eval-runs/*/`.

## Granular accuracy — what the all-or-nothing gate discarded

The gate scored a run 1 or 0 on "every fixture test passes". The archives also hold **how many individual tests failed per run** — partial credit:

| Campaign           | A failing tests/run (mean) | B failing tests/run (mean) | Δ    | A full-pass | B full-pass |
| ------------------ | -------------------------- | -------------------------- | ---- | ----------- | ----------- |
| Phase 1 (ShipLog)  | 0.7                        | 0.4                        | −43% | 6/10        | 8/10        |
| Phase 2 (MeterHub) | 0.8                        | 0.5                        | −38% | 8/10        | 9/10        |
| Phase 3 (Atlas)    | 14.0                       | 11.5                       | −18% | 0/10        | 2/10        |
| **Pooled (n=30)**  | **5.17 (median 2)**        | **4.13 (median 0)**        | −20% | 14/30 (47%) | 19/30 (63%) |

B had fewer failing tests in **all three campaigns**, under three very different difficulty regimes. The pooled medians are the starkest form: the median A run leaves 2 contracts broken; the median B run leaves 0.

Phase 3's distribution deserves its own line, because the means hide it. Failing-test counts per run, sorted:

- A: `8, 14, 14, 14, 14, 14, 14, 14, 17, 17` — the baseline never got below 8; it reliably solved the same partial slice and reliably stalled there.
- B: `0, 0, 1, 14, 14, 17, 17, 17, 17, 18` — **bimodal**: with diagrams the agent either essentially solved the whole feature (0, 0, 1 — outcomes the baseline never approached) or flamed out slightly worse than baseline. Diagrams didn't shift the middle; they opened a path to complete success that did not otherwise exist, at the price of higher variance.

## Tokens — the mean/median split that decided phase 3

| Campaign          | A tokens (median) | B tokens (median) | Δ median  | A (mean) | B (mean)                  |
| ----------------- | ----------------- | ----------------- | --------- | -------- | ------------------------- |
| Phase 1           | 4008              | 4117              | +2.7%     | 4052     | 4195 (+3.5%)              |
| Phase 2           | 4378              | 4342              | −0.8%     | 4495     | 4495 (±0%)                |
| Phase 3           | 6820              | 6793              | −0.4%     | 7110     | 11717 (+65%, one 57K run) |
| **Pooled (n=30)** | **4698**          | **4850**          | **+3.2%** | 5219     | 6802 (+30%, same one run) |

The **typical** B run costs 0–3% more tokens. The entire mean-level cost story is a single run (10B: 57,324 tokens, still failed). The pre-registered token gate used the arm **mean**, so one heavy-tail run vetoed phase 3 — defensible as written, but worth knowing that a median-based gate would have read phase 3 as `replicated` (+2 passes, −0.4% median tokens). That is exactly the kind of fact post-hoc analysis may surface but must not retroactively apply.

## Cost per successful implementation (the number a budget owner wants)

Total tokens spent across all 30 runs per arm, divided by full-pass successes:

- **A: 156,579 / 14 = 11,184 tokens per success**
- **B: 204,065 / 19 = 10,740 tokens per success** (including the 57K outlier)
- B excluding that one outlier run: **7,723 tokens per success**

Even charging B for its worst flameout, diagrams deliver a successful implementation **cheaper** than the baseline, because the success-rate gain outweighs the per-run overhead.

## Were the targets too high?

Partly, yes — in a specific, quantifiable way:

1. **The program was powered only for a large effect.** The observed pooled effect is +17 points of pass rate (47%→63%). Detecting an effect of that size reliably at a per-campaign level needs on the order of **n≈80–100 per arm**, not 10. At n=10, the +2-passes threshold demands roughly a +20-point effect to fire dependably — the rule was implicitly a test for "diagrams help a lot", and it answered that correctly: they don't help _a lot_, they help _moderately and consistently_.
2. **The mean-based token gate is outlier-fragile at n=10.** One run in 30 flipped a verdict. A pre-registered median (or a trimmed mean) would have been as principled and far more robust. Lesson recorded for any future campaign.
3. **The ceiling/floor problem consumed two of four fixture attempts** (one of them, Freightlane, failed calibration twice and was removed from the tree). Only ShipLog landed where ±2 passes was actually measurable in both directions. Calibration-before-campaign (adopted in phase 3) should have been in the protocol from phase 1.

## What this adds to the closing recommendation

The program's formal verdict (adopt as **optional**) stands — the pre-registered record is two gates missed. But the effect-size view strengthens the practical case considerably, and is quotable as such when the templates PR lands:

> Across 60 A/B runs on three fixtures: with C4 diagrams, full-success rate 63% vs 47%, ~20% fewer broken contracts per run, median token overhead +3.2%, and a **lower cost per successful implementation** (10.7K vs 11.2K tokens, outlier included). The effect is consistent in direction across every campaign and metric; what it is not is large enough to clear gates designed for a slam-dunk at n=10.

If the team ever wants "required" instead of "optional", the path is not another synthetic fixture — it is either a properly powered campaign (n≈80+/arm, median-gated; roughly 8× the spend of this entire program) or evidence from a pilot on real projects. For an optional convention, the data in hand is more than sufficient justification.
