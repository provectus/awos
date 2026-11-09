# Better Plugin (experimental)

The `better` namespace holds experimental, higher-rigor forks of core AWOS commands. It holds one command, `/better:implement`: one command that takes an agreed spec from its technical plan to verified completion. It splits the work into units, delegates each, keeps its state in a `run.md` checkpoint next to the spec, and does not call the spec done until every acceptance criterion has been checked against the agreement.

## Install

Requires an AWOS core installation in the project (`npx @provectusinc/awos`) — the command reads the spec directories core creates and hands off to `/awos:hire`, `/awos:architecture` and `/awos:product`. Then:

```
/plugin install better@awos-marketplace
```

If the marketplace is not registered yet: `/plugin marketplace add provectus/awos`.

## Usage

```
/better:implement            # the next spec whose functional spec is not Completed
/better:implement 014        # a specific spec, by number or name
/better:implement 2.3        # one unit of a spec that already has a run.md
```

Run it on a spec that has both `functional-spec.md` and `technical-considerations.md`; the command makes its own split from the technical spec. A spec that already has a `run.md` resumes from it; delete the file to split again.

## What it does differently

1. **The split is internal.** The command derives vertical slices of units from the technical spec, lists under each unit the acceptance criteria it realizes (copied verbatim from the functional spec), and assigns an agent per unit by introspecting the `Agent` tool's description block. The plan is not put to the user for review: the spec and the technical spec are the agreement, and the human confirmed those. The only question the split asks is about a staffing gap — a unit no installed agent covers — and the default is to run it under `general-purpose` with the gap on record.
2. **`run.md` is the checkpoint.** Written in the spec directory before anything runs and before the first question, updated after every step: the units, the agent each ran under (with any substitution named), the criteria each realizes, the evidence, the marks. An interrupted or blocked run resumes from it.
3. **Delegation by path, verbatim.** A subagent gets the paths of the three documents and its unit's block copied from `run.md` unchanged — never a re-authored brief, which is where fidelity to the agreement leaks. A subagent solves execution problems — failing tests, build errors, missing dependencies — itself and never returns them as questions. It returns a question only when the agreement leaves a decision open, and even then it builds on the reading the agreement best supports and returns the question with that reading, so the run goes on.
4. **Every report is a claim.** The orchestrator spot-checks each subagent report against the files and the quoted command output, then checks the unit's criteria itself while the work is fresh: `[x]` with evidence, `[ ]` with what failed, `[?]` with why it could not be checked here, including a criterion that rests on a reading the user has not confirmed. A unit that fails is re-delegated once with its failure in the brief; a second failure stops the run with the evidence.
5. **Verification is the exit criterion.** After the last unit the whole is checked against the agreement — every criterion, the Out-of-Scope list, the technical decisions and recorded assumptions. A failed criterion becomes one rework unit; a second failure stops the run with the evidence instead of a third attempt. A criterion the orchestrator could not observe gets a verification unit first — a subagent writes and runs the check that proves it and quotes the output — and only a criterion no automated check can reach stays `[?]`. What is still open goes to the user at the end: the `[?]` criteria in one multi-select question, each with the steps to check it, and each assumed reading confirmed or redirected to a rework unit. The user confirms a checklist; they never design the tests. Nothing is asked between the split and this step. Only when every criterion is `[x]` do both documents move to `Completed`.
6. **Product drift is reported, not applied.** When the implementation made the architecture or product definition inaccurate, the report names the `/awos:architecture` or `/awos:product` command to run, with a prompt.
7. **Unattended runs ask nothing.** With `AWOS_UNATTENDED` set every question takes its default, and an open item — an unconfirmed `[?]` criterion, an unanswered question, a unit that failed twice — leaves the run `blocked` and resumable with `run.md` holding the reason.

8. **Every finished slice is a commit.** Before anything runs the command records a baseline — the branch, the dirty paths, the tests already failing — and branches off the default branch to `awos/<spec directory>`. When a slice's last unit is done it stages the run's own changes by path, never the baseline's dirty paths, and commits them in the repository's own message convention, writing the SHA under the slice in `run.md`. A blocked run lists what it left uncommitted. Outside a git repository the step is skipped and the report says so.

The orchestrator never edits code, configuration or schemas itself; every change is made by a subagent it delegates to. The one change it makes to the repository is the commit of a finished slice.

## Outputs

| File                          | Contract                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.md`                      | New. The run's checkpoint and report: slices, units, agents, criteria with marks and evidence, a `## Verification` ledger and an `## Open` list. `Status: running`, `blocked` or `verified`.          |
| `functional-spec.md`          | Acceptance criteria ticked as they are verified; `Status: Completed` once every one is `[x]`.                                                                                                         |
| `technical-considerations.md` | `Status: Completed` together with the functional spec. Never edited otherwise.                                                                                                                        |
| Git commits                   | One per finished slice, on `awos/<spec directory>` when the run started on the default branch, plus a final commit of the spec directory when the repository tracks it. Only the run's own changes.   |
| Chat report                   | Opens with `Implementation run complete.` — the line the profiler plugin reads — then status, units, criteria, substitutions, open items and the next command. `/profiler:implement` works unchanged. |

## Plugin structure

```
better/
├── .claude-plugin/plugin.json   # manifest (independent version line)
├── commands/implement.md        # /better:implement
└── README.md
```

## Status

Experimental. The deliverable contract — ticked criteria and `Status: Completed` in both documents, plus the additive `run.md` — is stable; the split, delegation and rework flow may change between versions. If the experiment proves out, the flow moves into core.
