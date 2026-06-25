# Plan: headless-robust audit + detection coverage (`feat/ai-sdlc-metrics`)

Consolidated plan for three workstreams on the AWOS ai-readiness-audit engine (`plugins/awos/skills/ai-readiness-audit/`). Engine is TypeScript bundled by esbuild into `dist/cli.js`; `dist/` is committed and shipped; rebuild with `npm run build:engine` after any `.ts` edit and commit the regenerated `dist/`. CI runs `git diff --exit-code` on `dist/`. Engine tests need real Node (a Bun `node` shim breaks `node:test`); use `/opt/homebrew/bin`.

## Problem this plan solves

Run headless (`claude -p "/awos:ai-readiness-audit"`), the audit collapses: the orchestrator skips the deterministic engine entirely and the 11 dimension-auditor subagents hand-estimate `%`/letter-grade scores into markdown — no `audit.json`, no `report.html`, no per-dimension JSON. Reproduced across three runs (~$22). Investigation findings:

- **Not a loading/env problem.** The skill + `awos:dimension-auditor` agent load in `-p`; `${CLAUDE_SKILL_DIR}` substitutes to the real absolute path even inside code fences (verified empirically). The orchestrator had a valid engine path in its rendered instructions and still never called it.
- **Not an engine/runtime problem.** The engine runs correctly under the Bun-shim `node` (`standards`, `collect git`, `detect` all return real JSON).
- **It is a model-behavior problem under `-p` autonomy.** Asked to drive ~100 engine calls across an 11-subagent fan-out, headless Opus reverts to its "audit = read code, write graded markdown" prior. Prompt hardening (rigid Step-5 template, Step-6 gate, agent-level guard) did not change it.

Root fix: make the deterministic compute a **single unavoidable engine command**, and shrink the LLM to the slice that genuinely needs it.

## What is deterministic vs. LLM (engine data-flow map)

102 scored categories in `references/standards.toml`:

| Method | Count | Needs from the LLM | Engine entrypoint |
|---|---|---|---|
| `detected` | 70 | nothing — repo path only | `detect <code> <repoPath>` |
| `computed` | 27 | nothing — formula over collector artifacts | `metric <id> <repoPath> collected/` |
| `judgment` | 5 | LLM evaluates a rubric (AI-01, AI-06, ARCH-03, AS-10, AS-11) | — |

Detectors take **no connector params and no LLM-chosen arguments** — the misconception that "the LLM routes parameters into detectors" is false. The LLM's irreducible jobs are narrow:

1. **Source discovery** (Step 0) — repos (monorepo roots, submodules, symlinks) + which connectors exist. Partly deterministic (PATH/file probes), partly LLM (is a Jira/Coda MCP in session?).
2. **Connector provisioning** — `collect tracker` (Jira/Linear) and `collect docs` (Confluence/Coda) require a connector object the engine cannot self-fetch (`tracker.ts:81`/`docs.ts:63` ignore the repo path). The LLM must call the MCP tool, transform the response, and feed it in. Affects ~4 metrics (ADP-I1/I2/I3-incident/D1). Absent → those checks SKIP cleanly. `collect git` is always deterministic; `collect ci` self-probes config files (deterministic) with an optional connector for run data.
3. **The 5 judgment categories.**
4. **Narrative** — `headline`/`insights`/`recommendations` authored into `audit.json` for the renderer.

So 97/102 categories are deterministic from the repo path; the LLM is the discovery + connector-bridge + judgment + narrative layer.

## Wall-time rationale (why one process is faster, not slower)

The current flow's parallelism is across LLM agents, and agent reasoning is the bottleneck (~9–10 min, ~$7–8 per run). `audit-core` converts 97 categories from agent reasoning into pure compute (~1–3 min, no tokens), leaving only a small LLM phase (5 judgments + ~4 connector metrics + narrative). Even run sequentially in one process the deterministic path beats parallel-LLM. The one heavy deterministic step is `adp_g10_complexity` (tree-sitter parse of all source) — a cost present in any correct run today; `audit-core` runs I/O-bound detectors with bounded concurrency and can parallelize complexity via worker threads if a large monorepo needs it. Real numbers to be confirmed by the spike.

---

# Workstream 1 — Headless correctness (the structural fix)

## 1a. New engine subcommand: `audit-core`

`node dist/cli.js audit-core <repoPath> <outDir> [--standards <path>]`

Deterministic, repo-path-only, no LLM, no connectors. Does what the 11 subagents were collectively supposed to do, in one process:

1. Load `standards.toml`.
2. Run the **topology** dimension first (it produces the `applies_when` flags other dimensions consume).
3. For every other dimension, evaluate all of its `detected` + `computed` categories — reuse the existing `DETECTORS`/`METRICS` maps and the topology flags; run I/O-bound detectors with bounded concurrency.
4. Run `collect git` and (if config detected) `collect ci`, writing artifacts to `<outDir>/collected/`.
5. For each category: `judgment` → emit a placeholder check `status: "PENDING_JUDGMENT"`; connector-dependent metric with no artifact → `status: "SKIP"` with `reason_if_absent`; everything else → the real detector/metric verdict.
6. Write each `<outDir>/<dimension>.json` (the existing per-dimension schema) and the aggregated `<outDir>/audit.json`.

Output is the same JSON shape the renderer already consumes, so `render` is unchanged. Reuses detectors/metrics/collectors/standards verbatim — no scoring logic is rewritten.

## 1b. SKILL.md orchestration rewrite (Steps 5–6)

Replace "spawn 11 dimension-auditor agents that each drive the engine" with:

1. **Run `audit-core` once** (the single unavoidable deterministic pass) → `audit.json` with 97 categories scored, judgments PENDING, connector metrics SKIP.
2. **Connector patch (only if a tracker/docs MCP is available):** fetch via MCP, transform to connector objects, run `collect tracker`/`collect docs`, re-run the ~4 connector metrics, patch those checks.
3. **Judgment patch:** evaluate the 5 judgment categories (small, targeted LLM work — optionally one short subagent) and patch their checks.
4. **Narrative:** author `headline`/`insights`/`recommendations` into `audit.json`.
5. **Render:** `render audit.json --format md|html` → `report.md` + `report.html` (already unconditional; keep the Step-6 gate that fails if `audit.json` is absent).

Keep the already-landed hardening (Step-5 has become moot for the fan-out but the gate, Step-7 HTML-not-optional, and the agent guard stay).

## 1c. `dimension-auditor.md` disposition

Retire the per-dimension fan-out. Either delete the agent or repurpose it to a single optional "judgment + connector" helper. The bulk of its instructions (engine routing per category) move into `audit-core`.

---

# Workstream 2 — Detection coverage (handoff items B + C)

Detector-internal; reinforces Workstream 1 (these are the deterministic detectors `audit-core` drives). No new tree-sitter grammars — grammars feed only `adp_g10_complexity`; IaC/CI are filename/path detection.

## 2a. CI detection — unify + broaden (B)

Today four lists disagree and the collector gate is too narrow:

- Single source of truth: one exported canonical CI-paths constant; consumed by `collectors/ci.ts`, `detectors/software_best_practices.ts`, `detectors/supply_chain_security.ts`, `detectors/end_to_end_delivery.ts`.
- Broaden to: GitHub Actions, GitLab CI (`.yml` **and** `.yaml`), Jenkins, CircleCI, Azure Pipelines/ADO, Buildkite, Drone, TeamCity (`.teamcity/`), Travis (`.travis.yml`), Bitbucket (`bitbucket-pipelines.yml`).
- **Most urgent:** the `collectors/ci.ts` gate misses CircleCI + Azure, so those repos read as "no CI" at the collector level — fix first.

## 2b. IaC detection — broaden beyond Terraform (C)

Extend the ecosystem lists in `detectors/spec_driven_development.ts` and `detectors/end_to_end_delivery.ts`:

- Add CloudFormation (YAML/JSON templates), Bicep (`*.bicep`), ARM (`azuredeploy*.json`), CDK/Pulumi (recognize TS/Python IaC via manifest/imports — complexity already counted, just label as IaC), Ansible (playbooks/roles), Kustomize (`kustomization.yaml`), Serverless Framework (`serverless.yml`). Tighten the loose `infra|infrastructure|...` dir regex where it over-matches.

Both: add/extend detector tests, `npm run build:engine`, commit `dist/`.

---

# Workstream 3 — PR hygiene (handoff item A)

Add `.gitattributes` at repo root:

```
plugins/awos/skills/ai-readiness-audit/dist/cli.js linguist-generated=true -diff
plugins/awos/skills/ai-readiness-audit/dist/package.json linguist-generated=true
*.wasm binary
```

Collapses the 11.7K-line bundle in GitHub's PR view and drops it from language stats. Ships nothing different. Trivial, zero-risk, independent of everything else.

---

# File-by-file change list

**Reused unchanged (the bulk of the 40K):** `detectors/*.ts` (the scorers — coverage edits in 2 of them only), `metrics/*.ts`, `render.ts`, `report-template.md`, `references/standards.toml`, `collectors/git.ts`/`docs.ts`/`tracker.ts`.

**Changed / added:**

| File | Change | Workstream | Size |
|---|---|---|---|
| `cli.ts` | add `audit-core` subcommand (reuses `DETECTORS`/`METRICS` + DAG) | 1 | ~150–300 lines |
| `SKILL.md` | rewrite Steps 5–6 to audit-core → patch → render | 1 | moderate |
| `agents/dimension-auditor.md` | slim to judgment+connector or retire | 1 | shrinks |
| `collectors/ci.ts` | consume canonical CI constant; fix gate | 2 | small |
| `detectors/software_best_practices.ts`, `supply_chain_security.ts`, `end_to_end_delivery.ts` | consume canonical CI constant; broaden | 2 | small each |
| (new) shared CI-paths constant module | single source of truth | 2 | small |
| `detectors/spec_driven_development.ts`, `end_to_end_delivery.ts` | broaden IaC list | 2 | small each |
| `.gitattributes` (new, repo root) | collapse bundle in PR view | 3 | 3 lines |
| `tests/*` + engine `tests/*.test.ts` | audit-core test; CI/IaC detection tests; update lint contracts | 1,2 | ~300 lines |
| `dist/cli.js`, `dist/grammars/*` | rebuilt | 1,2 | generated |

**Net new hand-written ≈ 600–900 lines**, reusing the existing ~12.7K engine. This is an additive orchestration + coverage layer, not a redo.

# Sequencing

1. **Now / independent (no dependency on the rewrite):** Workstream 3 (`.gitattributes`) and the Workstream 2a `ci.ts` gate fix — trivial, immediately useful.
2. **Spike:** implement `audit-core` in `cli.ts`; prove it emits a valid `audit.json` deterministically on `onex-discovery-api` and measure wall time. Decision gate before the SKILL.md rewrite.
3. **Rewrite:** SKILL.md Steps 5–6 + retire/slim `dimension-auditor`; re-run headless via the harness (`tools/audit-test-harness/`) and confirm `audit.json` + `report.html` + per-dimension `.json` (not `.md`) + `cli.js` invoked.
4. **Coverage:** finish Workstream 2 (CI unify/broaden, IaC broaden) + tests.
5. Rebuild `dist/`, full `npm test`, commit.

# Validation

- Spike: `node dist/cli.js audit-core ~/code/onex-discovery-api /tmp/out` produces `audit.json` with 97 real scores, 5 PENDING_JUDGMENT, connector checks SKIP; record wall time.
- Headless re-test via harness: `audit.json` present, `report.html` present, zero stray per-dimension `.md`, `cli.js` invoked > 0. Compare `audit_total` against the engine's deterministic expectation (now reproducible run-to-run, modulo judgment + connectors).
- Engine tests green under real Node; lint green; `dist/` not stale.

# Open questions / risks

- **Judgment categories under `-p`:** the 5 judgments still need the LLM; confirm they don't reintroduce the skip-the-work behavior. Mitigation: they patch an already-valid `audit.json`, so worst case they stay PENDING rather than corrupt scores.
- **Complexity metric wall time** on large monorepos — measure in the spike; parallelize if needed.
- **Connector fetch in headless** with no MCP present — by design those metrics SKIP; that's correct, not a failure.
- **Org mode:** `audit-core` per repo; the orchestrator runs them (parallel background processes) then `rollup`. Detail in implementation.
