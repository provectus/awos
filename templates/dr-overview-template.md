# Disaster Recovery Plan — [Platform name] ([env 1] / [env 2])

_Shared across all environments; lives at `context/disaster-recovery/disaster-recovery-plan.md`. One paragraph: what this plan covers — the loss of each environment's cloud region (every environment, its compute, and the cloud resources it depends on) — it inventories what holds state, what protects it today, ranks the gaps and proposes changes in order of value — and that every fact was checked against the live cloud state and the repositories on the date below._

- **Status:** Draft v[N], [YYYY-MM-DD]. [What changed in this version.] The final DR design (recovery region, standby resources) is still for the team to pick.
- **Owner:** [Team]
- **Verified against:** [live cloud (CLI tools used), repositories] on [YYYY-MM-DD]
- **Related:** [post-mortems, other runbooks, `context/product/architecture.md` sections]
- **Review cadence:** [quarterly, or after any change to a resource that holds state]

**Terms used in this document**

- **Recovery point objective** — the most data, measured in time, we accept losing.
- **Recovery time objective** — how long the platform may stay down before it is running again.
- **[Storage redundancy levels the provider offers, spelled out]** — [one line each: where the copies live, and whether a copy in another region is usable only after a failover]. _(Only the levels the environments use.)_
- **Paired / secondary region** — [definition, with every environment's pairing].
- **Point-in-time restore**, **High availability** — [definitions, if used].
- **DR** — disaster recovery. **[Abbreviation]** — [expansion]. _(One line for the remaining product abbreviations.)_

---

## 1. Summary

_Five to eight bullets across all environments: is the platform rebuildable from code, where its data lives, which data stores are single-copy or single-datacenter, which have no backup at all, whether a DR exercise has ever been run. One closing line on what the cheapest phase fixes and what geo-redundancy costs._

**The DR documents**

| Document                                                                                                 | Answers                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| This plan                                                                                                | What holds state, what protects it, the gaps, the decisions — all environments                                   |
| Recovery today — [[env 1]]([env-1]/dr-recovery-today.md) · [[env 2]]([env-2]/dr-recovery-today.md)       | How a region loss would be handled **now**, before any improvement, step by step: [days], [what data comes back] |
| Improvement plan — [[env 1]]([env-1]/dr-improvement-plan.md) · [[env 2]]([env-2]/dr-improvement-plan.md) | Everything to build, in order, its cost, and the recovery sequence once it is built: [hours], [data-loss window] |

A day-of runbook (decision gates, owners, communications, fail-back) is deliberately not written yet: it depends on the DR design the team picks from the improvement plans.

**Region loss, today and after ([env], list price)** _— one table per environment, or one with a column pair per environment._

|                                           | Today                   | After the improvement plan                              |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------- |
| Time to recover                           | [e.g. 3–5 working days] | [e.g. ≈ 5 hours — estimate until the drill measures it] |
| Data lost                                 | [per data store]        | [per data store, as a time window]                      |
| Standing cost per month                   | [$]                     | [$] ([variant])                                         |
| Cost while running in the recovery region | [$ per month]           | [$ per month]                                           |

Breakdown: [env] [improvement plan]([env]/dr-improvement-plan.md) §0.1 and [recovery today]([env]/dr-recovery-today.md) §4.

---

## 2. The disaster and proposed objectives

_This plan covers one disaster: the loss of an environment's home region. Losses inside a healthy region (data deleted or corrupted in place, a zone outage, a lost cluster) are resilience gaps, listed in §6 with where they should be fixed — not recovered here._

| Environment | Home region | Recovery region (proposed) | What survives today                                                       | Proposed recovery time objective (today / after) | Proposed recovery point objective (today / after) |
| ----------- | ----------- | -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| [env 1]     | [ ]         | [ ]                        | [verified reachability of secret stores/registries — link recovery today] | [ ]                                              | [ ]                                               |

_Objectives are proposals until the owner accepts them (§9)._

---

## 3. Topology facts that shape recovery

_Facts, each *verified* (date) or *unverified* (how to verify): regions and their pairs, the network model as `architecture.md` and the inventory record it (e.g. private connections, firewalls, shared networks owned by other teams), where infrastructure-as-code state lives and its redundancy (and which environments one region's loss blocks), which services are global, quota in the recovery regions._

---

## 4. State inventory and current protection

### 4.1 Managed data stores

| Resource ([env]) | Holds | Redundancy (spelled out) | Backup / geo-backup | Network access | Delete lock | Verified |
| ---------------- | ----- | ------------------------ | ------------------- | -------------- | ----------- | -------- |

### 4.2 Persistent volumes on the compute platform (live list, [YYYY-MM-DD])

_Drop this subsection if the environment has none._

| Platform / namespace / volume | Backing store | Size | Holds | Backed up? |
| ----------------------------- | ------------- | ---- | ----- | ---------- |

### 4.3 Things that look like state but are not

_Caches, rebuildable indexes, data regenerated by infrastructure-as-code or deployment manifests. Then: **Not in git — must be captured in the recovery documents** (hand-applied objects, manually set secrets, prune state)._

---

## 5. The opening questions, answered

_One short subsection per data store the team asked about (e.g. the main database, object storage, persistent volumes, logs, metrics, databases running on the compute platform): what protects it today, what a loss means, the proposed change._

---

## 6. Gaps, ranked, with the change

| #   | Gap | Change | Where           | Monthly cost |
| --- | --- | ------ | --------------- | ------------ |
| G1  | [ ] | [ ]    | [repo / portal] | [$]          |

_In-region resilience gaps found along the way (no backup, single zone, no deletion protection) go here too, with "Where" pointing at the architecture or a feature spec — they are fixed there, not recovered by this plan._

---

## 7. Phasing

_Phase 0 (configuration-only, near-zero cost), Phase 1, …, and the region-loss readiness track ordered by what blocks a regional recovery (built out in the improvement plans)._

---

## 8. Region-loss recovery (outline — step by step in the per-environment documents)

_A short outline per environment, linking its recovery today §3 (now) and improvement plan §6 (after)._

---

## 9. Decisions needed

| #   | Decision                        | Options | Recommendation / status              | Owner |
| --- | ------------------------------- | ------- | ------------------------------------ | ----- |
| D1  | Recovery region per environment | [ ]     | **Proposed (not yet ratified):** [ ] | [ ]   |

---

## 10. Validation

_The drill (environment, scope, what is measured) and the claims still unverified that it checks._

---

## 11. Implementation plans (optional)

_Deeper per-gap designs that are shared by all environments (e.g. object-storage replication, registry replicas, a shared standby secret store), each with cost and failover semantics._

---

## Appendix A — Fact sheet

_Resource names, IDs, SKUs and settings per environment, *verified* [date]._

## Appendix B — Sources

_Commands run (read-only), repositories and paths read, dates. Secret values are never read; secret stores are listed by secret name only._
