![Project Banner](media/awos-cover.webp)

# **Agentic Workflow Operating System**

**`awos`**[^1] is a framework for spec-driven development that transforms Claude Code from a chat interface into an autonomous engineering department. By creating a structured chain of intent, you enable agents to execute large-scale features independently — ensuring results that are production-ready.

## Quick Start

### Before You Begin

- **Node.js and npm**: Required only for the installer. The agents themselves do not require Node.js.
- **Claude Code**: This framework is designed for Claude Code. All examples assume you are using it.

**Note on Token Usage**: `awos` feeds large amounts of project context to the AI. Plan your Claude subscription or AWS Bedrock usage accordingly.

### Step 1: Install `awos`

```sh
npx @provectusinc/awos
```

This sets up the `.awos/` directory (commands, templates, scripts), the `.claude/commands/awos/` wrappers, and the `context/` directory where your project documents will live. It also registers the AWOS plugin marketplace in your project settings.

> **Running on an existing codebase?** You can skip the full workflow and go straight to an AI readiness audit. Install the plugin with `/plugin install awos@awos-marketplace`, then run `/awos:ai-readiness-audit` to get a scored assessment of your project with actionable recommendations.

### Step 2: Foundation Setup

These commands establish your project's foundation. Run them once at the start, and re-run them as your project evolves — requirements change, architecture decisions get refined, and that's normal.

| Command              | What it does                                                                      | Docs                                     |
| -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| `/awos:product`      | Defines the Product — what, why, and for who.                                     | [Details](docs/commands/product.md)      |
| `/awos:roadmap`      | Builds the Product Roadmap — features and their order.                            | [Details](docs/commands/roadmap.md)      |
| `/awos:architecture` | Defines the System Architecture — stack, DBs, infra.                              | [Details](docs/commands/architecture.md) |
| `/awos:hire`         | Hires specialist agents — finds, installs skills and MCPs, generates agent files. | [Details](docs/commands/hire.md)         |

### Step 3: Feature Development Cycle

Once your foundation is set, iterate through this cycle for each feature on your roadmap. These commands are designed to be run repeatedly — once per feature.

> **Tip**: Don't hesitate to delete specs after implementation. Completed specs can become outdated and confuse the AI. Your code documentation is the source of truth.

| Command           | What it does                                                                      | Docs                                  |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `/awos:spec`      | Creates the Functional Spec — what the feature does for the user.                 | [Details](docs/commands/spec.md)      |
| `/awos:tech`      | Creates the Technical Spec — how the feature will be built.                       | [Details](docs/commands/tech.md)      |
| `/awos:tasks`     | Breaks the Tech Spec into a task list for engineers.                              | [Details](docs/commands/tasks.md)     |
| `/awos:implement` | Runs tasks — delegates coding to sub-agents, tracks progress.                     | [Details](docs/commands/implement.md) |
| `/awos:verify`    | Verifies spec completion — checks acceptance criteria, marks Status as Completed. | [Details](docs/commands/verify.md)    |

> **When to skip the cycle**: Not every change needs a spec. Hotfixes, simple bugfixes, and small edits don't require the full spec workflow — Claude Code's built-in plan mode handles those just fine.

### Step 4: You're Awesome

That's it! By following these steps, you can systematically turn your vision into a well-defined and fully implemented product.

## The `awos` Philosophy

The **`awos`** framework is built on a simple but powerful idea: AI agents, like human developers, need clear context to do great work. Without a structured plan, even the most advanced LLM can act like a confused intern. **`awos`** provides a step-by-step workflow that transforms your vision into a detailed blueprint that AI agents can understand and execute flawlessly.

[Read more about the philosophy behind **`awos`**](docs/rationale.md)

## Command Reference

Each command has detailed documentation covering how it works, key behaviors, common misconceptions, and example usage.

[Browse all command docs](docs/commands/)

## Testing Strategies

The **`awos`** framework is flexible and non-prescriptive when it comes to testing. Teams can adopt the testing approach that best fits their project — whether that's TDD, BDD, integration testing, or a combination of strategies.

[Explore testing strategies and customization options](docs/testing-strategies.md)

## Customizing `awos`

The **`awos`** framework is designed to be both powerful out-of-the-box and highly customizable.

### The `.awos` Folder: Framework Core (Do Not Edit)

All framework service data lives in the `.awos/` directory:

- `.awos/commands` - Full command prompt instructions
- `.awos/templates` - Document templates
- `.awos/scripts` - Utility scripts

**Warning:** Do NOT manually edit files in the `.awos/` folder. These files are always overwritten during updates.

### The `.claude` Folder: Your Customization Layer

This is where you customize **`awos`** to fit your needs:

- **`.claude/commands/awos/{command}.md`** - Lightweight wrapper files that link to `.awos/commands/{command}.md`

### How to Customize

**Example: Customize a Command**

Open `.claude/commands/awos/implement.md` and add your instructions:

```diff
---
description: Runs tasks — delegates coding to sub-agents, tracks progress.
---

Refer to the instructions located in this file: .awos/commands/implement.md

+ - Always run tests after implementing each task
+ - Follow the code style guide in docs/style-guide.md
```

## Updating `awos`

To update **`awos`** to the latest version, run the installer again:

```sh
npx @provectusinc/awos
```

**What gets updated:**

- Commands in `.awos/commands`
- Templates in `.awos/templates`
- Scripts in `.awos/scripts`
- Commands in `.claude/commands/awos`

**Important:** The installer will overwrite existing files in `.claude/commands/awos`. If you've customized these files, back them up first.

---

[^1]: The Russian word «авось» (a-VOHS') doesn't have a direct equivalent in English — it's a very culturally loaded concept. It's a mix of hope, chance, and fatalism, often with a sense of "let's do it and maybe it will work out."
