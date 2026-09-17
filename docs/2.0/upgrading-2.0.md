# Upgrading to AWOS 2.0

AWOS 2.0 narrows the framework to its core method: agree on what to build, then build it. Two commands leave the framework — but nothing in your project is deleted or rewritten: local copies you already have are disowned in place and keep working. Updating is the same command as always:

```sh
npx @provectusinc/awos
```

Migrations handle the rest.

## What left the framework, and what replaces it

| Removed               | Replacement                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/awos:roadmap`       | Specs are anchored by an explicit topic: run `/awos:spec` and state what you want to build. A local copy of the command keeps working if you have one, and while `context/product/roadmap.md` exists, the spec topic question offers its incomplete items as candidates.             |
| `/awos:flow` (plugin) | Nothing — commands it already generated for you keep working.                                                                                                                                                                                                                        |
| Brownfield onboarding | Partly automatic: `/awos:architecture` inspects the codebase and adopts your existing technology stack as evidence-cited defaults you confirm in review. Product-level intent (what the product does, for whom) is not read from code — it comes from the `/awos:product` interview. |

"Keeps working" means your frozen 1.x copy: AWOS no longer ships, updates, or reads these commands, so they stay exactly as they are today — including any customizations — and you migrate to the replacement path on your own schedule. One thing to know: 2.0's spec flow no longer _builds on_ the roadmap (the topic is the anchor), so a roadmap you keep maintaining feeds specs only through the topic-candidate offer above.

## What the update does to your project

| File                                                 | What happens                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.awos/commands/roadmap.md`                          | Left untouched where present — your frozen 1.x copy keeps working; AWOS no longer ships or updates it. A wrapper pointing at a body your project doesn't have gets a removal notice instead.                                                                           |
| `.awos/templates/roadmap-template.md`                | Left untouched where present (no longer shipped or updated).                                                                                                                                                                                                           |
| `.claude/commands/awos/roadmap.md`                   | Preserved — the wrapper is yours; it keeps resolving to your local command.                                                                                                                                                                                            |
| `context/product/roadmap.md`                         | Preserved: AWOS no longer creates or updates it, but `/awos:spec` offers its items as topic candidates while it exists. Note that `/awos:verify` no longer marks items complete — if you keep using the roadmap, tick shipped items yourself. Yours to keep or delete. |
| `/implement-feature`, `/fix-bug`, `delivery-flow.md` | Preserved and disowned — generated for you, they keep working, they're yours now.                                                                                                                                                                                      |

## Version notes

- npm package: **2.0.0** (this release).
- awos plugin (`/awos:ai-readiness-audit`): **2.4.6** — a patch on its independent version line. Audit scoring is unchanged in this release; the version stamped in audit reports stays comparable with earlier 2.4.x audits.
