# AWOS Plugins

Claude Code plugins distributed through the AWOS marketplace.

## Installation

The AWOS marketplace is registered automatically when you install AWOS (`npx @provectusinc/awos`). Once registered, install plugins with:

```
/plugin install awos@awos-marketplace
```

To register the marketplace manually:

```
/plugin marketplace add provectus/awos
```

## Available Plugins

| Plugin                         | Commands                                 | Description                                                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **awos**                       | `/awos:ai-readiness-audit`, `/awos:flow` | Comprehensive AI readiness audit across 8 dimensions — security, architecture, documentation, AI tooling, and more — plus end-to-end delivery-flow setup tailored to the team.                                                                   |
| **better-spec** (experimental) | `/better-spec:spec`                      | Research-backed functional specs: parallel codebase/web/internal-KB research agents before drafting, and a blind verification pass after writing. Same deliverable contract as `/awos:spec`. See [better-spec/README.md](better-spec/README.md). |
