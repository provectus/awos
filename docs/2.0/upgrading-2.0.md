# Upgrading to AWOS 2.0

AWOS 2.0 narrows the framework to its core method: agree on what to build, then build it. Two commands leave the framework — but nothing of yours is deleted: the retired roadmap command is shut down gracefully (its local body becomes a removal notice; your documents stay untouched), and commands the flow plugin generated for you keep working. Updating is the same command as always:

```sh
npx @provectusinc/awos
```

Migrations handle the rest.

## What left the framework, and what replaces it

| Removed               | Replacement                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/awos:roadmap`       | Specs are anchored by an explicit topic: run `/awos:spec` and state what you want to build. Running `/awos:roadmap` now answers that the feature left AWOS. Your `context/product/roadmap.md` is untouched — keeping it current is yours to do — and while it exists, the spec topic question offers its incomplete items as candidates. |
| `/awos:flow` (plugin) | Nothing — commands it already generated for you keep working.                                                                                                                                                                                                                                                                            |
| Brownfield onboarding | Partly automatic: `/awos:architecture` inspects the codebase and adopts your existing technology stack as evidence-cited defaults you confirm in review. Product-level intent (what the product does, for whom) is not read from code — it comes from the `/awos:product` interview.                                                     |

"Keeps working" applies to the commands `/awos:flow` generated for you — they are yours, and AWOS never touches them. The retired `/awos:roadmap` is shut down gracefully instead: nothing of yours is deleted, but the local copy of the command body is replaced with a removal notice, so calling it tells you (and the agent) that the feature left AWOS rather than running a frozen 1.x copy. One thing to know: 2.0's spec flow no longer _builds on_ the roadmap (the topic is the anchor), so a roadmap you keep maintaining feeds specs only through the topic-candidate offer above.

## What the update does to your project

| File                                                 | What happens                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.awos/commands/roadmap.md`                          | Replaced with a removal notice where present, and created where only your wrapper remains — so `/awos:roadmap` answers that the feature left AWOS instead of running the 1.x copy.                                                                                     |
| `.awos/templates/roadmap-template.md`                | Left untouched where present (no longer shipped or updated) — yours, if you keep a roadmap by hand.                                                                                                                                                                    |
| `.claude/commands/awos/roadmap.md`                   | Preserved — the wrapper is yours; it now resolves to the removal notice.                                                                                                                                                                                               |
| `context/product/roadmap.md`                         | Preserved: AWOS no longer creates or updates it, but `/awos:spec` offers its items as topic candidates while it exists. Note that `/awos:verify` no longer marks items complete — if you keep using the roadmap, tick shipped items yourself. Yours to keep or delete. |
| `/implement-feature`, `/fix-bug`, `delivery-flow.md` | Preserved and disowned — generated for you, they keep working, they're yours now.                                                                                                                                                                                      |

## Version notes

- npm package: **2.0.0** (this release).
- awos plugin (`/awos:ai-readiness-audit`): **2.4.6** — a patch on its independent version line. Audit scoring is unchanged in this release; the version stamped in audit reports stays comparable with earlier 2.4.x audits.
