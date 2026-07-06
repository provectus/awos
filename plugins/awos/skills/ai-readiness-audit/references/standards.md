---
title: 'standards.toml — capability-category data reference'
---

# standards.toml

`standards.toml` is the single source of truth for every scoring category used by the `ai-readiness-audit` plugin. It lives at `plugins/awos/skills/ai-readiness-audit/references/standards.toml` and is parsed at runtime by the TypeScript engine (`metrics/_base.ts` `loadStandards`, via `smol-toml`).

Prettier ignores `.toml` files, so format drift is caught by test layers instead: a JS regex-content lint test in `tests/lint-prompts.test.js` and the engine schema tests under `plugins/awos/skills/ai-readiness-audit/tests/` (`standards-schema.test.ts`, `scoring-config.test.ts`).

## Tables

### `[meta]`

Global constants that govern the cadence and history window for every metric.

| Key                   | Value                     | Meaning                                                                                                                      |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `max_lookback_days`   | `90`                      | Single measurement window (90 days); every windowed source (git, CI runs, tracker tickets, docs freshness) is bounded by it  |
| `rework_horizon_days` | `21`                      | Sub-window for the code-turnover descriptor: how recently a line must have been authored for its deletion to count as rework |
| `standards_version`   | string (e.g. `"2026.06"`) | Semantic version of this file; used to detect stale cached copies                                                            |
| `dimension_order`     | array                     | Report presentation order for dimensions                                                                                     |

These values are locked data — do not change them without a version bump and a migration plan, as the engine and the audit orchestrator both read them directly.

### `[category.<slug>]`

One table per scoring category:

| Key                               | Type   | Description                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code`                            | int    | Globally unique numeric code (used in metric output and reports)                                                                                                                                                                                                                                                                                                               |
| `check_id`                        | string | Report-facing check id (`DF-01`, `ADP-08`, …) — flat and contiguous per dimension, in file order                                                                                                                                                                                                                                                                               |
| `metric`                          | string | Which metric/check awards this category (e.g. `"tooling_depth"`) — matches `metrics/<metric>.ts`                                                                                                                                                                                                                                                                               |
| `dimension`                       | string | Owning audit dimension `name` (e.g. `"ai-sdlc-adoption"`)                                                                                                                                                                                                                                                                                                                      |
| `weight`                          | int    | Relative scoring weight. Starting heuristic: critical → 8, high → 5, medium → 3, low → 1                                                                                                                                                                                                                                                                                       |
| `method`                          | string | How the verdict is produced: `"computed"`, `"detected"`, or `"judgment"` (see the Method section below)                                                                                                                                                                                                                                                                        |
| `definition`                      | string | Plain-English description of what earns this category                                                                                                                                                                                                                                                                                                                          |
| `applies_when`                    | string | `"always"` or a topology predicate (e.g. `"topology.has_ci"`, `"topology.is_monorepo"`)                                                                                                                                                                                                                                                                                        |
| `sources`                         | array  | Which collectors provide the data: `"git"`, `"ci"`, `"tracker"`, `"docs"`, `"incident"`, `"audit"`                                                                                                                                                                                                                                                                             |
| `reliability_default`             | string | Locked vocabulary: `"minimal"` (true ≥ shown), `"maximal"` (true ≤ shown), or `"not-reliable"`                                                                                                                                                                                                                                                                                 |
| `source`                          | string | Citation name for the authority that justifies the category                                                                                                                                                                                                                                                                                                                    |
| `url`                             | string | Deep link to the page that defines the practice — and, for numeric checks, contains the numbers used                                                                                                                                                                                                                                                                           |
| `date` / `last_verified`          | string | Source publication date / when the link was last verified (maintained by the `standards-refresh` skill)                                                                                                                                                                                                                                                                        |
| `threshold` / `threshold_days`    | number | Optional measurement parameters some detectors read (e.g. QA-01's PASS bound, SCS-04's cooldown days)                                                                                                                                                                                                                                                                          |
| `pass_at` / `warn_at` / `fail_at` | number | Optional verdict-step thresholds (0..1 shares) passed to the category's detector. Higher-is-better checks declare `pass_at`+`warn_at` (≥ pass → PASS, ≥ warn → WARN, else FAIL); lower-is-better (bad-share) checks declare `fail_at`+`warn_at` (≥ fail → FAIL, ≥ warn → WARN, else PASS). Never both `pass_at` and `fail_at`. The prompt linter validates ranges and ordering |

The report's check-table rows render in this file's physical order within each dimension — keep `[category.*]` blocks sorted by `check_id`.

**`method`** classifies how the verdict is produced:

- `computed` — the verdict is a number from a metric or detector: ratios, counts, file sizes, complexity scores, coverage percentages. The auditor runs the computation and never overrides the result.
- `detected` — the verdict is a deterministic boolean signal that a regex, glob, AST parse, or config-presence check can decide. Examples: `.env` in `.gitignore`, lock file present, `strict: true` in tsconfig. The auditor runs the detector and never overrides the result.
- `judgment` — only used when no regex/glob/AST/config check can decide the verdict. Examples: "error handling is consistent across the codebase", "abstractions are appropriate", "documentation is accurate". Judgment categories additionally carry two required fields: `rubric` (a PASS/WARN/FAIL decision guide with sampling instructions) and `evidence_required` (a list of what the auditor must collect and report). Minimizing the judgment set is a design goal — it is what eliminates run-to-run variance. When torn between `detected` and `judgment`, choose `detected` and write the detector.

The `computed` and `detected` categories carry neither `rubric` nor `evidence_required`. Both the JS lint test (`tests/lint-prompts.test.js`) and the TypeScript engine schema test (`plugins/awos/skills/ai-readiness-audit/tests/standards-schema.test.ts`) enforce this invariant.

**`weight`** is data, not code. Retune a category's weight by editing this file — nothing else needs to change.

**`applies_when`** controls whether a category is scored. `"always"` means it is attempted for every repository. A topology predicate (e.g. `"topology.has_ci"`) means the category is skipped when the predicate is false, and the collector for that tier is unavailable.

**`reliability_default`** reflects the intrinsic reliability ceiling for the signal:

- `"maximal"` — presence does not imply active use; true usage is at most what is shown (e.g. an agent instruction file exists but may not be actively followed).
- `"minimal"` — the measurement is a floor; true value is at least what is shown (e.g. ai_attribution AI-attribution counts only commits with explicit markers — real usage is ≥ this).
- `"not-reliable"` — the metric is a proxy or trend indicator; banded comparison against DORA/DX Core 4 thresholds is the signal, not the raw number.

### `[category.<slug>.scoring]`

The declared score curve for every metric whose score is not simply the measured 0..1 fraction. The engine (`metrics/_score.ts` `scoringFor`) refuses to score a banded metric whose category lacks this table — a curve that exists only in code is treated as made-up numbers.

| Key           | Type   | Description                                                                                                                                                                                                 |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scale`       | string | `"linear"` or `"log"` — interpolation between anchors (log for values spanning orders of magnitude)                                                                                                         |
| `anchors`     | array  | `[[value, score], …]`, strictly increasing in value; score is the 0..1 award at that value, clamped outside                                                                                                 |
| `anchor_unit` | string | What the anchor values are measured in (reviewer documentation)                                                                                                                                             |
| `basis`       | string | `"published"` (anchors transcribe the cited page), `"derived"` (boundaries published, scores are AWOS calibration), or `"heuristic"` (the source publishes no numbers — anchors are declared AWOS judgment) |
| `basis_note`  | string | Required for `derived`/`heuristic`: which values are sourced and which are AWOS judgment                                                                                                                    |

Metrics whose score IS the measured fraction (doc coverage, spec coverage, AI attribution, tooling depth, and the weight-0 descriptors) carry no `scoring` table — there is no curve to configure.

The `standards-refresh` skill's Pass 3 re-verifies every `scoring` table against its category's cited page and stops with a question when a curve turns out to be unsourced.

### `[band.<slug>]`

One table per banded metric. Band tables define the human-readable DORA-style threshold tiers (`elite` / `high` / `medium` / `low`) shown in the report; the numeric score curve lives in `[category.<slug>.scoring]`.

| Key                                 | Description                             |
| ----------------------------------- | --------------------------------------- |
| `metric`                            | Which metric this band table applies to |
| `source`                            | Citation for the band thresholds        |
| `elite` / `high` / `medium` / `low` | Human-readable threshold strings        |

## Overriding the defaults

To use custom thresholds or add project-specific categories, edit the bundled `standards.toml` in place, or keep a project-local copy and point the engine at it. Weights, bands, scoring curves, and category definitions are all data — no code changes are needed to retune them.
