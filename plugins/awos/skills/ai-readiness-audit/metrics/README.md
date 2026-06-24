# metrics/\_base.ts — Metric Framework

This module is the foundation of the ADP measurement layer. All metric modules (`metrics/adp_*.ts`) import from here.

## Metric output contract

Every metric function returns an object with this exact shape (snake_case keys — consumed by the B.10 metric modules and the B.11 orchestrator):

```ts
{
  metric: string;           // metric ID, e.g. "adp_g1_tooling_depth"
  value: unknown;           // computed value (number, string, etc.) or null when SKIPped
  kind: string;             // value semantics: "raw" | "coverage" | "rate" | "score" | …
  band: string | null;      // DORA-style band label, or null when not banded
  categories_awarded: number[];  // category codes that earned points (empty on SKIP)
  reliability: {
    tag: string;            // regime name from standards.toml reliability_default
    confidence: "HIGH" | "MED" | "LOW";
    note: string | null;    // names missing sources, or null/empty when confidence is HIGH
  };
  sources_used: string[];   // collector sources that provided data
  sources_missing: string[]; // collector sources that were unavailable
  status: "OK" | "SKIP";   // see rule below
}
```

## Rules

### Read-only from artifacts

Metric modules never touch the repository directly. They read only from collector artifact JSON files written under `collected/<source>.json`. Any information not present in those artifacts is absent — metrics do not perform their own file walks or shell calls.

### ≥1 source computes / no source SKIPs

A metric result carries `status: "OK"` when at least one collector source was used (`sources_used` is non-empty), regardless of how many sources are missing. A result carries `status: "SKIP"` when `sources_used` is empty — there was no data to compute from. SKIPped results emit `value: null` and `categories_awarded: []`.

### Reliability computation

`computeReliability(defaultTag, sourcesUsed, sourcesMissing)` derives `confidence` from source availability:

| sourcesUsed | sourcesMissing | confidence |
| ----------- | -------------- | ---------- |
| any         | empty          | HIGH       |
| non-empty   | non-empty      | MED        |
| empty       | non-empty      | LOW        |

The `tag` is always passed through unchanged from `defaultTag` (the `reliability_default` value in `standards.toml`). The `note` field names the missing sources when confidence is MED or LOW; it is `null` or `""` for HIGH.

### Category award

`awardCategories(standards, metricName, predicateCtx)` returns the category codes from `standards.toml` whose `metric` matches `metricName` and whose `applies_when` condition is satisfied:

- `"always"` → always included.
- `"topology.<flag>"` → included when `predicateCtx[flag]` is truthy (topology flags come from the CI/tracker/docs availability checks run by the orchestrator).
