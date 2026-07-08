# Run-to-run non-determinism: judgment checks flip status on identical code, plus minor connector/window drift

**Severity:** medium-high — re-running the audit against the exact same commit of both the engine and the target produces a different score. 46 of 832 scored checks (5.5%) differ between two runs pinned to the identical engine commit against the identical target state, and several of those differences are outright status flips (`PASS`/`WARN`/`FAIL`), not just reworded evidence text. This means two audits of the same codebase, run minutes apart, can hand a repo a different verdict on the same security/architecture question.

Locations are `file:line` within `plugins/awos/skills/ai-readiness-audit/` unless noted.

## How this was found

Three full org-mode `/awos:ai-readiness-audit` runs against the same 8-repo org target (`provectus-barhopping`, non-git parent folder), via `tools/ai-readiness-audit/qa/run_audit_test.ts`. The last two runs were pinned to the identical engine commit (`cddf91f`, clean worktree, `--build` so `dist/` matched source exactly) with zero code change between them — a true same-code, same-target determinism check. All 832 scored checks (104 categories × 8 repos) were diffed field-by-field (`status`, `value`, `weight_awarded`, `applies`, `method`).

Result: **46/832 checks differed** even with nothing changed. Root causes split into three independent sources.

## Root cause 1: judgment checks are single-shot, unreplicated LLM grades (32 of 46 diffs)

Exactly 5 of ~104 scored categories use `method = "judgment"` (`references/standards.toml`):

| check_id | dimension            | weight | line  |
| -------- | --------------------- | -----: | ----: |
| ARCH-03  | code-architecture     |      3 |   419 |
| AS-10    | application-security  |      8 |   859 |
| AS-11    | application-security  |      5 |   878 |
| AI-01    | ai-development-tooling |    8 |  1321 |
| AI-06    | ai-development-tooling |    5 |  1403 |

Each is graded by a single, independent `Agent` subagent call per check per repo (`SKILL.md:112`), fed only the check's `rubric` and `evidence_required` from `standards.toml` and the repo path, returning one verdict object (`{check_id, status, score, value?, evidence[]}`) that gets applied verbatim via `patch-judgment` (`SKILL.md:139-151`, `audit_patch.ts:217-254`) — there is no repeat-sampling, no self-consistency voting, no cross-check between runs. A single LLM call, one shot, decides a security/architecture verdict worth up to 8 weight points.

On the identical commit, identical target state, these subagents reached **different verdicts**, not just different phrasing:

| repo       | check   | run 2  | run 3  |
| ---------- | ------- | ------ | ------ |
| barley     | ARCH-03 | WARN   | PASS   |
| hops       | AI-06   | WARN   | PASS   |
| hops       | AS-11   | WARN   | PASS   |
| hops-mcp   | ARCH-03 | PASS   | WARN   |
| sowa       | AI-01   | PASS   | WARN   |

Full field-level evidence (46 diffs across all 8 repos, both `value` wording and any `status`/`weight_awarded` changes): `data/judgment-nondeterminism-samecommit-diff.txt`.

## Root cause 2: connector fetch flakiness flips `applies` (3 of 46 diffs)

`ADP-08` and `ADP-09` are connector-backed metrics (CI/tracker fetch, re-scored by `enrich`). Across the three runs, whether the connector's first-page fetch succeeded varied run to run — when it failed silently, the check reports `SKIP` with `applies: false` instead of a real value; when it succeeded, `applies` flips to `true` and a real value/weight is awarded. Example: `sowinsights ADP-09` went `PASS(applies=true, value=276.375, weight=3)` → `SKIP(applies=false, value=None, weight=0)` between the two same-commit runs. This is not a scoring bug in the metric itself — it is unreported fetch flakiness surfaced as a scoring difference with no indication in the report that the connector was unreachable that run.

## Root cause 3: rolling git-window computed metrics drift with wall-clock (10 of 46 diffs)

`DF-02`, `DF-03`, `DF-05` are `method = "computed"` (fully deterministic given a fixed window) but their window is anchored to "now" rather than a fixed point, so as ~15-20 minutes pass between runs the window's trailing edge moves and pulls in/drops a commit or two. Example: `barley DF-02` 0.9746 → 0.9442 between runs with no target change. This is expected behavior for a rolling window, not a bug — but it means these metrics are not exactly reproducible for two runs separated by any nonzero wall-clock gap, only stable if run back-to-back or against a window anchored to a fixed commit/date rather than "now."

## Org-level impact

Across all three runs (run 1 at `244dfe8`-dirty; runs 2 and 3 both at the identical clean commit `cddf91f`):

| metric                      | run 1 (244dfe8-dirty) | run 2 (cddf91f) | run 3 (cddf91f) |
| ---------------------------- | ----------------------: | ----------------: | ----------------: |
| `org_ai_tooling_coverage`   |                  0.7619 |             0.7619 |             0.7619 |
| `org_measurement_coverage`  |                  0.6456 |             0.6566 |             0.6538 |
| `org_capability_score`      |                 261.2738 |            265.5548 |            264.3024 |

`org_ai_tooling_coverage` is `detected`-method and matched bit-for-bit across all three runs. `org_capability_score` and `org_measurement_coverage` roll up judgment/connector/computed checks and moved every time — including between the two runs on the identical commit (2 and 3), which is the evidence that this is run-to-run measurement noise, not a code regression.

## Evidence

- `data/judgment-nondeterminism-samecommit-diff.txt` — full 46-check diff, run 2 (`20260707T170204Z__awos-cddf91f`) vs run 3 (`20260707T181614Z__awos-cddf91f`), same engine commit, same target, ~1hr apart. Per-repo `audit_total`/`coverage` deltas plus every individual check field that changed.
- Archived runs (local, not committed — `<awos main checkout>/tmp/audit-runs/provectus-barhopping/`):
  - `20260707T151617Z__awos-244dfe8-dirty` — run 1
  - `20260707T170204Z__awos-cddf91f` — run 2
  - `20260707T181614Z__awos-cddf91f` — run 3 (identical commit to run 2)
- Org portfolio metrics, run 2 → run 3 (identical commit): `org_capability_score` 265.5548 → 264.3024, `org_measurement_coverage` 0.6566 → 0.6538, `org_ai_tooling_coverage` 0.7619 → 0.7619 (exact match — this one is `detected`, not judgment-derived).

## Expected / fix directions

- **Judgment checks (dominant source):** replicate each judgment subagent call N times (e.g. 3) and take a majority/median verdict, or run a second adversarial pass that must agree before a status is finalized — the same pattern already used elsewhere in this codebase for adversarial-verify review workflows. At minimum, surface a `confidence`/`agreement` signal so a report can flag "this verdict is unstable" rather than presenting a single-shot grade as settled fact.
- **Connector flakiness:** when a connector's first-page fetch fails, retry once before falling back to `SKIP`, and record the failure reason in the check's `evidence` so a report reader can tell "not configured" apart from "failed to fetch this run."
- **Rolling windows:** either accept the drift as inherent (document it — "this metric is only exactly reproducible for runs within the same window boundary") or anchor the window to the audited commit's timestamp rather than wall-clock "now," which would make `DF-02/03/05` fully deterministic for a fixed target commit regardless of when the audit runs.
- Consider surfacing all three sources as a single "reproducibility confidence" indicator in the report (distinct from the existing per-check `reliability` tag), so consumers of a re-run comparison know which deltas are real project change versus measurement noise.
