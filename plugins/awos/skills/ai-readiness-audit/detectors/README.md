# Detectors

Detectors inspect a checked-out repository on disk and return a structured verdict for a single audit dimension. They are the determinism layer: given the same repo tree they always produce the same result.

## Detector contract

Every per-dimension module exports exactly one function:

```ts
detect(repoPath: string, params: Record<string, unknown>): DetectorResult
```

`DetectorResult` is the object returned by `makeResult`:

```ts
{ status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP'; value: unknown; evidence: string[]; method: string }
```

| Field      | Type                                   | Description                                                                                                                    |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `status`   | `'PASS' \| 'WARN' \| 'FAIL' \| 'SKIP'` | Verdict. `SKIP` when the dimension is not applicable to this repo (e.g. no Python files when checking a Python-specific rule). |
| `value`    | `unknown`                              | Quantitative or structured finding (count, ratio, boolean). Exact shape is dimension-specific.                                 |
| `evidence` | `string[]`                             | Human-readable supporting facts — typically `file:line snippet` strings or aggregated counts. May be empty.                    |
| `method`   | `string`                               | How the verdict was derived. Defaults to `'detected'`; override with e.g. `'heuristic'` or `'ast'` when relevant.              |

The auditor uses the `status` field verbatim when aggregating the per-dimension report. It never re-interprets or overrides a verdict; computed vs. detected distinctions are resolved here, inside the detector, not upstream.

## One module per dimension

Each dimension listed in `dimensions/` that requires automated checking has a corresponding detector file named after the dimension slug, for example:

```
detectors/code-architecture.ts   ← dimension: code-architecture
detectors/quality-assurance.ts   ← dimension: quality-assurance
```

A detector that is not yet implemented returns `makeResult('SKIP', null, ['not yet implemented'])`.

## Determinism rules

- Scans are **sorted**: `iterFiles` and `grep` both return results in lexicographic order so that evidence arrays are stable across runs.
- **No clocks**: detectors never read `Date.now()` or wall time. Time-based signals come from collector artifacts (pre-gathered by collectors), not from the detector itself.
- **Hermetic tests**: test fixtures create isolated tmp directories (`mkdtempSync`) with fully synthetic file trees. No test reads from the actual repository tree.

## Shared helpers (`_base.ts`)

```ts
makeResult(status, value, evidence, method = 'detected') → DetectorResult
```

Validates `status ∈ {PASS, WARN, FAIL, SKIP}` and returns a frozen-shape object. Throws if `status` is invalid.

```ts
iterFiles(repoPath, globs, ignore = DEFAULT_IGNORE) → string[]
```

Returns sorted absolute paths for all files under `repoPath` matching any of the `globs` patterns, skipping directories listed in `ignore` (`.git`, `node_modules`, `dist`, `build`, `.venv`, `__pycache__`, `.next`, `target`). Implemented via `find` (shelled out with `execFileSync`) for speed on large trees.

```ts
grep(repoPath, pattern, globs, flags?) → Array<{ file: string; line: number; text: string }>
```

Scans every file returned by `iterFiles(repoPath, globs)` for lines matching `pattern` (a `RegExp`). Returns results sorted by `file` then `line`. `file` is relative to `repoPath`. `grep`/`find` may be shelled out for speed on large repos; the contract (`{file, line, text}` sorted) is identical regardless of implementation path.

## AST-level checks

When a text/glob scan is insufficient — e.g. to detect structural patterns in Python or JavaScript ASTs — `web-tree-sitter` is the approved dependency. Import it only inside the detector that needs it; `_base.ts` does not depend on it.
