# [environment] — region disaster: how to recover **today** (before any DR improvement)

_One paragraph: what the team can do if [home region] is lost and [environment] with it, **with the platform exactly as it is on [YYYY-MM-DD]**: none of the improvements in the [improvement plan](dr-improvement-plan.md) built yet. State the honest headline, e.g. "today a region loss means a **rebuild from code with almost no data**, taking days"._

- **Status:** Draft v0.1, [YYYY-MM-DD]. Facts marked _verified_ were checked live that day. [Never drilled / last drilled on …].
- **Owner:** [Team]
- **Companion documents:** [DR plan](../disaster-recovery-plan.md) (strategy, gaps, decisions, all environments) · [[environment] improvement plan](dr-improvement-plan.md) (what to build, and recovery afterwards) · [[other environment] recovery today](../[other-env]/dr-recovery-today.md)

**Terms used in this document**

_Only the terms this document uses, spelled out once._

- **Recovery point objective** — the most data, measured in time, we accept losing.
- **Recovery time objective** — how long the platform may stay down before it is running again.
- **[Storage redundancy level in use, spelled out]** — [definition, and what a region loss means for it].
- **Cross-region backup** ([database]) — [definition; how a restore into another region works].
- **Paired / secondary region** — [this environment's pairing].
- **Private endpoint / private connection** — [definition, if used; a service with public access disabled can be reached _only_ through its private connections].
- **DR** — disaster recovery. **[Abbreviation]** — [expansion]. _(One line for the remaining product abbreviations.)_

---

## 1. What survives a region loss today

| Survives                                                                           | How                                            | Usable from the recovery region today?                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [database]                                                                         | [cross-region backup, _verified_ `Enabled`]    | **Yes** — [restore into the recovery region, at most ~N of writes lost]                                                                                                            |
| Code: [infrastructure-as-code, deployment manifests, app source]                   | [Git host]                                     | Yes                                                                                                                                                                                |
| Infrastructure-as-code state ([account])                                           | [region, redundancy]                           | [Yes / **read only** — if it lives in the home region of any environment, say which applies stop]                                                                                  |
| [global services: identity, DNS, monitoring, CI]                                   | Global services                                | Yes                                                                                                                                                                                |
| [shared network or infrastructure in the recovery region, if another team owns it] | [owner, _verified_]                            | Yes                                                                                                                                                                                |
| Container images in [registry]                                                     | [replica in region X, _verified_]              | **Probably not.** _Verified:_ [public access setting, IP rules, where its private connections are]. [Why a new network cannot reach it during the outage]. Plan for a new registry |
| Secret values ([secret stores])                                                    | [provider-kept copy in another region, if any] | **Probably not.** _Verified:_ [public network access, private connections and their region]. Plan to re-issue every secret                                                         |

| **Lost** (or unavailable until the region returns)                            | Consequence                        |
| ----------------------------------------------------------------------------- | ---------------------------------- |
| [object storage] (≈ [size], [redundancy spelled out]): [buckets / containers] | [what users and integrations lose] |
| [file shares, managed disks, databases running on the compute platform]       | [ ]                                |
| [other managed stores: queues, search indexes, artifact stores]               | [what stops working]               |
| [metrics, dashboards, logs history]                                           | [ ]                                |

_Close with what changes if the region **comes back** (an outage rather than a destruction): data kept only in the home region is usually still there — which is why the default decision in §2 is to wait._

---

## 2. Decide: wait or rebuild

_One sentence on the trade: what a rebuild costs and gives back versus what waiting gives back._

|               | Wait                    | Rebuild in [recovery region] when                                                                              |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| [environment] | [default, for how long] | [triggers: region or storage declared lost; no ETA after N hours **and** a business deadline that cannot wait] |

Owner: [role]. Before deciding, ask [the question that can make a rebuild pointless — e.g. whether the data the critical service needs is only in the lost region].

[Side effects on other environments, e.g. a change freeze because shared infrastructure-as-code state is in this region.]

Whatever the decision, do §3 steps [1–N] at once: they cost nothing and they are the longest waits.

---

## 3. Rebuild step by step ([home] → [recovery region])

Estimates, not measurements. [Number] engineers (A = infrastructure, B = application/platform), plus [other teams].

_Write each step as a numbered item: a heading with the step and who does it, one or two lines on what and why, the command or console action in a fenced code block, and a **Done when** check — in its own fenced block when the check is a command. Commands never go in a table cell. Drop steps for platforms the environment does not use and add the ones it needs._

### Step index

| #   | Step                                                  | Who   | Done when (in words)                       |
| --- | ----------------------------------------------------- | ----- | ------------------------------------------ |
| 1   | Declare the incident, freeze merges                   | A     | incident open, merges blocked              |
| 2   | Quota request for [recovery region]                   | A     | limits cover what the environment uses     |
| 3   | Requests to other teams                               | A     | values received                            |
| 4   | Re-issue the secrets                                  | B     | every appendix row has a value or an owner |
| 5   | [New registry / images, if the environment uses them] | B     | every referenced image exists              |
| 6   | New infrastructure-as-code directory and state key    | A     | directory on a branch                      |
| 7   | First apply: [the minimum the rest depends on]        | A     | [check]                                    |
| 8   | [Database] cross-region restore                       | A     | [databases listed; parameters match]       |
| 9   | Full apply                                            | A     | apply green                                |
| …   | [platform, DNS, outside consumers, data, serving]     | A / B | [check]                                    |
| [n] | User announcement                                     | A     | sent                                       |

### Day 1 — start the long waits, restore what survives

#### 1. Declare the incident and freeze merges — A

Freeze merges on [repositories / branches] and post the first user message: what is down, that data is not available, the time of the next update.

```bash
[command or "# Console: <exact path and action>"]
```

**Done when:** the incident is open and merges to [branch] are blocked.

#### 2. Quota request for [recovery region] — A

_Verified on [YYYY-MM-DD]:_ [limits] against [what the environment uses]. Raise it as a highest-severity support case.

```bash
[read-only command that shows the current limits]
```

**Done when:** the limits cover [what the environment uses].

#### 3. Requests to other teams — A

[What the recovery needs from them, as recorded in the architecture or the inventory, e.g. DNS changes, identity-provider redirect URIs, network allocations.]

**Done when:** every value is received.

#### 4. Re-issue the secrets — B

Into the password manager, never into git. Names are in the appendix; [the ones that block infrastructure-as-code itself] first.

```bash
[command that creates each secret in the recovery region, with <VALUE> read from the password manager]
```

**Done when:** every appendix row has a value or an owner chasing it.

```bash
[read-only command that lists the secret names in the recovery region]
```

### Day [N] — infrastructure-as-code for the new environment

#### 6. New environment directory and state key — A

Copied from [home dir]: [region, names, what it creates because nothing was prepared, what it does not create]. A **new backend key** — a copied key would plan against the home environment's state.

```[language]
[backend block with the new bucket and key]
```

**Done when:** the directory is on a branch and `init` succeeds against the new state.

#### 8. [Database] cross-region restore — A

```bash
[restore command with the real source resource ID; placeholders only for values not yet known]
```

**Done when:** [databases listed; parameters that must match].

```bash
[read-only check]
```

### Day [N] — the platform

_One numbered step per item the environment needs: deployment, secrets reaching the applications, CI runners or registrations, webhooks, background jobs and objects that lived only on the platform, hand-applied items, DNS, outside consumers — each with its command block and check._

### Day [N] — data and serving

_Rebuild or reload the data stores that did not survive, in order of what matters; services that start empty; then the user announcement: what works, what is gone, that data may return with the region._

### When the home region returns

1. [Stop the old environment first, so it cannot take DNS records and registrations back:]

   ```bash
   [command]
   ```

2. [Copy the data the teams need into the new environment, or move back.]
3. [Moving back: the reverse order of the steps that moved DNS, registrations and webhooks; delete the recovery environment once the home one has run cleanly for a week.]

---

## 4. Costs today

|                                                                     | [environment]                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Standing cost of today's DR features** (paid every month already) | [item ≈ $; item ≈ $] → **≈ $[total]**                                                     |
| **Running in the recovery region** (while operating there)          | [minimum footprint ≈ $/month (≈ $/day), plus workload as used, plus anything created new] |
| **People**                                                          | [engineers × days, plus other teams and secret owners]                                    |
| **Data**                                                            | Not recoverable at any price until the region returns                                     |

List prices ([price source], pay-as-you-go), before any enterprise discount.

---

## Appendix A — secrets to re-issue (names only, from [secret store], _verified_ [YYYY-MM-DD])

| Owner / where to re-issue                                     | Secrets                        |
| ------------------------------------------------------------- | ------------------------------ |
| [owner]                                                       | `[name]`, `[name]`             |
| Generated by infrastructure-as-code (come back by themselves) | `[name]`                       |
| Platform service secrets — values set by hand                 | `[name]`                       |
| Team secrets — ask each team                                  | `[name]`                       |
| [Secret store the reader could not list]                      | _could not list — ask [owner]_ |

## Appendix B — long blocks

_Resource blocks, scripts and policies longer than about 15 lines, each under a heading the step that uses it links to._
