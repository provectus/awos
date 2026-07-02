# Explicitly broken metrics

Each measurement below contradicts the metric's own description. Locations are `file:line` within `plugins/awos/skills/ai-readiness-audit/`.

---

## B1 — QA-05 (test pyramid) classifies every Vitest test as e2e

**Severity:** high (any Vitest project fails the pyramid check regardless of its actual test shape).

**Where:** `detectors/quality_assurance.ts:40-42` — `E2E_CONTENT_RX` includes `vitest`:

```
const E2E_CONTENT_RX =
  /\b(playwright|cypress|puppeteer|selenium|webdriver|nightwatch|testcafe|detox|appium|supertest|vitest|k6|gatling|webdriverio|wdio|codeceptjs|robot\s+framework)\b/i;
```

The pyramid tier loop (`:485-511`) classifies a test file as **e2e** if its content matches `E2E_CONTENT_RX`. Vitest is a general-purpose unit-test runner, so a unit test that does `import { describe, it, expect } from "vitest"` is counted as e2e.

**Effect:** unit tier = 0, so `unitDominates` is false → "test pyramid is inverted" → FAIL, even for a textbook unit-heavy Vitest suite. Confirmed live: a fixture with 4 unit + 1 integration test reported `unit: 0 | integration: 1 | e2e: 4`. The only workaround was to enable Vitest *globals* so tests don't import the string `vitest`.

**Expected:** `vitest` (and arguably `supertest`, which is an HTTP assertion lib, not a browser e2e driver) should not be an e2e signal. E2E detection should rely on browser/e2e drivers + e2e dirs/config, not on the test runner name.

---

## B2 — ARCH-05 (file-naming consistency) counts standard test-file names as violations

**Severity:** high (un-passable for any TS/JS repo that has tests).

**Where:** `detectors/code_architecture.ts:406-460`. `classifyName` (`:428-431`) buckets a basename as snake_case / kebab-case / camelCase; thresholds (`:415-417`) are PASS ≥ 90%, WARN 70–89%, FAIL < 70%. The exclusion list (`:443`) drops index/`__init__`/config files **but not test files**.

A TypeScript test file is `foo.test.ts` / `foo.spec.ts` (the ecosystem's mandated convention — see the language table `languages.ts:48`). Its dotted basename matches none of snake/kebab/camel, so it counts as a naming *violation*.

**Evidence:** `data/arch05-evidence.json` — a repo of 3 snake_case source files + 3 standard `*.test.ts` files scores "dominant convention snake_case at only 50% → FAIL". To reach even the 70% WARN band you would need ~2.3× as many source files as tests; to PASS (90%) ~9× — i.e. a well-tested repo is structurally penalized for naming its tests correctly.

**Expected:** exclude test files from the naming check (they follow the *test-naming* convention, a separate axis), or evaluate them against `*.test.*`/`*.spec.*` rather than the source-file conventions. This also interferes with the QA metrics — see `02-metric-range-and-interference.md` §Interference.

---

## B3 — Self-pollution: the audit scores its own output directory

**Severity:** high (inflates every audit; makes two checks non-discriminating).

**Where:** `audit-core` writes its artifacts to `<repo>/context/audits/<date>/`. Two checks then read that directory as if it were project content:
- `metrics/adp_g1_tooling_depth.ts:46,60` — code **106** ("spec-driven signals") explicitly counts a bare `context/` directory, which the audit itself creates.
- `detectors/spec_driven_development.ts:14-43` — **SDD-01** ("AWOS installed": `.awos/` and `context/` present) sees `context/` from the output dir.

**Evidence:** `data/self-pollution-evidence.json` — an identical single-file Python repo, scored twice, differing *only* in where the output was written:

| output location | ADP-06 | SDD-01 | audit_total |
| --- | --- | --- | --- |
| inside repo (`<repo>/context/audits/…`) | PASS 8/8 | WARN 4/8 | 65 |
| outside repo | FAIL 0/8 | FAIL 0/8 | 53 |

A repo with **no** spec-driven signals scores +12 pts purely because the audit wrote its output into it. Because the real skill always writes in-repo, ADP-06/SDD-01 can never reach 0.

**Expected:** exclude the audit's own output dir (`context/audits/`) from all scans, or write output outside the scanned tree.

---

## B4 — No clamp when re-deriving `weight_awarded` from a patched score

**Severity:** medium (robustness; corrupts totals when the LLM mis-patches a judgment check).

**Where:** `audit_core.ts:558-564` (in `aggregate`, after the orchestrator patches judgment/connector checks):

```
c.weight_awarded = Math.round((c.weight_max || 0) * s * 10) / 10;
```

`s` (the patched score) is not clamped to `[0,1]`. If the orchestrator writes a score > 1 (observed live: a judgment check patched with `score`/weight 8 instead of a 0–1 fraction), `weight_awarded` exceeds `weight_max` (saw AI-01 = 64 / 8) and the audit total inflates (observed 429.9 vs the expected ~350). Nothing validates `weight_awarded ≤ weight_max`.

**Expected:** clamp `s` to `[0,1]` (and/or `weight_awarded` to `[0, weight_max]`) and surface a warning when a patch is out of range, so a bad patch can't silently inflate the score.

---

## B5 — DOC-06 scores 100% documentation coverage below full (suspected)

**Severity:** low. **Status:** anomaly, needs root-cause.

**Where:** `metrics/adp_g13_doc_coverage.ts` (coverage math `:288,297-298`) plus the DOC-06 check/score mapping.

**Evidence:** `data/doc06-evidence.json` — on a fully-documented TS module, DOC-05 and DOC-06 carry the **same** evidence ("6 of 6 public defs documented = 1.00") but:
- DOC-05 → score 1.0 (3/3)
- DOC-06 → score 0.857 (2.6/3)

The standalone metric returns `value=1.0, score=1.0`, so the loss is introduced at the DOC-06 check-level mapping, not in the coverage metric. Net effect: DOC-06 cannot reach its max even at 100% coverage.

**Expected:** 100% coverage should map to full DOC-06 credit (or the description/threshold should state why it does not).

---

## Consistency observations (engine-internal, surfaced during capture)

Not user-facing scoring bugs, but they bite any consumer of the artifacts:

- **Two checks share `check_id` `SBP-06`.** Codes 2704 (error-handling ratio) and 2706 (Python-2 except syntax) both render as `SBP-06` (the dimension-file heading parse in `audit_core.ts` maps codes → check_id by `### XXX-NN:` heading). Anything keying results by `check_id` (e.g. a baseline map) silently collapses the two. Give each category a distinct check_id.
- **Patched judgment checks leave `score` = 0 while `status` = PASS.** After the LLM patch, `weight_awarded`/`status` are set but the `score` field stays 0, so downstream that reads `score` disagrees with `status`/`weight_awarded`. Keep `score` consistent with the patch.
