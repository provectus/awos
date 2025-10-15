# Contributing to AWOS

Thank you for your interest in contributing to AWOS! This guide will help you get started with local development and testing.

## Prerequisites

- **Node.js**: Version 22 or higher
- **npm**: Comes with Node.js
- **git**: For version control

## Local Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/awos.git
cd awos
```

### 2. Understand the Project Structure

```
awos/
├── docs/                # AWOS documentation
├── scripts/             # AWOS scripts
├── commands/            # AWOS command prompts
├── templates/           # Document templates
├── subagents/           # Subagent definitions
├── claude/              # Claude Code integration files
├── index.js              # Root entry point (delegates to src/)
└── src/                  # AWOS installer source code
```

## Testing Changes Locally

### We recommend testing in a Pet Project

The best way to test your changes is in a separate test project:

```bash
# 1. Create or navigate to your test project
cd ~/my-test-project

# 2. Run the installer from your local AWOS clone
npx /absolute/path/to/your/awos-clone/index.js

# Example:
npx ~/repos/provectus/awos/index.js
```

**Testing Updates (Force Overwrite):**

```bash
# Test the --force-overwrite flag
npx ~/repos/provectus/awos/index.js --force-overwrite
```

### What to Test

#### If you make changes to the command prompts or subagents:

- ✅ Commands and subagents are copied to the right locations
- ✅ Commands and subagents are working as expected

#### If you make changes to the installer code:

- ✅ All directories are created correctly
- ✅ Files are copied to the right locations
- ✅ `--force-overwrite` flag works as expected
- ✅ Existing files are preserved when flag is not used
- ✅ Error messages are clear and helpful
- ✅ Console output looks good (colors, formatting)
- ✅ `--dry-run` flag shows preview without making changes

## Working with Migrations

AWOS includes a migration system to safely update project structures between versions.

### Creating a New Migration

When you need to move or restructure files in existing installations:

1. Create a new JSON file in `src/migrations/`:

   ```
   src/migrations/NNN-description.json
   ```

   Where NNN is the next sequential number (e.g., 002, 003).

2. Define the migration with preconditions:
   ```json
   {
     "version": 2,
     "name": "Short description",
     "preconditions": {
       "require_any": ["files/that/must/exist.md"],
       "skip_if_any": ["files/indicating/already/migrated.md"]
     },
     "operations": [
       {
         "type": "move",
         "from": "old/path/file.md",
         "to": "new/path/file.md"
       }
     ]
   }
   ```

### Precondition Types

- **`require_any`**: At least one file must exist to run migration
- **`require_all`**: All files must exist to run migration
- **`skip_if_any`**: Skip if any of these files exist (already migrated)
- **`error_if_any`**: Fail if any of these files exist (conflict)

### Operation Types

- **`move`**: Move file from one location to another
- **`copy`**: Copy file to new location
- **`delete`**: Remove file

### Testing Migrations

```bash
# Test with dry-run (preview changes)
npx ~/repos/provectus/awos/index.js --dry-run

# Test on old structure
mkdir -p test-project/.claude/agents
echo "test" > test-project/.claude/agents/old-file.md
cd test-project
npx ~/repos/provectus/awos/index.js

# Verify migration ran
ls .awos/.migration-version  # Should contain latest version number
```

## Submitting a Pull Request

### Before Submitting

1. ✅ Test your changes in a test project
2. ✅ Run `npx prettier --write .` to format code
3. ✅ Ensure all files are committed
4. ✅ Write a clear PR description

## Release Process

### Automated Release Drafting

We use [release-drafter](https://github.com/release-drafter/release-drafter) to automatically compile pull requests into release notes.

### Version Increment Guidelines

PR labels determine version increment:

- `major` label: Increments major version
- `minor` label: Increments minor version
- `patch` label: Increments patch version
- if no label is present: Increments patch version

### Manual Release Publishing

To publish a release:

1. Navigate to GitHub Releases page
2. Edit the draft release
3. Optional: Update changelog
4. Click "Publish release"

**Important**: The npm package is published only after manually publishing the release.

---

Thank you for contributing to AWOS! 🚀
