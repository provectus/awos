# [environment] — DR improvement plan: what to build, and how recovery works afterwards

_One paragraph: the second of two recovery plans for [environment]. [Recovery today](dr-recovery-today.md) describes what the team can do if a region is lost *now*: [today's headline]. This plan lists everything to build so that a region loss becomes a recovery of **[target time] with at most [data-loss window] of data lost**, and ends with the recovery sequence that works once it is built (§6). It names every deployment and every piece of data the platform needs and says how each one reaches the recovery region. Strategy and gaps for all environments: [DR plan](../disaster-recovery-plan.md)._

_If another environment's improvement plan already writes out the shared mechanics, add: "The mechanics are written out once, in the [[other env] improvement plan](../[other-env]/dr-improvement-plan.md); this document gives the [environment] values and the [environment]-only parts."_

- **Status:** Draft v0.1, [YYYY-MM-DD]. Inventory verified live on [environment] and against [repositories] the same day.
- **Owner:** [Team]
- **Target (proposed):** [environment] ([home region]) → **[recovery region]**, [why]. The team has not picked the final DR design; names such as `[recovery-network dir]` are placeholders until it does.
- **Rules that apply to every step:** [how changes ship, as the project does it — e.g. infrastructure-as-code through a PR, CI plans on the PR and applies on merge; non-production first; never edit generated manifests]. Every step ends with a **Verify** line and a code block holding the read-only check — a step is not done until it passes. Commands live in code blocks, never in table cells.

**Terms used in this document**

- **Recovery point objective** — [ ]
- **Recovery time objective** — [ ]
- **[Storage redundancy levels, spelled out]** — [one line each, only those used]
- **Paired / secondary region**, **Point-in-time restore**, **High availability**, **Private endpoint / private connection** — [only those used]
- **DR** — disaster recovery. **[Abbreviation]** — [expansion].

---

## 0. [Data] sizes used in this plan

- `[object storage]`: about [size]. [Any timing constraint, e.g. "turn on geo-redundancy after [date], when soft-deleted data has expired".]

---

## 0.1 Today and after the improvements

|                                      | Today ([recovery today](dr-recovery-today.md)) | After this plan                                           |
| ------------------------------------ | ---------------------------------------------- | --------------------------------------------------------- |
| Time to recover in [recovery region] | [ ]                                            | [ ] (to be measured in the drill, §7)                     |
| What blocks the start                | [ ]                                            | [ ]                                                       |
| [Database] data lost                 | [ ]                                            | [ ]                                                       |
| Object storage                       | [ ]                                            | [ ]                                                       |
| [Other data stores]                  | [ ]                                            | [ ]                                                       |
| Secrets                              | re-issued by hand                              | copied nightly into the standby secret store              |
| Container images                     | rebuilt into a new registry                    | [served by a replica reachable from the recovery network] |
| [Data accepted as lost by policy]    | lost                                           | lost ([policy])                                           |

### Costs, today and after ([environment], list price per month)

_One **After** column per option if the plan offers options (e.g. "After — minimal", "After — full")._

| Item                                             | Today      | After                                           |
| ------------------------------------------------ | ---------- | ----------------------------------------------- |
| [existing DR feature]                            | $[ ]       | $[ ]                                            |
| [new item]                                       | —          | $[ ]                                            |
| **Total standing cost**                          | **≈ $[ ]** | **≈ $[ ]** ([variant without an optional item]) |
| Running in the recovery region during a disaster | [ ]        | [ ]                                             |
| People during a disaster                         | [ ]        | [ ]                                             |
| One-time: [first geo-copy]                       | —          | ≈ $[ ]                                          |
| One-time: build effort                           | —          | [engineer-weeks] (§8)                           |

---

## 1. The complete inventory

_Or, when another environment's plan holds the full inventory: "## 1. Inventory — what differs from [other env]" with one table: Item | [environment] (*verified* date) | How it gets to [recovery region]._

Every row is something the recovery region needs. "Step" points at the section that builds it. _Lost_ means the platform recovers without it.

### 1.1 Cloud infrastructure ([infrastructure-as-code tool], `[repo]`)

| Item | Today ([environment]) | How it gets to the recovery region | Step |
| ---- | --------------------- | ---------------------------------- | ---- |

### 1.2 Data and stateful resources

| Item | Size / count | Survives region loss today? | Mechanism in DR | Step |
| ---- | ------------ | --------------------------- | --------------- | ---- |

### 1.3 Deployments on the compute platform

| Source | Applications |
| ------ | ------------ |

### 1.4 Platform-only state — not in git, not in the cloud

_These exist only as live objects; a restored database does not bring them back (e.g. scheduled jobs created at runtime, services deployed by a pipeline rather than from git, hand-applied secrets)._

| Item | Today | What to do in DR | Step |
| ---- | ----- | ---------------- | ---- |

### 1.5 External dependencies and integrations

| Dependency | Region-bound? | DR action |
| ---------- | ------------- | --------- |

---

## 2. Phase A — decisions and requests to other teams ([timing], no code)

_Phase letters and count fit the environment; A–E below is the usual shape._

These have lead times; start them first.

### 2.1 Requests

| #    | To                                    | Ask                                      | Verify               |
| ---- | ------------------------------------- | ---------------------------------------- | -------------------- |
| A1   | [leads]                               | [ratify objectives and scope options]    | decision recorded    |
| A2   | [quota]                               | [limits per family]                      | limits shown (below) |
| A3   | [network / IP address management]     | [address range]                          | [ ]                  |
| A4   | [shared network / firewall owners]    | [connection, rules, DNS]                 | [ ]                  |
| A5   | [infrastructure-as-code state owners] | [versioning, written failover procedure] | [ ]                  |
| A[n] | [outside consumers]                   | [contacts, pre-trust]                    | [ ]                  |

Checks for the rows whose verification is a command, by row number:

```bash
# A2 — [what it shows]
[read-only command]
```

### 2.2 Why [the longest lead time] comes first

---

## 3. Phase B — harden and replicate the home region ([timing], `[home dir]`)

Small in-place PRs against the existing directory; non-production first.

### 3.1 [Resource]

1. [Change, with the file or setting.]
   **Verify:** [expected values, in words]

   ```bash
   [read-only command]
   ```

### 3.[n] Detection that does not live in the region

---

## 4. Phase C — build the recovery environment ([timing], `[repo]`)

### 4.0 Layout: [e.g. two directories, not one with a switch]

| Directory                | Contents                                                                                 | Lives on                  | Applied    |
| ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------- | ---------- |
| `[recovery-network dir]` | [network, standby secret store, recovery storage, database replica, private connections] | `main`                    | now        |
| `[recovery-env dir]`     | [the compute and everything the home dir generates]                                      | branch `[dr/…]`, draft PR | on the day |

[Own backend key per directory — check it first.]

### 4.1 `[recovery-network dir]` — the recovery network

| Setting | Value |
| ------- | ----- |

[Resources beyond the network: standby secret store(s), recovery storage, **private connections from the recovery network to the home registry and secret stores, created while the home region is healthy** (whether they can be created during an outage is unverified — test in the drill), database replica. If the environment uses no private networking, say so and drop the private connections.]

**Verify:** [expected result]

```bash
[read-only command]
```

### 4.2 [Database] cross-region replica

```
[resource block in the project's infrastructure-as-code language]
```

**Verify:** [expected result]

```bash
[read-only command]
```

### 4.3 What `[recovery-env dir]` must do differently from [home]

| Area                                                    | [home] does        | [recovery] must                      |
| ------------------------------------------------------- | ------------------ | ------------------------------------ |
| Backend                                                 | [key]              | [new key]                            |
| [Network, secret store, recovery storage]               | creates them       | data sources on the recovery network |
| [Database]                                              | creates the server | [endpoint variable]                  |
| [Storage / registry]                                    | creates them       | data sources; keep role assignments  |
| [Stored secrets]                                        | creates them       | imports — the sync job restored them |
| [Colliding resources: webhooks, runners, DNS ownership] | [ ]                | [ ]                                  |

**Verify (monthly):** the recovery directory's plan creates no database, storage, registry or secret store and destroys nothing.

```bash
[plan command for the recovery directory, read-only against its own state]
```

### 4.4 Keep the copy current

---

## 5. Phase D — backup jobs into the recovery storage ([timing])

| #   | Job | Schedule (UTC) | Reads with | Writes to `[recovery storage]/…` | Keep |
| --- | --- | -------------- | ---------- | -------------------------------- | ---- |

Notes per job: [restore test as definition of done; format of the copy; provider limits on cross-account or cross-region copies].

**Verify:** [expected result]

```bash
[read-only command]
```

---

## 6. Recovery after the improvements — the deploy sequence

_Plan 3. The order in which everything in §1 comes back, assuming the phases above are done. Start with the lowered decision threshold: "Decide first, as in [recovery today](dr-recovery-today.md) §2 — but fail over when there is no ETA after about [N hours]." No decision gates, rosters or communications templates here — those belong to a runbook written once the design is ratified._

### Step index

| #   | Step                                                                                                | Done when (in words) |
| --- | --------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Freeze merges; cancel running applies                                                               | no apply running     |
| 2   | [Database]: promote the replica                                                                     | [ ]                  |
| 3   | [Storage]: fail over; record the last sync time first                                               | [ ]                  |
| …   | [compute, deployments, secrets, hand-applied items, data restores, serving, DNS, outside consumers] | [ ]                  |
| [n] | Re-protect the recovery site                                                                        | [ ]                  |

#### 2. [Database]: promote the replica

```bash
[command]
```

Fallback: the cross-region restore in [recovery today](dr-recovery-today.md) step [n].

**Done when:** [check]

```bash
[read-only check]
```

#### 3. [Storage]: fail over

Record the last sync time first; it is the data-loss window to announce.

```bash
[read-only command for the last sync time]
[fail-over command]
```

**Done when:** [check]

_…one numbered step per row of the index, each with its command block and check. End with what is still not recovered and the user announcement._

---

## 7. Phase E — prove it ([where], [when])

_The drill: environment, scope (build next to the live environment, never fail it over), what is measured (every §6 step), the claims still marked *unverified* that it must check, teardown, and the drill report that writes measured times back into §0.1._

---

## 8. Order of work and effort

| Week | Work | PRs | Cost added / month |
| ---- | ---- | --- | ------------------ |

Total standing cost: see §0.1.

---

## Appendix A — long blocks

_Resource blocks, scripts and policies longer than about 15 lines, each under a heading the step that uses it links to._

## Appendix B — commands used to build the inventory

_Read-only commands only. Secret names, never values._

```bash
# [what this checks]
[command]
```
