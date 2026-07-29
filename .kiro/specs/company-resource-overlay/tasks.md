# Implementation Plan: Company Resource Overlay

## Overview

This plan implements the company resource overlay system in three main components: the Resource Resolver module for manifest loading/validation/search/merge, the Kiro Installer extension (`installOverlay`) for last-mile installation of skills/agents/MCPs, and the Validation CLI for standalone manifest checking. All code resides in `.awos-adapters/lib/` using pure Node.js with no external dependencies (except `fast-check` as a dev dependency for property-based tests).

## Tasks

- [x] 1. Create Resource Resolver module with manifest loading and schema validation
  - [x] 1.1 Create `.awos-adapters/lib/resource-resolver.js` with manifest JSON schema, `discover()` function, and `validate()` function
    - Define the manifest JSON schema as a JavaScript object matching the design spec
    - Implement schema validation logic (required fields, name pattern, type enum, path traversal guard)
    - Implement `discover(projectRoot)` — check for `.awos-company/manifest.json`, parse JSON, validate schema, resolve paths, handle duplicates, accumulate warnings
    - Implement `validate(projectRoot)` — schema validation + file path existence checks, returning `ValidationResult`
    - Export `discover`, `validate` as module API
    - _Requirements: 1.1, 1.2, 1.4, 1.6, 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 11.1, 11.2, 11.3_

  - [x] 1.2 Write property tests for schema validation (Property 1: Schema Validation Correctness)
    - **Property 1: Schema Validation Correctness**
    - **Validates: Requirements 2.1, 2.2, 2.6, 2.7, 11.2**
    - Use `fast-check` to generate random valid and invalid manifest objects
    - Assert validator accepts iff all required fields present with correct types and formats

  - [x] 1.3 Write property tests for missing path resilience (Property 2: Missing Path Resilience)
    - **Property 2: Missing Path Resilience**
    - **Validates: Requirements 1.4, 2.8, 11.3**
    - Generate manifests with N entries, K of which have non-existent paths
    - Assert exactly N−K resolved resources and K warnings returned

  - [x] 1.4 Write property tests for duplicate name deduplication (Property 3: Duplicate Name Deduplication)
    - **Property 3: Duplicate Name Deduplication**
    - **Validates: Requirements 2.5**
    - Generate manifests with duplicate name entries
    - Assert only first occurrence kept, one warning per additional duplicate

- [x] 2. Implement search matching and result merging in Resource Resolver
  - [x] 2.1 Add `matchQuery(resources, query)` function to `resource-resolver.js`
    - Tokenize query by whitespace
    - Case-insensitive substring match on `name`
    - Case-insensitive exact match on individual `tags` entries
    - Return all resources matching at least one criterion
    - _Requirements: 3.6, 3.7_

  - [x] 2.2 Add `mergeResults(upstream, overlay)` function to `resource-resolver.js`
    - Build name+type map from overlay resources
    - Filter upstream to exclude duplicates by (name, type) pair
    - Concatenate remaining upstream with overlay
    - Return merged array with source indicators
    - _Requirements: 3.3, 9.1, 9.3_

  - [x] 2.3 Write property tests for search query matching (Property 4: Search Query Matching)
    - **Property 4: Search Query Matching**
    - **Validates: Requirements 3.6, 3.7**
    - Generate random resources with names/tags and random query strings
    - Assert match iff name contains term as substring OR tag exactly equals term (case-insensitive)

  - [x] 2.4 Write property tests for merge prefers overlay (Property 5: Merge Prefers Overlay)
    - **Property 5: Merge Prefers Overlay**
    - **Validates: Requirements 3.3, 9.3**
    - Generate upstream and overlay lists with controlled overlaps
    - Assert all overlay resources present, upstream duplicates excluded, non-duplicates kept

- [x] 3. Checkpoint - Ensure all Resource Resolver tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend Kiro Installer with `installOverlay` function
  - [x] 4.1 Add skill installation logic to `.awos-adapters/lib/installers/kiro.js`
    - Implement `installOverlay(projectRoot, resources, options)` function
    - Filter resources by `type === 'skill'`
    - Read source file, extract YAML frontmatter, validate `name` field
    - Create `.kiro/skills/{name}/` directory with `mkdir({ recursive: true })`
    - Copy skill file preserving source filename
    - Handle missing frontmatter (warn and skip)
    - Export `installOverlay` from module
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.2_

  - [x] 4.2 Add agent installation logic to `installOverlay` in `kiro.js`
    - Filter resources by `type === 'agent'`
    - Read source file, extract YAML frontmatter (`name`, `description`, `skills`)
    - Parse `skills` as comma-separated list
    - Verify each skill exists in overlay resources or in `.kiro/skills/`
    - Skip agent and warn if any skill dependency missing
    - Generate steering file at `.kiro/steering/{agent-name}.md` with `inclusion: manual` frontmatter and skill references
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.3_

  - [x] 4.3 Add MCP configuration installation logic to `installOverlay` in `kiro.js`
    - Filter resources by `type === 'mcp'`
    - Read and JSON-parse MCP config source files
    - Read existing `.kiro/settings/mcp.json` or create with `{ "mcpServers": {} }` if missing
    - Merge new server entries under `mcpServers`, preserving existing non-conflicting entries
    - Skip conflicting server names with warning (non-interactive mode)
    - Preserve `${VARIABLE_NAME}` env references as literal strings
    - Write merged JSON back to file
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.4, 10.7_

  - [x] 4.4 Write property tests for skill installation content preservation (Property 6: Skill Installation Content Preservation)
    - **Property 6: Skill Installation Content Preservation**
    - **Validates: Requirements 4.2, 4.3, 10.2**
    - Generate valid skill files with random content and manifest names
    - Assert installed file is byte-identical to source

  - [x] 4.5 Write property tests for installation idempotence (Property 7: Installation Idempotence)
    - **Property 7: Installation Idempotence**
    - **Validates: Requirements 4.4, 5.6**
    - Run `installOverlay` twice with same inputs
    - Assert filesystem state identical after both calls, second call produces zero errors

  - [x] 4.6 Write property tests for agent steering generation (Property 8: Agent Steering Generation)
    - **Property 8: Agent Steering Generation**
    - **Validates: Requirements 5.3, 10.3**
    - Generate valid agents with existing skill dependencies
    - Assert steering file exists with `inclusion: manual` frontmatter and all skills referenced

  - [x] 4.7 Write property tests for agent skill dependency check (Property 9: Agent Skill Dependency Check)
    - **Property 9: Agent Skill Dependency Check**
    - **Validates: Requirements 5.4, 5.5**
    - Generate agents referencing non-existent skills
    - Assert agent skipped with warning, remaining resources installed successfully

  - [x] 4.8 Write property tests for MCP merge preserves existing entries (Property 10: MCP Merge Preserves Existing Entries)
    - **Property 10: MCP Merge Preserves Existing Entries**
    - **Validates: Requirements 6.3, 10.4**
    - Generate existing mcp.json with entries and new overlay entries with no key overlap
    - Assert all original entries preserved and new entries added

  - [x] 4.9 Write property tests for environment variable reference preservation (Property 11: Environment Variable Reference Preservation)
    - **Property 11: Environment Variable Reference Preservation**
    - **Validates: Requirements 6.5**
    - Generate MCP configs with `${VAR}` syntax in env values
    - Assert literal `${...}` strings in output mcp.json

- [x] 5. Checkpoint - Ensure all Kiro Installer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Validation CLI and wire bin entry
  - [x] 6.1 Create `.awos-adapters/lib/cli/overlay-validate.js` CLI entry point
    - Implement `#!/usr/bin/env node` script
    - Call `validate(process.cwd())` from resource-resolver
    - Output schema errors to stderr with JSON path and description
    - Output missing path errors to stderr with entry name and path
    - Print success summary to stdout if no errors
    - Exit with code 0 on success, 1 on errors
    - _Requirements: 11.4, 11.5, 11.6_

  - [x] 6.2 Register the `overlay validate` subcommand in `package.json` or index.js CLI routing
    - Add CLI routing so `npx awos overlay validate` invokes `cli/overlay-validate.js`
    - Ensure the command works from any project directory (uses `process.cwd()`)
    - _Requirements: 11.4_

  - [x] 6.3 Write unit tests for Validation CLI
    - Test valid manifest → exit code 0, stdout contains resource count
    - Test invalid manifest → exit code 1, stderr contains schema errors
    - Test missing manifest → appropriate error handling
    - Test missing file paths → exit code 1, stderr contains path errors
    - _Requirements: 11.4, 11.5, 11.6_

- [x] 7. Implement protected paths invariant and backward compatibility
  - [x] 7.1 Add path safety guard to `installOverlay` ensuring no writes to protected directories
    - Before any file write, verify target path is not under `.awos/`, `commands/`, `plugins/`, `templates/`, or `src/`
    - Error and skip if a resolved path would touch protected directories
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 7.2 Ensure `install()` function backward compatibility when no overlay exists
    - When `.awos-company/` is absent, `installOverlay` returns empty result immediately
    - The existing `install()` behavior is unchanged for projects without overlays
    - Integrate `installOverlay` call into the `install()` flow (after `installSteering` and `installHooks`)
    - _Requirements: 7.3, 7.4, 10.1, 10.5, 10.6_

  - [x] 7.3 Write property tests for protected paths invariant (Property 12: Protected Paths Invariant)
    - **Property 12: Protected Paths Invariant**
    - **Validates: Requirements 7.1, 7.5**
    - Generate overlay operations and assert no file created/modified/deleted under protected paths

  - [x] 7.4 Write property tests for backward compatibility without overlay (Property 13: Backward Compatibility Without Overlay)
    - **Property 13: Backward Compatibility Without Overlay**
    - **Validates: Requirements 7.4, 10.6**
    - Run extended `install()` on projects without `.awos-company/`
    - Assert output identical to pre-extension behavior

- [x] 8. Add test fixtures and unit tests for full integration
  - [x] 8.1 Create test fixture directories under `tests/overlay/fixtures/`
    - Create `overlay-valid/` with a valid `.awos-company/manifest.json` and sample skill/agent/MCP files
    - Create `overlay-invalid/` with a broken manifest (missing required fields, bad types)
    - Create `overlay-mixed/` with some valid and some invalid entries (missing paths, duplicates)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 2.1, 2.2_

  - [x] 8.2 Write unit tests for `discover()` and `validate()` functions
    - Test missing directory, missing manifest, empty manifest, valid manifest, invalid JSON
    - Test schema pass and schema fail for each field type
    - Test path existence checks
    - _Requirements: 1.2, 1.4, 2.1, 2.2, 2.5, 2.6, 2.7, 2.8, 11.1, 11.2, 11.3_

  - [x] 8.3 Write unit tests for `matchQuery()` and `mergeResults()` functions
    - Test single term, multi-term, no match, tag match, name match, case variations
    - Test no overlap, full overlap, partial overlap, empty inputs
    - _Requirements: 3.3, 3.6, 3.7, 9.1, 9.3_

  - [x] 8.4 Write unit tests for `installOverlay()` end-to-end scenarios
    - Test valid skill install, missing frontmatter skip, idempotent reinstall
    - Test valid agent install, missing skill dep skip, steering file content
    - Test MCP new entry, MCP conflict skip, create from scratch, env var preservation
    - _Requirements: 4.1–4.5, 5.1–5.6, 6.1–6.6, 10.1–10.7_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code uses pure Node.js (`node:fs`, `node:path`, `node:assert/strict`) — no external runtime dependencies
- `fast-check` is the only dev dependency added (for property-based testing)
- The test runner is the Node.js built-in `node --test` already configured in package.json

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5"] },
    { "id": 4, "tasks": ["4.6", "4.7", "4.8", "4.9", "7.1"] },
    { "id": 5, "tasks": ["6.1", "7.2"] },
    { "id": 6, "tasks": ["6.2", "6.3", "7.3", "7.4"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4"] }
  ]
}
```
