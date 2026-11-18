# Evaluation note: does `/awos:spec` reuse what earlier specs decided?

- **Date:** 2026-11-05
- **Author:** Rail Zakirov
- **Roadmap items:** Phase 2 (memory), 0.1 (prior agreements), D-9
- **Status:** one run, one project. A direction, not a statistic.

## Question

The Phase 2 hypothesis: the flow writes knowledge per feature and never reads it again, so the next spec asks questions that an earlier spec already answered. This run checks that claim on a real project with the 1.6.0 research-first `/awos:spec`.

## Setup

- Project: a copy of `JL` (two demo apps, Clarity and Actuary; 7 specs, 5 completed). Build artifacts and `node_modules` removed. No git history in the copy.
- Spec 007 (`admin-panel-actuary-demo`, Completed) moved out of the copy as the answer key. Specs 001–006 stay. Spec 006 is the same feature for Clarity; the real 007 names 006 as its reference spec.
- Confound: the code in the copy already contains the 007 implementation. The agent can read the finished feature from the code.
- Command: `AWOS_UNATTENDED=1 claude -p "/awos:spec Admin panel access for the Actuary demo environment"` with an explicit tool allowlist. Unattended, so no gate and no questions; every open point becomes a marker.
- Run time: 22 minutes, with one interruption (the machine slept mid-response). Two research agents (codebase `Explore`, web `general-purpose`) plus the `spec-verifier`. 18 web searches, 3 web fetches.

## Result

**The orchestrator read the earlier specs on its own.** The main session, not a subagent, read `006/functional-spec.md` and `006/technical-considerations.md`, the demo roadmap and the Actuary product definition. It found them through one `Glob` over `context/**/*`. The `Explore` subagent read spec 002. The prompt does not tell the command to read other specs.

**What the new spec reused from 006 without asking** (5 of 7 key decisions): one shared demo user; Okta role assignment is off; every visitor is an admin; the out-of-scope set (Okta groups, new sections, role management); the real product is unchanged.

**Open questions in the brief: 9. Markers in the spec: 10 substantive, plus 1 for "brief not confirmed".** Against the answer key:

| Open question                                        | Already decided?    | Where                                                          |
| ---------------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| 1. Is the current demo behavior live?                | Confound artifact   | Real 007 `Status: Completed` was the only record; removed      |
| 2. Where does the admin entry point live?            | Yes                 | Real 007: user dropdown "matching Clarity"; 006 tech: nav link |
| 3. Separate address, no way back: acceptable?        | Yes, implicitly     | 006 tech: direct URL on the API base, new link                 |
| 4. Panel wording acceptable for white label?         | No                  | New                                                            |
| 5. Reset demo data or block destructive actions?     | No                  | New, raised by the web lane                                    |
| 6. Demo banner?                                      | No                  | New, raised by the web lane                                    |
| 7. Is Grafana part of admin access?                  | No                  | New                                                            |
| 8. Keep the greyed-out "Sign out"?                   | Contradiction found | Spec 002 says the header has no user section; the code has one |
| 9. Close a comment: update immediately or on reload? | No                  | New, a code quirk                                              |

So: 2 of 9 questions re-ask what an earlier spec decided. 1 is a genuine contradiction between spec 002 and the code that cross-reading found. 5 are new. 1 is the confound.

**Compared with the real 007:** the real spec has 3 requirements, no open questions, and was written in one short session with the pre-1.6.0 command. The new spec has 7 requirements and 10 markers. It found three things the real 007 did not record: the 002 contradiction, a hand-entered infrastructure setting that the next deploy can remove, and an error when the panel is opened before the first app visit.

## Reading

1. **The "nobody reads earlier specs" claim does not hold for 1.6.0.** The research-first command reads adjacent specs when a glob surfaces them. The gap is narrower: a read spec is background, not a decision. Questions 2 and 3 were re-asked although 006 decided them. A verdict step (intact / changed / unclear per prior decision, as in PR 205) is the missing piece, not a retrieval layer.
2. **Cross-reading has value beyond reuse.** The 002 contradiction is exactly the "spec 007 silently contradicts spec 002" case the hypothesis predicted. Here the command found it because it read 002. Without that read, the spec would have carried the contradiction.
3. **Write-back is still not tested in this run.** The confound shows the shape of it: with the real 007 removed, no product document said the feature shipped. The agent inferred it from code and from `.claude/settings.local.json`. A record of what shipped belongs in the flow, not in a settings file.
4. **Cost for a copy-pattern feature.** 22 minutes and 9 open questions for a feature whose real spec said "identical pattern to 006". This is the case Konstantin raised in Slack: when the user already knows the answer, the brief is heavy. Two of the questions came from the web lane, not from the project.

## Second run: does the flow write back what shipped?

Same copy, same day. `AWOS_UNATTENDED=1 /awos:tech 007` (4 minutes; `Status: Draft`; the plan is "verify, then harden", because the code already holds the feature). Then `/better:implement 007` from PR 240 (`--plugin-dir`, plugin 0.3.0), with no `curl`, `aws` or `terraform` in the allowlist, so that an unattended run cannot touch the live demo. Product documents were hashed before the run.

| Measure                   | Value                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Run time                  | 7.6 minutes, 3 subagents in parallel (`python-backend-expert`, `frontend-expert`, `terraform-expert`) |
| Run status                | `blocked`: 1 of 6 units done, 2 of 26 criteria met, 1 question returned (the "oldest admin" ordering) |
| Source files changed      | 20 (backend handler and tests, UI URL builder and tests, Terraform variables)                         |
| Product documents changed | 0 of 9                                                                                                |
| Product documents read    | 0. The run read only the spec directory, plus one `tasks.md` of spec 005                              |
| Drift check (Step 6.4)    | Did not run                                                                                           |

**Reading.**

1. **Nothing writes back, by design and by gating.** PR 240 Step 6.4 compares the run's changes with `architecture.md` and `product-definition.md` and prints a command; it never edits. And Step 6 runs only when every criterion is `[x]`. A blocked run, which is the normal end of an unattended run and of any run with a `[?]` criterion, never reaches the comparison. In this run the Terraform unit fixed the hand-entered infrastructure setting the research found; nothing will tell `architecture.md`.
2. **`run.md` is the record of what happened, at spec level.** It holds the units, the files created, the evidence, the open question with two options, a bug found outside scope, and a plain-text secret in `dev.tfvars`. This is the "what shipped and how it differs from the agreement" record the write-back needs. It exists per spec; no command reads it later.
3. **The core chain has the same shape.** `/awos:verify` Step 5 also compares and prints a command. Neither flow records product-level knowledge after a feature.

**Conclusion for Phase 2.** The read side is mostly covered (first run). The write side is open in both flows, and in `/better:implement` it is also unreachable for most runs. The fix is small and local: make the comparison run on every run end, not only on completion, and write a draft with a marker instead of printing a command.

## After the 2026-11-05 sync

Oleg restated the memory problem in two parts: (1) context a person gives while preparing a spec or the product definition is lost; (2) workarounds pile up in personal environments and other people hit the same errors. Konstantin: the team tests "hindsight" memory outside the AWOS flow. The findings above are a case of (1). PR #245 (merged 2026-11-05) removed the feature brief and the understanding gate from `/awos:spec`; `research-notes.md` stays and gains a "facts the user supplied" section. Any "already decided" section now belongs in `research-notes.md` and the synthesis step, not in a brief.

## Not measured

- A control arm (the same topic with a verdict step). Not built.
- More than one project or one run.
- Whether an interactive gate would have closed questions 2 and 3 in one reply (the gate no longer exists after #245).
- A run that reaches Step 6, so that the drift check itself can be judged.

## Artifacts

The run artifacts and transcripts are on Rail's machine, available on request.
