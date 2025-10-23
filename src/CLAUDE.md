# AWOS Installer

## What This Is

**This is NOT the AWOS framework.** This is the **installer script** - a simple utility that sets up AWOS for end users.

**Think of it this way:**

- This code (`src/`) = The installer (like `npm install` or `apt-get`)
- The framework (`commands/`, `templates/`, `subagents/`, `claude/`) = The actual product

The actual AWOS framework - all the AI agent prompts, templates, and commands that help users build software - lives in the parent directories. This installer just copies those files into the user's project.

## What It Does

When a user runs `npx @provectusinc/awos --agent <agent-name>`, this script:

1. Creates directories in their project (`.awos/`, agent-specific dirs, `context/`)
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

### Core Files (All Agents)
| Source        | Destination       | Overwrite? |
| ------------- | ----------------- | ---------- |
| `commands/`   | `.awos/commands/` | Always     |
| `templates/`  | `.awos/templates/`| Always     |
| `scripts/`    | `.awos/scripts/`  | Always     |
| `subagents/`  | `.awos/subagents/`| Always     |

### Agent-Specific Files

**Claude (`--agent claude`):**
| Source             | Destination              | Overwrite?                    |
| ------------------ | ------------------------ | ----------------------------- |
| `claude/commands/` | `.claude/commands/awos/` | Only with `--force-overwrite` |
| `claude/agents/`   | `.claude/agents/`        | Only with `--force-overwrite` |

**GitHub Copilot (`--agent copilot`):**
| Source             | Destination         | Overwrite?                    |
| ------------------ | ------------------- | ----------------------------- |
| `copilot/prompts/` | `.github/prompts/`  | Only with `--force-overwrite` |

**Why the difference?**

- `.awos/` files = Framework internals (user shouldn't edit these) - always overwritten
- Agent-specific files = User customization layer (preserve their changes by default)

## CLI Flags

**`--agent <agent-name>`** (Required)

- Specifies which AI agent to configure
- Supported agents: `claude`, `copilot`
- Usage: `npx @provectusinc/awos --agent claude`
- Example: `npx @provectusinc/awos --agent copilot`

**`--force-overwrite`**

- Overwrites everything, including agent-specific customization files
- Use case: Updating AWOS to latest version
- User can recover their customizations via `git diff`

**`--dry-run`**

- Preview changes without modifying any files
- Shows what would be created/copied
- Use case: Testing before actual installation

## Common Modifications

**Add a new AI agent:**

1. Add agent name to `SUPPORTED_AGENTS` array in `config/setup-config.js`
   ```js
   const SUPPORTED_AGENTS = ['claude', 'copilot', 'your-agent'];
   ```

2. Add agent directories to `agentDirectories` object:
   ```js
   'your-agent': [
     {
       path: '.your-agent',
       description: 'Your agent configuration directory',
     },
   ],
   ```

3. Add copy operations to `agentCopyOperations` object:
   ```js
   'your-agent': [
     {
       source: 'your-agent/files',
       destination: '.your-agent/files',
       patterns: ['*'],
       overwrite: false,
       description: 'Your agent files',
     },
   ],
   ```

4. Create source directory with agent files in the package root (e.g., `your-agent/`)

**Add/remove core directories:**
→ Edit `coreDirectories` array in `config/setup-config.js`

**Add/remove core files to copy:**
→ Edit `coreCopyOperations` array in `config/setup-config.js`

**Change overwrite behavior:**
→ Edit `overwrite: true/false` in copy operations

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
