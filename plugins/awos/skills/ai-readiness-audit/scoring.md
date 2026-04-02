# Scoring Algorithm

Each check produces a status:

| Status | Meaning                           |
| ------ | --------------------------------- |
| PASS   | Check satisfied                   |
| WARN   | Partial compliance or minor issue |
| FAIL   | Check not satisfied               |
| SKIP   | Not applicable to this project    |

Deductions are based on check severity (defined in each dimension file):

| Check Severity | FAIL deduction | WARN deduction |
| -------------- | -------------- | -------------- |
| critical       | 3 pts          | 1.5 pts        |
| high           | 2 pts          | 1 pt           |
| medium         | 1 pt           | 0.5 pts        |
| low            | 0.5 pts        | 0.25 pts       |

## Per-Dimension Score

```
max_points = sum of each check's severity weight (critical=3, high=2, medium=1, low=0.5)
deductions  = sum of FAIL and WARN deductions
raw_score   = max_points - deductions
pct         = (raw_score / max_points) * 100   (clamped to 0–100)
```

## Overall Score

```
overall_pct = average of all dimension percentages
```

## Grade Scale

| Grade | Range    |
| ----- | -------- |
| A     | 90 – 100 |
| B     | 75 – 89  |
| C     | 60 – 74  |
| D     | 40 – 59  |
| F     | 0 – 39   |

## Priority Mapping (for recommendations)

- **P0:** Critical severity FAILs
- **P1:** High severity FAILs + Critical WARNs
- **P2:** Medium/Low FAILs + High/Medium WARNs
