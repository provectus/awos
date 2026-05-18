---
description: Runs tasks — delegates coding to sub-agents, tracks progress.
argument-hint: '[spec or task, optional — defaults to next pending]'
disable-model-invocation: true
---

@.awos/commands/implement.md

# Claude Code customizations (these layer on top of the framework defaults above):

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.
