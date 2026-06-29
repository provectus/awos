---
title: 'standards.toml — capability-category data reference'
---

# standards.toml

`standards.toml` is the single source of truth for every scoring category used by the `ai-readiness-audit` plugin. It is a TOML file that lives at `plugins/awos/skills/ai-readiness-audit/references/standards.toml` in the AWOS repo and is parsed at runtime by the metric scripts via `python3 -c 'import tomllib'` (Python 3.11+ built-in; no extra dependencies).

Prettier ignores `.toml` files, so format drift is caught by two test layers: a JS regex-content lint test in `tests/lint-prompts.test.js`, and a pytest schema test (added in Task A.3) that loads the file via `tomllib` and validates all required keys.

## Tables

### `[meta]`

Global constants that govern the cadence and history window for every metric.

| Key                   | Value                     | Meaning                                                             |
| --------------------- | ------------------------- | ------------------------------------------------------------------- |
| `monthly_bucket_days` | `30`                      | Duration of a single measurement bucket in days                     |
| `max_lookback_days`   | `730`                     | Maximum history window (2 years); bounded by minimal source history |
| `standards_version`   | string (e.g. `"2026.06"`) | Semantic version of this file; used to detect stale cached copies   |

These values are locked data — do not change them without a version bump and a migration plan, as metric scripts and the audit orchestrator both read them directly.

### `[category.<slug>]`

One table per scoring category. Every category table declares exactly eleven required keys, plus `rubric` and `evidence_required` for `judgment` categories:

| Key                   | Type   | Description                                                                                             |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `code`                | int    | Globally unique numeric code (used in metric output and reports)                                        |
| `metric`              | string | Which metric/check awards this category (e.g. `"adp_g1_tooling_depth"`)                                 |
| `dimension`           | string | Owning audit dimension `name` (e.g. `"ai-sdlc-adoption"`)                                               |
| `weight`              | int    | Relative scoring weight. Starting heuristic: critical → 8, high → 5, medium → 3, low → 1                |
| `method`              | string | How the verdict is produced: `"computed"`, `"detected"`, or `"judgment"` (see the Method section below) |
| `definition`          | string | Plain-English description of what earns this category                                                   |
| `applies_when`        | string | `"always"` or a topology predicate (e.g. `"topology.has_ci"`, `"topology.is_monorepo"`)                 |
| `sources`             | array  | Which collectors provide the data: `"git"`, `"ci"`, `"tracker"`, `"docs"`, `"incident"`, `"audit"`      |
| `reliability_default` | string | Locked vocabulary: `"minimal"` (true ≥ shown), `"maximal"` (true ≤ shown), or `"not-reliable"`          |
| `source`              | string | Citation name — must match a key in the `[source.*]` table below                                        |

**`method`** classifies how the verdict is produced:

- `computed` — the verdict is a number from a metric or detector: ratios, counts, file sizes, complexity scores, coverage percentages. The auditor runs the computation and never overrides the result.
- `detected` — the verdict is a deterministic boolean signal that a regex, glob, AST parse, or config-presence check can decide. Examples: `.env` in `.gitignore`, lock file present, `strict: true` in tsconfig. The auditor runs the detector and never overrides the result.
- `judgment` — only used when no regex/glob/AST/config check can decide the verdict. Examples: "error handling is consistent across the codebase", "abstractions are appropriate", "documentation is accurate". Judgment categories additionally carry two required fields: `rubric` (a PASS/WARN/FAIL decision guide with sampling instructions) and `evidence_required` (a list of what the auditor must collect and report). Minimizing the judgment set is a design goal — it is what eliminates run-to-run variance. When torn between `detected` and `judgment`, choose `detected` and write the detector.

The `computed` and `detected` categories carry neither `rubric` nor `evidence_required`. Both the JS lint test (`tests/lint-prompts.test.js`) and the TypeScript engine schema test (`plugins/awos/skills/ai-readiness-audit/tests/standards-schema.test.ts`) enforce this invariant.

The TOML is parsed in Node via `smol-toml` (no Python required for the test layer; the audit prompt itself uses `python3 -c 'import tomllib'` at runtime).

**`weight`** is data, not code. Retune a category's weight by editing this file — nothing else needs to change.

**`applies_when`** controls whether a category is scored. `"always"` means it is attempted for every repository. A topology predicate (e.g. `"topology.has_ci"`) means the category is skipped when the predicate is false, and the collector for that tier is unavailable.

**`reliability_default`** reflects the intrinsic reliability ceiling for the signal:

- `"maximal"` — presence does not imply active use; true usage is at most what is shown (e.g. an agent instruction file exists but may not be actively followed).
- `"minimal"` — the measurement is a floor; true value is at least what is shown (e.g. ADP-G9 AI-attribution counts only commits with explicit markers — real usage is ≥ this).
- `"not-reliable"` — the metric is a proxy or trend indicator; banded comparison against DORA/DX Core 4 thresholds is the signal, not the raw number.

### `[band.<slug>]`

One table per banded metric. Band tables define the DORA-style threshold tiers (`elite` / `high` / `medium` / `low`) for metrics whose meaning comes from comparing to industry benchmarks rather than from the raw scalar.

| Key                                 | Description                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `metric`                            | Which metric this band table applies to                                       |
| `source`                            | Citation for the band thresholds — must match a key in the `[source.*]` table |
| `elite` / `high` / `medium` / `low` | Human-readable threshold strings                                              |

## Currently seeded categories (Task A.1)

This task seeds the `ai-sdlc-adoption` metric set:

- **ADP-G1** (tooling depth): `ai_tooling_claude_md` (101), `ai_tooling_skills` (102), `ai_tooling_commands` (103), `ai_tooling_hooks` (104), `ai_tooling_mcp` (105), `ai_tooling_spec_signals` (106)
- **ADP-G2** (contributors): `active_contributors` (201)
- **ADP-G3** (deploy frequency): `merge_frequency` (301) + `band.deploy_frequency`
- **ADP-G4** (lead time): `lead_time_for_change` (401) + `band.lead_time_for_change`
- **ADP-G5** (PR cycle time): `pr_cycle_time` (501)
- **ADP-G6** (churn): `code_churn` (601)
- **ADP-G7** (change fail rate): `change_failure_rate` (701) + `band.change_failure_rate`
- **ADP-G8** (review rework): `review_rework` (801)
- **ADP-G9** (AI attribution): `ai_attribution` (901) — `reliability_default = "minimal"`
- **ADP-C1** (CI pass rate): `ci_pass_rate` (1001) + `band.ci_pass_rate`
- **ADP-C2** (pipeline duration): `pipeline_duration_trend` (1002)
- **ADP-I1** (work mix): `work_mix_allocation` (1101) + `band.work_mix`
- **ADP-I2** (throughput): `issue_throughput` (1102)
- **ADP-I3** (MTTR): `mttr` (1103) + `band.mttr`
- **ADP-D1** (spec coverage): `external_spec_coverage` (1201)

The 11 existing audit dimensions' categories are added in Task A.4.

## Overriding the defaults

To use custom thresholds or add project-specific categories, copy this file to your project and point `sources.toml` at it:

```toml
[standards]
standards_file = "path/to/your/standards.toml"
```

The metric scripts load whichever file `sources.toml` points at; if no override is configured they fall back to the bundled copy.
