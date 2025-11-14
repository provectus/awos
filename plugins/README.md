# Claude Code Plugins

This directory contains some Claude Code plugins that extend functionality through custom commands, agents, and workflows.

## What are Claude Code Plugins?

Claude Code plugins are extensions that enhance Claude Code with custom slash commands, specialized agents, hooks, and MCP servers. Plugins can be shared across projects and teams, providing consistent tooling and workflows.

Learn more in the [official plugins documentation](https://docs.claude.com/en/docs/claude-code/plugins).

## Installation

1. **Add the marketplace:**

   ```
   /plugin marketplace add provectus/awos
   ```

2. **Install a specific plugin:**
   ```
   /plugin install plugin-name@awos
   ```

## Plugins in This Directory

### [prototype-prompt](./prototype-prompt/)

**UI Prototyping Prompt Generator**

#### Overview

- **What it does**: Generates a comprehensive, AI-optimized prompt for UI prototyping tools by synthesizing architecture documents and feature specifications.
- **When to use**: After `/awos:architecture` for basic prototype, or after a series of `/awos:spec` commands for detailed prototype
- **Audience**: UI/UX Designer (Non-Technical)

#### How to use

- **Installation**: `/plugin install prototype-prompt@awos`
- **Command**: `/awos:prototype-prompt:run` - Interactive workflow that creates a prototype prompt
- **Output**: `context/product/prototype-prompt.md` - Ready-to-use prompt for Figma Make, v0, Lovable, Bolt.new
