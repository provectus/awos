# C4 Diagrams in AWOS Specs — What the Evidence Shows

**Audience:** AWOS maintainers and stakeholders evaluating the C4 diagram proposal.
**Basis:** 60 measured A/B runs (plus 10 mechanism-control runs) across three synthetic fixtures, 2026-10-12 → 2026-10-14, pinned `claude-sonnet-5-5`, pre-registered protocol. This document synthesizes the dated notes — `c4-diagram-eval-plan.md` (design), the three results notes, and `2026-10-14-c4-eval-effect-sizes.md` (effect sizes) — into the one-page case. Every number is reproducible from the archived runs.

## The claim, stated precisely

Adding C4 Context/Container diagrams to `architecture.md` (and a Component diagram to the tech spec) **improved implementation accuracy in every case we measured, at a median token cost of ~3% or less, and reduced the cost per successful implementation.** The effect is moderate and consistent, not dramatic: it did not clear pre-registered gates designed to detect a large effect at n=10, which is why the formal recommendation is _optional_, not _required_.

## How diagrams improved each case

The three fixtures span the difficulty range an AWOS feature actually lives in. In **all three**, the diagram arm (B) beat the prose-only baseline (A) on both accuracy metrics.

### Case 1 — Straightforward feature, modest codebase (ShipLog: 2 services, ~60 files)

A feature crossing one container boundary, well within the model's comfort zone.

|                                 | Prose only (A) | With diagrams (B) | Improvement |
| ------------------------------- | -------------- | ----------------- | ----------- |
| Complete implementations        | 6/10           | **8/10**          | +2          |
| Broken contracts per run (mean) | 0.7            | **0.4**           | −43%        |
| Tasks↔implement drift items     | 6.7            | **5.3**           | −21%        |
| Tokens (median)                 | 4,008          | 4,117             | +2.7%       |

What the diagram bought here: the Container diagram fixed the one structural fact the prose left ambiguous (who publishes to the queue, who consumes), and runs stopped losing points on exactly that class of error. **This case also carried the mechanism control (arm C):** the _same information_ rendered as generated text instead of a diagram scored _worse than the baseline_ (3/10) — the notation itself, not just the extra explicitness, is what helps.

### Case 2 — Moderate feature, mid-size system (MeterHub: 3 services, ~75 files)

A boundary-crossing feature on a fixture with deliberate naming traps and misdirection.

|                                 | Prose only (A) | With diagrams (B) | Improvement |
| ------------------------------- | -------------- | ----------------- | ----------- |
| Complete implementations        | 8/10           | **9/10**          | +1          |
| Broken contracts per run (mean) | 0.8            | **0.5**           | −38%        |
| Tasks↔implement drift items     | 10.6           | **9.8**           | −8%         |
| Tokens (median)                 | 4,378          | **4,342**         | −0.8%       |
| Wall-clock (mean)               | 40s            | **37s**           | −8%         |

The baseline was already strong here (a ceiling the pre-registered gate couldn't see past), but the diagram arm was still better on every metric — and _cheaper and faster_, because runs wasted less on reconstructing structure.

### Case 3 — Genuinely hard feature, large system (Atlas: 7 services, 240 files, 16 interlocking rules)

Calibrated so the baseline fails most of the time — the regime where structure actually strains.

|                                 | Prose only (A) | With diagrams (B) | Improvement                 |
| ------------------------------- | -------------- | ----------------- | --------------------------- |
| Complete implementations        | **0/10**       | **2/10**          | the only successes observed |
| Broken contracts per run (mean) | 14.0           | **11.5**          | −18%                        |
| Test-level accuracy             | 82.7%          | **85.8%**         | +3.1 pts                    |
| Tokens (median)                 | 6,820          | **6,793**         | −0.4%                       |

The distribution matters more than the means. The baseline's failing-test counts: `8, 14, 14, 14, 14, 14, 14, 14, 17, 17` — it reliably solved the same partial slice and reliably stalled. The diagram arm's: `0, 0, 1, 14, 14, 17, 17, 17, 17, 18` — three runs essentially or completely solved a feature the baseline never came close to. **On hard, coordination-heavy work, diagrams didn't shift the middle — they opened a path to complete success that otherwise did not exist**, at the cost of higher variance (bolder attempts also produced the campaign's one 57K-token flameout).

## The pooled picture (60 runs)

| Metric                                   | Prose only  | With diagrams                        |
| ---------------------------------------- | ----------- | ------------------------------------ |
| Complete implementations                 | 14/30 (47%) | **19/30 (63%)**                      |
| Broken contracts per run (median)        | 2           | **0**                                |
| Broken contracts per run (mean)          | 5.17        | **4.13** (−20%)                      |
| Tokens per run (median)                  | 4,698       | 4,850 (+3.2%)                        |
| **Tokens per successful implementation** | 11,184      | **10,740** (7,723 excl. one outlier) |

The last row is the budget argument in one line: even charging the diagram arm for its worst run, **a successful implementation costs fewer tokens with diagrams than without**, because the success-rate gain outweighs the small per-run overhead.

## Where diagrams did _not_ help — stated so the case stays honest

- **Invented integrations: none in 90 runs**, either arm, despite deliberate bait — not a real failure mode at this model tier and fixture scale, so the proposal stops citing it. (The corrected grader counts a handful of unresolvable references in the diagram/text arms — unrealized planned paths and src-omitted spellings, an artifact of those arms naming planned components; details in `2026-10-16-c4-eval-grader-correction.md`.)
- **Scope discipline on hard tasks:** on Atlas the diagram arm made _more_ out-of-scope edits (1.0 vs 0.1 per run) — ambition cuts both ways.
- **Tail spend:** one diagram run in 30 ran away (57K tokens, still failed). Rare, but real; diagrams make the agent try harder, and on near-impossible tasks that can burn budget.
- **Formal gates:** only one of three campaigns cleared its pre-registered bar. The effect-size addendum shows the bars were implicitly calibrated for a ~+20-point effect at n=10; the true effect is ~+17 points, below per-campaign detectability. "Consistent and moderate" is the honest effect size — not "proven large".

## Practical guidance this supports

1. **Include Context + Container diagrams in `architecture.md` by default** (as the optional convention the program recommends): the measured downside is ~3% median tokens and the measured upside appears at every difficulty level.
2. **The payoff scales with coordination load.** On simple features diagrams shave errors; on hard cross-container features they are, in this data, the difference between never succeeding and sometimes succeeding completely. Specs for multi-service work benefit most — exactly the Component-diagram-when-boundaries-are-crossed rule the proposal already contains.
3. **Don't substitute generated edge-list text for a diagram.** The arm-C result says the textual equivalent of a diagram performs worse than nothing; if structure is worth stating, draw it.
4. **Keep diagrams accurate.** Every measured benefit came from diagrams verified against source before the runs. The proposal's verify-step staleness checkbox remains load-bearing: agents trust diagrams, so a wrong one is worse than none (untested here, asserted by design).

## Reproducing or extending

Harness and fixtures: `tools/c4-evals/` + `tests/fixtures/eval-c4-multiservice{,-2,-4}/`. A campaign is ~20 headless runs, a few hours of wall-clock on a subscription account. To upgrade "optional" to "required", the needed evidence is either a properly powered campaign (n≈80–100 per arm, median-based token gate) or accuracy/drift data from a pilot on real projects.
