# Scoring Algorithm

This file defines the additive weighted-category scoring model used by the AI-readiness audit. Category weights are declared in `references/standards.toml`; this file defines how those weights combine into dimension scores, a coverage ratio, and an audit total.

## Continuous Score Model

Each check now carries two orthogonal numeric fields alongside its status badge:

**`score` ∈ [0, 1]** — fraction of capability present. For a binary PASS/FAIL check this is 1.0 or 0.0. For a continuous metric (DORA rates, complexity, coverage ratios) the score is interpolated across the measured value's band anchors defined in the design. The band label (elite/high/medium/low) in `evidence` tells you which segment the raw value falls in; the score gives you the precise location within that segment.

**`confidence` ∈ [0, 1]** — fraction of the applicable surface that was actually measured. This is a metadata signal, not a quality discount — it does NOT reduce `weight_awarded`. A confidence of 0.5 means the engine measured 50% of the files/commits/definitions that this check covers (e.g. half the source files were in a grammar-supported language). Confidence 0 on a SKIP check means the check did not apply or no data was available at all.

### Weight awarded

```text
weight_awarded = round(weight_max × score, 1)
```

This replaces the former binary rule (`PASS → weight_max, else → 0`). A metric that scores 0.7 on a 2-point category earns 1.4 points. A metric at score 0 earns 0.

`round(..., 1)` means the value is rounded to one decimal place before storage and display.

## Status Vocabulary

Each check produces one of five statuses:

| Status  | Meaning                                                                       | `score`                                  | Weight awarded                         |
| ------- | ----------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| PASS    | Category fully satisfied                                                      | 1.0                                      | `weight_max`                           |
| PARTIAL | Continuously-scored metric: capability partially present                      | (0, 1)                                   | `round(weight_max × score, 1)`         |
| WARN    | Partial presence (detector-graded) or minor gap                               | 0.5 default, or the detector's own ratio | `round(weight_max × score, 1)`         |
| FAIL    | Category absent or not satisfied                                              | 0.0                                      | 0                                      |
| SKIP    | Inapplicable — `applies_when` condition is false, or no data source available | 0.0                                      | 0 (excluded from coverage denominator) |

PARTIAL is derived automatically from score when a metric-routed check is awarded: if `0 < score < 1`, the display badge becomes PARTIAL rather than PASS. A score exactly at 1.0 displays as PASS; exactly at 0.0 displays as FAIL. WARN is produced by detectors that define their own three-state grading; it is not re-derived from score.

## Per-Dimension Score

The dimension score is the sum of `weight_awarded` values across all applicable checks (those whose `applies_when` condition is true):

```text
dimension_score = Σ weight_awarded  for each check where applies_when = true
```

There are no deductions, no max-points ceiling, and no percentage transformation at this stage.

## Coverage Ratio

The coverage ratio expresses how much of today's defined standard a project has achieved within a dimension:

```text
coverage_ratio = Σ weight_awarded ÷ Σ weight_max
                 (both sums over applicable checks only)
```

Display as a percentage labeled **"relative to today's standard"**. This is not a grade — it is a current-state measurement that rises as capabilities improve and moves as `standards.toml` gains new categories.

## Audit Total

The audit total is the sum of all dimension scores, uncapped:

```text
audit_total = Σ dimension_score  across all audited dimensions
```

The total is not capped or normalized. As `standards.toml` gains categories the maximum possible total grows, keeping the score honest about the expanding standard.

## Confidence Display

The report shows a **Confidence** column (per check) and a weight-averaged **mean confidence** for each dimension. These are observability metadata:

- Per-check confidence = the fraction of the applicable surface measured for that specific check (e.g. 0.6 if 6 of 10 source files were grammar-parseable).
- Dimension mean confidence = `Σ(confidence × weight_max) ÷ Σ weight_max` over applicable (non-SKIP) checks.

Confidence does not discount `weight_awarded`. A check at confidence 0.4 and score 0.8 still earns `round(weight_max × 0.8, 1)` points. Confidence tells you how much to trust the score, not what the score is.

## Reliability

Each category carries a `reliability_default` field in `standards.toml` (`minimal`, `maximal`, or `not-reliable`), plus degradation rules computed at runtime from available sources. Reliability is reported beside the score for each metric — it is orthogonal to confidence and not part of the score.

## Priority Mapping (Recommendations Only)

Severity drives recommendation priority, not points. FAIL and WARN checks become recommendations at the priority level corresponding to their severity. PARTIAL checks are not recommendations — they represent partial capability, not an absence.

| Severity | Priority |
| -------- | -------- |
| critical | P0       |
| high     | P1       |
| medium   | P2       |
| low      | P2       |

Fixing a failing check raises `dimension_score` by `weight_awarded_new - weight_awarded_old` — the continuous gain, not a binary flip from 0 to weight_max.
