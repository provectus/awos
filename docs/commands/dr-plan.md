# /awos:dr-plan

> Creates the Disaster Recovery Plan for one environment — recovery today (step by step), improvement plan, recovery after improvements.

## What it does

This command writes an honest, verifiable disaster recovery plan for one environment per run, checked against the live cloud state read-only. The disaster it plans for is the loss of the environment's whole cloud region. It answers three questions in order: how the environment would be recovered from that loss **today**, what to **build** to recover better, and how recovery works **after** that is built. It creates or updates:

- `context/disaster-recovery/disaster-recovery-plan.md` — the shared strategy for all environments: what holds state, current protection, ranked gaps, decisions, the map of all DR documents, and a today-vs-after summary per environment.
- `context/disaster-recovery/<env>/dr-recovery-today.md` — Plan 1: what survives and what is lost, the wait-or-rebuild decision, the day-by-day rebuild with real commands, costs today, and the secrets to re-issue by owner.
- `context/disaster-recovery/<env>/dr-improvement-plan.md` — Plan 2: improvements in phases with a per-item monthly cost and a today-vs-after table, and Plan 3 (§6): the recovery sequence once those improvements are built.

## Prerequisites

- `context/product/architecture.md` must exist (run `/awos:architecture` first). It is where the command finds the cloud provider, environments, data stores, infrastructure and networking.
- `context/product/product-definition.md` is read if present — it decides which services are critical.
- `context/sources/sources.md` is read if present — its infrastructure and docs sources point at runbooks, post-mortems and cloud accounts outside the repository.
- Read-only access to the environment through the provider's CLI and, if the environment runs on a platform such as Kubernetes, that platform's CLI. The command checks access once up front; missing access does not stop the run, and the affected facts are marked unverified.

## How it works

1. **Identifies the environment**: Maps your prompt to an environment listed in `architecture.md`, or asks you to pick one. If that environment already has DR documents, it runs in Update Mode and treats the rest of your prompt as the change request.
2. **Builds the inventory from code**: Delegates a read-only exploration of the environment's infrastructure-as-code and deployment manifests — every stateful resource, hard-coded regions, where state lives, resources a second environment would collide with, hand-applied objects, and dependencies on other teams.
3. **Verifies live, read-only**: Checks storage redundancy, database high availability and backups, secret-store and registry network access, deletion locks, compute platform state, recovery-region quota and network, and the infrastructure-as-code state store. Each fact is recorded as verified (with date and command) or _unverified — verify by: …_.
4. **Fixes the facts**: Proposes a recovery region and writes every verified fact, price and open assumption to one temporary facts file (never saved into the project), so the plans cannot disagree with each other.
5. **Drafts and writes the plans**: Each plan is written by its own subagent working only from the facts file. Recovery today and the improvement plan run in parallel; recovery after the improvements follows once the improvement plan exists. The design-heavy improvement plan runs on a stronger model at higher effort (`fable`, `high`); the other two on `opus` at `medium`. If a model or effort is not available, it falls back to the default model and says so in the report. The command then writes the shared strategy, checks that the documents agree, and saves everything before any question is asked.
6. **Reviews with you**: Asks only what the drafts left as assumptions — recovery region, recovery time and recovery point objectives, the wait threshold, data accepted as lost, improvements in scope — then re-saves.
7. **Reports**: Saved paths, the headline today-vs-after numbers (time to recover, data lost, standing cost), the open assumptions with how each will be verified, and any model fallback.

## Key behaviors

- **Strictly read-only.** It never applies infrastructure-as-code, fails over, locks, or changes any resource. Every command a human must run during a disaster is written into the document, not executed.
- **Secret names only.** Secrets are listed by name; values, connection strings and keys are never read or written. A secret found committed to git or inside a saved plan is reported by location only and listed as a security fix.
- **Scoped to the environment.** Live checks target the environment's own resources by name or tag, never the whole account, and an outdated CLI is reported once instead of failing check by check.
- **Verify, then mark.** Nothing remembered or inferred is presented as verified. Time estimates are labelled "estimate, not measurement" until a drill measures them.
- **Costs are always today vs after.** List-price monthly estimates with the price source, one "after" column per improvement option.
- **Plain words for people under pressure.** Abbreviations are spelled out in prose, every document starts with a "Terms used" section, and every step has a _Who_, a real command in a code block (never squeezed into a table cell) and a _Done when_ check. Documents stay short enough to use under pressure — long resource blocks and scripts go in an appendix.
- **Facts are per environment, mechanics are shared.** A second environment re-verifies its own facts but links to mechanisms already written out for the first instead of repeating them.

## Common misconceptions

- **"This produces a runbook."** No. A day-of runbook (decision gates, owner roster, communication templates, formal fail-back) depends on a recovery design the team has not ratified yet. The improvement plan proposes that design; write a runbook once it is agreed.
- **"The proposed design is decided."** The recovery region and every new resource name are proposals and placeholders until the team ratifies them.
- **"One run covers every environment."** One environment per run. Run it again for each environment; the shared strategy document is updated in place each time.
- **"It covers every kind of outage."** Only region loss. Data deleted in place, a zone outage or a lost cluster in a healthy region are resilience gaps; the plan lists them with where to fix them (the architecture or a feature spec) but writes no recovery procedure for them.
- **"It assumes a particular cloud or network."** No. It uses the provider, compute platform and network topology recorded in `architecture.md`; where those are not recorded, it uses generic examples and marks them as assumptions.

## Example usage

```bash
# Good — plan one environment:
> /awos:dr-plan production

# Good — name the recovery region up front:
> /awos:dr-plan staging, recover into us-west-2

# Good — update an existing plan:
> /awos:dr-plan production — the database now has a cross-region replica, update both plans
```

## What happens next

Run `/awos:dr-plan <other env>` for each environment not yet covered. Turn the improvement plan's phases into features with `/awos:spec`, and re-run `/awos:dr-plan <env>` after each phase lands — or after a drill measures real recovery times — so the documents stay true.
