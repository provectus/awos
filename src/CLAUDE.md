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
│   ├── setup-config.js    # Lists what to copy and where
│   └── constants.js        # UI styling (colors, ASCII art)
├── services/
│   ├── file-copier.js      # Does the file copying
│   └── directory-creator.js # Creates directories
├── core/
│   └── setup-orchestrator.js # Runs setup steps in order
└── index.js                 # Entry point, parses CLI args
```

## What Gets Copied Where

From `config/setup-config.js`:

| Source             | Destination              |
| ------------------ | ------------------------ |
| `commands/`        | `.awos/commands/`        |
| `templates/`       | `.awos/templates/`       |
| `scripts/`         | `.awos/scripts/`         |
| `claude/commands/` | `.claude/commands/awos/` |

**Why the difference?**

- `.awos/` files = Framework internals (user shouldn't edit these)
- `.claude/` files = User customization layer (preserve their changes)

## CLI Flags

**`--dry-run`**

- Shows preview of what will be updated without making changes

Files are updated by default when running the installer. This ensures users always have the latest version of AWOS components.

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
