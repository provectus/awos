# AWOS Installer

## What This Is

**This is NOT the AWOS framework.** This is the **installer script** - a simple utility that sets up AWOS for end users.

**Think of it this way:**

- This code (`src/`) = The installer (like `npm install` or `apt-get`)
- The framework (`commands/`, `templates/`, `claude/`) = The actual product

The actual AWOS framework - all the AI agent prompts, templates, and commands that help users build software - lives in the parent directories. This installer just copies those files into the user's project.

## What It Does

When a user runs `npx @provectusinc/awos`, this script:

1. Creates directories in their project (`.awos/`, `.claude/`, `context/`)
2. Copies framework files from this package into those directories
3. Shows progress messages and statistics

That's it. Simple file copying with a nice UI.

## File Structure

```
src/
├── config/
│   ├── setup-config.js     # Lists what to copy and where (incl. preserveOnUpdate flag)
│   └── constants.js        # UI styling (colors, ASCII art)
├── services/
│   ├── file-copier.js      # Does the file copying + preserveOnUpdate conflict scan
│   ├── directory-creator.js # Creates directories
│   ├── mcp-configurator.js
│   └── marketplace-configurator.js
├── utils/
│   ├── fs-utils.js
│   ├── logger.js
│   ├── pattern-matcher.js
│   └── prompt.js           # readline-based overwrite prompt (Y/N + explanation)
├── core/
│   └── setup-orchestrator.js # Runs setup steps in order, plumbs promptForOverwrite
└── index.js                 # Entry point, parses CLI args (--dry-run, --overwrite, --no-overwrite)
```

## What Gets Copied Where

From `config/setup-config.js`:

| Source             | Destination              | preserveOnUpdate |
| ------------------ | ------------------------ | ---------------- |
| `commands/`        | `.awos/commands/`        | no               |
| `templates/`       | `.awos/templates/`       | no               |
| `scripts/`         | `.awos/scripts/`         | no               |
| `claude/commands/` | `.claude/commands/awos/` | **yes**          |

`.claude/agents/` is intentionally **not** a copy destination — it is the user's customization area for project-local subagents. AWOS-shipped agents (e.g. `testing-expert`) ride in via `awos-recruitment` on demand, so the installer never auto-populates this directory.

**Why the difference?**

- `.awos/` files = Framework internals (user shouldn't edit these; overwritten on every run)
- `.claude/` files = User customization layer (user can edit these; preserved on update unless the user opts back into overwrite)

Operations marked `preserveOnUpdate: true` run a conflict scan in `file-copier.js`. If pre-existing files would be overwritten, it consults the `promptForOverwrite` callback. The default callback (built by `utils/prompt.js`) prints an explanation + file list + manual-update URL in a TTY, or returns `false` (preserve) in non-TTY runs. `--overwrite`/`--no-overwrite` short-circuit the decision.

## CLI Flags

**`--dry-run`** — Shows preview of what will be updated without making changes.

**`--overwrite`** — Forces overwrite of `.claude/commands/awos/*` even when those wrappers already exist. Use in CI or scripted reinstalls when you intentionally want a fresh sync.

**`--no-overwrite`** — Explicit opt-out from overwriting `.claude/commands/awos/*`. Same effect as the safe default for non-TTY runs.

Files under `.awos/` are updated unconditionally — these are framework internals. Files under `.claude/commands/awos/` are the user's customization layer; the installer prompts before overwriting them when they already exist. In non-interactive runs (no TTY), the default is **preserve** to avoid silently clobbering user edits — pass `--overwrite` to override.

## Common Modifications

**Add/remove directories:**
→ Edit `directories` array in `config/setup-config.js`

**Add/remove files to copy:**
→ Edit `copyOperations` array in `config/setup-config.js`

**Add new CLI flags:**
→ Parse in `index.js`, pass to orchestrator, use in services

**Change messages/styling:**
→ Edit `config/constants.js` or `utils/logger.js`

## Why This Exists

Users need a consistent, safe way to install and update AWOS. This installer:

- Ensures correct directory structure
- Protects user customizations (by default)
- Shows helpful progress messages
- Makes updates easy and safe

Without this, users would manually copy files and inevitably mess something up.
