# Scoring Algorithm

This file defines the additive weighted-category scoring model used by the AI-readiness audit. Category weights are declared in `references/standards.toml`; this file defines how those weights are combined into dimension scores, a coverage ratio, and an audit total.

## Status Vocabulary

Each check produces one of four statuses. Status determines whether the associated category's weight is awarded:

| Status | Meaning                                          | Weight awarded                                                                |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| PASS   | Category present and fully satisfied             | Full `weight` from `standards.toml`                                           |
| WARN   | Partial presence or minor gap                    | Nothing by default (binary award; a category may define a partial rule later) |
| FAIL   | Category absent or not satisfied                 | Nothing                                                                       |
| SKIP   | Inapplicable — `applies_when` condition is false | Excluded from the coverage denominator                                        |

## Per-Dimension Score

The dimension score is the sum of weights for all awarded categories whose `applies_when` condition is true:

```
dimension_score = Σ weight  for each category where status = PASS and applies_when = true
```

There are no deductions, no max-points ceiling, and no percentage transformation at this stage. A category that is WARN, FAIL, or SKIP contributes zero.

## Coverage Ratio

The coverage ratio expresses how much of today's defined standard a project has achieved within a dimension:

```
coverage_ratio = awarded_weight ÷ applicable_defined_weight

where:
  awarded_weight           = dimension_score (sum of PASS category weights)
  applicable_defined_weight = Σ weight  of all categories for the dimension where applies_when = true
```

Display as a percentage labeled **"relative to today's standard"**. This is not a grade — it is a current-state measurement that moves as `standards.toml` gains new categories.

## Audit Total

The audit total is the sum of all dimension scores, uncapped:

```
audit_total = Σ dimension_score  across all audited dimensions
```

The total is not capped or normalized. As `standards.toml` gains categories the maximum possible total grows, which keeps the score honest about the expanding standard rather than hiding new gaps behind a ceiling.

## Reliability

Each category carries a `reliability_default` field in `standards.toml` (`minimal`, `maximal`, or `not-reliable`), plus degradation rules computed at runtime from available sources. Reliability is reported beside the score for each metric — it is not part of the score itself.

## Priority Mapping (Recommendations Only)

Severity drives recommendation priority, not points. Every check with a non-PASS status becomes a recommendation at the priority level corresponding to its severity:

| Severity | Priority |
| -------- | -------- |
| critical | P0       |
| high     | P1       |
| medium   | P2       |
| low      | P2       |

Severity is a property of the check, not the score. Fixing a P0 item raises `dimension_score` only if the check moves to PASS — not because it carried a higher deduction.
