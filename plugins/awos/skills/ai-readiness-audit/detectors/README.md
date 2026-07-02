# Detectors

Detectors inspect a checked-out repository on disk and return a structured verdict per capability category. They are the determinism layer: given the same repo tree they always produce the same result.

## Detector contract

Each per-dimension module exports named `detect*` functions — one per category it covers — plus a `DETECTORS` registry mapping each `standards.toml` category code to its function:

```ts
export function detectRateLimiting(
  repoPath: string,
  params?: unknown
): DetectorResult;

export const DETECTORS: Record<
  number, // standards.toml category code, e.g. 3008
  (repoPath: string, params?: unknown) => DetectorResult
> = { 3008: detectRateLimiting /* … */ };
```

Judgment categories have no detector: `audit-core` emits them as `PENDING_JUDGMENT` and the orchestrator's judgment patch decides them.

`DetectorResult` is the object returned by `makeResult`:

```ts
{
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  value: unknown;
  evidence: string[];
  method: string;
  score: number;      // fraction of capability present, ∈ [0,1]
  confidence: number; // fraction of applicable surface measured, ∈ [0,1]
}
```

| Field        | Type                                   | Description                                                                                                                                                   |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`     | `'PASS' \| 'WARN' \| 'FAIL' \| 'SKIP'` | Verdict. `SKIP` when the category is not applicable to this repo (e.g. no Python files when checking a Python-specific rule).                                 |
| `value`      | `unknown`                              | Quantitative or structured finding (count, ratio, boolean). Exact shape is category-specific.                                                                 |
| `evidence`   | `string[]`                             | Human-readable supporting facts — typically `file:line snippet` strings or aggregated counts. May be empty.                                                   |
| `method`     | `string`                               | How the verdict was derived. Defaults to `'detected'`; override with e.g. `'heuristic'` or `'ast'` when relevant.                                             |
| `score`      | `number`                               | Fraction of the capability present, ∈ [0,1]. Load-bearing for weighting: defaults to PASS=1, WARN=0.5, FAIL=0, SKIP=0; pass an explicit fraction to override. |
| `confidence` | `number`                               | Fraction of the applicable surface actually measured, ∈ [0,1]. Defaults to 0 on SKIP and 1 otherwise.                                                         |

The engine uses the `status` field verbatim when aggregating the per-dimension report. It never re-interprets or overrides a verdict; computed vs. detected distinctions are resolved here, inside the detector, not upstream.

## One module per dimension

Each dimension listed in `dimensions/` that requires automated checking has a corresponding detector file named after the dimension slug (underscored), for example:

```text
detectors/code_architecture.ts   ← dimension: code-architecture
detectors/quality_assurance.ts   ← dimension: quality-assurance
```

## Determinism rules

- Scans are **sorted**: `iterFiles` and `grep` both return results in lexicographic order so that evidence arrays are stable across runs.
- **No clocks**: detectors never read `Date.now()` or wall time. Time-based signals come from collector artifacts (pre-gathered by collectors), not from the detector itself.
- **Hermetic tests**: test fixtures create isolated tmp directories (`mkdtempSync`) with fully synthetic file trees. No test reads from the actual repository tree.

## Shared helpers (`_base.ts`)

```ts
makeResult(status, value, evidence, method = 'detected', score?, confidence?) → DetectorResult
```

Validates `status ∈ {PASS, WARN, FAIL, SKIP}` and returns a frozen-shape object. Throws if `status` is invalid. When `score`/`confidence` are omitted it applies the defaults from the table above.

```ts
iterFiles(repoPath, globs, ignore = DEFAULT_IGNORE) → string[]
```

Returns sorted absolute paths for all files under `repoPath` matching any of the `globs` patterns, skipping directories listed in `ignore`. `DEFAULT_IGNORE` is the deduplicated union of `DIR_MARKERS` from `generated.ts` (~20 build/cache/vendor directories: `node_modules`, `dist`, `build`, `.next`, `vendor`, `.venv`, `site-packages`, `.tox`, `.gradle`, `.terraform`, …) plus `.git`, `__pycache__`, and `target`, which only the file walker needs. In addition, every walk unconditionally prunes `context/audits/` (`AUDIT_OUTPUT_DIR`), regardless of the `ignore` argument — the audit writes its own artifacts there, and scanning them would let the audit score its own output, inflating every subsequent run. Implemented via `find` (shelled out with `execFileSync`) for speed on large trees.

```ts
grep(repoPath, pattern, globs, flags?) → Array<{ file: string; line: number; text: string }>
```

Scans every file returned by `iterFiles(repoPath, globs)` for lines matching `pattern` (a `RegExp`). Returns results sorted by `file` then `line`. `file` is relative to `repoPath`. `grep`/`find` may be shelled out for speed on large repos; the contract (`{file, line, text}` sorted) is identical regardless of implementation path.

## AST-level checks

When a text/glob scan is insufficient — e.g. to detect structural patterns in Python or JavaScript ASTs — `web-tree-sitter` is the approved dependency. Import it only inside the detector that needs it; `_base.ts` does not depend on it.
