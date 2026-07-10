# Collectors

Collectors gather raw data from a single external source (Git history, CI/CD APIs, issue trackers, etc.) and write one JSON artifact to disk. Every metric module reads those artifacts — it never reaches out to the source directly.

## Artifact contract

Each collector produces one file at `context/audits/<date>/collected/<source>.json`. The schema is:

```json
{
  "source": "git",
  "available": true,
  "reason_if_absent": null,
  "period": {
    "bucket_days": 30,
    "lookback_days": 730,
    "history_available_days": 400
  },
  "raw": { ... }
}
```

| Field                           | Type             | Description                                                                                     |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `source`                        | `string`         | Unique collector identifier (e.g. `"git"`, `"ci"`, `"docs"`). Matches the filename stem.        |
| `available`                     | `boolean`        | `true` when data was successfully retrieved, `false` when the source is absent or inaccessible. |
| `reason_if_absent`              | `string \| null` | Human-readable explanation when `available` is `false`; `null` otherwise.                       |
| `period.bucket_days`            | `number`         | Granularity of time buckets used in `raw` aggregates (e.g. 30 days = monthly).                  |
| `period.lookback_days`          | `number`         | Maximum history window requested from the source.                                               |
| `period.history_available_days` | `number`         | Actual history returned — may be less than `lookback_days` when the repo or project is younger. |
| `raw`                           | `unknown`        | Source-specific payload. Each metric declares which `raw` keys it reads.                        |

The `period` keys are the canonical time-window contract read by every metric. Do not rename them.

## Rules for collector authors

**One file per source.** Each collector writes exactly one `<source>.json`. Multiple logical concerns from the same API belong in a single collector with a richer `raw` object.

**Query once.** A collector runs once per audit execution and caches everything it fetches into `raw`. Metric modules must not invoke the source API themselves — they read `raw` only.

**SKIP when absent.** When a data source is unavailable (no credentials, no config file, API error), write the artifact with `available: false` and a clear `reason_if_absent` string. Metrics receiving an absent artifact skip their computation and surface the reason in the report rather than crashing.

## Shared helpers (`_base.ts`)

`makeArtifact(source, available, reasonIfAbsent, period, raw)` — constructs a typed artifact object with the exact snake_case keys above.

`writeArtifact(artifact, outDir)` — serialises the artifact to `<outDir>/<source>.json` (creates `outDir` if needed) and returns the absolute path.
