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

| Plugin                    | Commands                   | Description                                                                                                                                                                                                                            |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **awos**                  | `/awos:ai-readiness-audit` | Comprehensive AI readiness audit across scored dimensions — security, architecture, documentation, AI tooling, and more. See [awos/README.md](awos/README.md).                                                                         |
| **better** (experimental) | `/better:spec`             | Research-backed functional specs: parallel codebase/web/internal-KB research agents before drafting, and a blind verification pass after writing. Same deliverable contract as `/awos:spec`. See [better/README.md](better/README.md). |
