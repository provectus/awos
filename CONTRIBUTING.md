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

### Manual Release Publishing

To publish a release:

1. Navigate to GitHub Releases page
2. Edit the draft release
3. Optional: Update changelog
4. Click "Publish release"

**Important**: The npm package is published only after manually publishing the release.

---

Thank you for contributing to AWOS! 🚀
