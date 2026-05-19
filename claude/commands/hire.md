---
description: Hires specialist agents — finds, installs skills, MCPs, and agents from registry, generates agent files.
argument-hint: '[focus areas, optional]'
allowed-tools: Bash(npx *), Bash(bunx *), Read, Write, Glob, Grep
---

@.awos/commands/hire.md

# Claude Code customizations (these layer on top of the framework defaults above):

- Use the `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.
