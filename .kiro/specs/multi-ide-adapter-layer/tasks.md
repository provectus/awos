# Implementation Plan: Multi-IDE Adapter Layer

## Overview

Implements the adapter pattern for translating AWOS command prompts into IDE-native instruction formats. A code generation pipeline (CLI → Parser → IR → Emitter Dispatcher → per-Provider emitters) produces adapter files in `.awos-adapters/` for Kiro, Cursor, Codex, Cline, and Continue. Zero npm dependencies — Node.js 22+ built-in modules only.

## Tasks

- [x] 1. Core infrastructure — parser, IR, CLI scaffolding, splitter
  - [x] 1.1 Create directory structure and provider configuration
    - Create `.awos-adapters/lib/emitters/` directory layout
    - Create `providers.json` with Kiro and Cursor enabled, Codex/Cline/Continue disabled
    - Create `.awos-adapters/README.md` documenting the upstream-is-king policy
    - _Requirements: 1.1, 1.4, 14.3, 14.4, 15.1_

  - [x] 1.2 Implement the Intermediate Representation module (`lib/ir.js`)
    - Define `CommandIR`, `ToolReference`, `ProcessStep`, `Frontmatter`, `RoleSection`, `TaskSection`, `IOSection`, `InteractionSection`, `ProcessSection` data structures
    - Implement `serialize(ir)` → JSON string
    - Implement `deserialize(json)` → CommandIR
    - Include auto-generated header comment utility
    - _Requirements: 2.4, 3.1, 3.2, 3.3_

  - [x] 1.3 Implement the Markdown Parser (`lib/parser.js`)
    - Implement `parseCommand(filePath, content)` extracting ROLE, TASK, INPUTS & OUTPUTS, INTERACTION, PROCESS sections
    - Extract YAML frontmatter (description, argument-hint)
    - Identify and tag Claude Code tool references (Agent, Read, Glob, AskUserQuestion, Explore, Plan) with tool type, context, line number, and parameters
    - Implement `parseAllCommands(commandsDir)` for batch processing
    - On malformed files: report error with file path, continue processing remaining files
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.4 Implement the File Splitter (`lib/splitter.js`)
    - Implement `splitIfNeeded(file, maxLines)` enforcing the 500-line constraint
    - Split naming convention: `{command}-{section}.md`
    - Merge fragments <10 lines with adjacent fragment
    - _Requirements: 12.1, 12.2_

  - [x] 1.5 Implement the Provider Registry (`lib/registry.js`)
    - Implement `loadProviders(configPath)` reading `providers.json`
    - Implement `detectProviders(projectRoot)` checking for IDE-specific markers (`.kiro/`, `.cursor/`, `.clinerules`, `.cline/`, `.continue/`, `codex.json`, `.codex/`)
    - Fall back to defaults (Kiro + Cursor enabled) when `providers.json` is missing
    - _Requirements: 13.1, 13.2, 13.3, 15.1, 15.2_

  - [x] 1.6 Implement the Validator (`lib/validator.js`)
    - Define `ValidationRule` structure per Provider (file extensions, JSON/YAML validity, directory nesting)
    - Implement `validate(provider, files)` returning all violations
    - Each violation includes provider name, file path, rule description, and suggested fix
    - _Requirements: 16.1, 16.2_

  - [x] 1.7 Implement the Base Emitter (`lib/emitters/base-emitter.js`)
    - Define `EmitResult`, `GeneratedFile`, `DelegationStrategy` contracts
    - Implement shared utilities: auto-generated header insertion, path normalization, context-path resolution
    - Define delegation strategy types: `subagent`, `sequential`, `manual`
    - _Requirements: 9.1, 14.3_

  - [x] 1.8 Implement the CLI entry point (`generate.js`)
    - Parse CLI flags: `--provider`, `--dry-run`, `--dump-ir`, `--detect`, `--validate`
    - Orchestrate pipeline: parse commands → build IR → dispatch to emitters → validate → write files → update manifest
    - Check Node.js version ≥22, check `.awos/commands/` exists
    - Validate no uncommitted changes in upstream dirs (warning only)
    - Print summary of generated files grouped by Provider (file count, line count)
    - Emit warning to stderr when any file exceeds 400 lines
    - Generate `manifest.json` with timestamps, node version, source hash, per-provider stats
    - _Requirements: 1.3, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.4, 14.1_

- [x] 2. Checkpoint — Core infrastructure validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase 1 emitters — Kiro and Cursor
  - [x] 3.1 Implement the Kiro Emitter (`lib/emitters/kiro.js`)
    - Emit steering files to `.awos-adapters/kiro/steering/` for each AWOS command
    - Translate `AskUserQuestion` → plain-text chat prompts
    - Translate `Agent` → `invoke_sub_agent` with `general-task-execution` agent type
    - Translate `Read` → `read_file` tool references
    - Translate `Glob` → `file_search` tool references
    - Translate `Explore` → `context-gatherer` agent
    - Produce hook definitions for workflow transitions (post-task-execution triggers)
    - Reference `context/` using workspace-relative paths
    - Apply 500-line split via splitter when needed
    - Include auto-generated header in all output files
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.2, 9.4, 10.2_

  - [x] 3.2 Write property tests for Kiro emitter
    - **Property 5: Tool translation correctness per Provider (Kiro)**
    - **Property 6: Path reference integrity**
    - **Property 7: File size invariant**
    - **Property 8: Process step encoding**
    - **Property 9: Delegation strategy correctness (Kiro)**
    - **Property 11: Auto-generated header presence**
    - **Validates: Requirements 4.2, 4.3, 4.5, 4.6, 9.2, 9.4, 14.3**

  - [x] 3.3 Implement the Cursor Emitter (`lib/emitters/cursor.js`)
    - Emit rule files to `.awos-adapters/cursor/rules/` for each AWOS command
    - Translate `Read` → `@-file` reference syntax
    - Translate `Agent` → sequential composer prompt instructions with explicit context reloading
    - Translate `Glob` → `@folder` reference syntax
    - Include context injection directives loading `context/` documents
    - Produce `.cursor/rules/awos.mdc` master rule file referencing all generated rules
    - Reference `context/` using workspace-relative paths
    - Apply 500-line split via splitter when needed
    - Include auto-generated header in all output files
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.2, 9.4, 10.2_

  - [x] 3.4 Write property tests for Cursor emitter
    - **Property 5: Tool translation correctness per Provider (Cursor)**
    - **Property 6: Path reference integrity**
    - **Property 7: File size invariant**
    - **Property 8: Process step encoding**
    - **Property 9: Delegation strategy correctness (Cursor)**
    - **Property 11: Auto-generated header presence**
    - **Validates: Requirements 5.2, 5.3, 5.4, 9.2, 9.4, 14.3**

- [x] 4. Checkpoint — Phase 1 emitters complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Phase 2 emitters — Codex, Cline, Continue
  - [x] 5.1 Implement the Codex Emitter (`lib/emitters/codex.js`)
    - Emit task files to `.awos-adapters/codex/tasks/` for each AWOS command
    - Translate `Agent` → sequential `codex --auto` invocations with `--context-file` references
    - Include instructions for loading `context/` documents as context file arguments
    - Encode PROCESS steps as individually-executable Codex task descriptions
    - Reference `context/` using workspace-relative paths
    - Apply 500-line split and auto-generated header
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 9.2, 9.4, 10.2_

  - [x] 5.2 Implement the Cline Emitter (`lib/emitters/cline.js`)
    - Emit rule files to `.awos-adapters/cline/rules/` and memory bank templates to `.awos-adapters/cline/memory-bank/`
    - Translate `Agent` → sequential task execution with memory bank state tracking
    - Map ROLE section to Cline system prompt format
    - Encode auto-approve patterns for known-safe file operations in `context/`
    - Reference `context/` using workspace-relative paths
    - Apply 500-line split and auto-generated header
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.2, 9.4, 10.2_

  - [x] 5.3 Implement the Continue Emitter (`lib/emitters/continue.js`)
    - Emit configuration entries in `.awos-adapters/continue/config/` for each AWOS command
    - Map each command to a custom slash command definition
    - Define context providers that inject `context/` documents based on active command
    - Translate `Agent` → custom slash command iterating tasks as individual prompts
    - Reference `context/` using workspace-relative paths
    - Apply 500-line split and auto-generated header
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.2, 9.4, 10.2_

  - [x] 5.4 Write property tests for Phase 2 emitters
    - **Property 5: Tool translation correctness per Provider (Codex, Cline, Continue)**
    - **Property 6: Path reference integrity**
    - **Property 8: Process step encoding**
    - **Property 9: Delegation strategy correctness (Codex, Cline, Continue)**
    - **Validates: Requirements 6.2, 6.3, 6.4, 7.2, 7.3, 8.2, 8.3, 8.4, 9.2, 9.4**

- [x] 6. Checkpoint — All emitters complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Testing and validation layer
  - [x] 7.1 Implement the custom PBT harness (`tests/lib/pbt.js`)
    - Implement `forAll(name, generator, property, options)` using `node:crypto` for randomness
    - Support: iteration count configuration, seed reporting on failure, basic shrinking
    - Keep under 100 lines, zero external dependencies
    - _Requirements: 16.3_

  - [x] 7.2 Implement test generators (`tests/generators/`)
    - `command-gen.js`: `genFrontmatter()`, `genSection(name)`, `genCommandMarkdown()`, `genMalformedCommand()`, `genToolReference(tool)`
    - `ir-gen.js`: `genIR()` producing random valid CommandIR objects
    - `filesystem-gen.js`: `genMarkerCombination()` for IDE marker subsets
    - _Requirements: 16.3, 16.4_

  - [x] 7.3 Implement parser property tests (`tests/properties/parser-properties.test.js`)
    - **Property 1: Parsing completeness** — valid command produces IR with all sections populated
    - **Property 2: Tool reference identification** — all tool references tagged with type, context, line number
    - **Property 3: Error resilience under malformed input** — valid files parsed, errors reported for malformed
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [x] 7.4 Implement IR round-trip property test (`tests/properties/ir-roundtrip.test.js`)
    - **Property 4: IR serialization round-trip** — serialize→deserialize→emit equals parse→emit
    - **Validates: Requirements 3.2, 3.3**

  - [x] 7.5 Implement detection and validation property tests
    - `tests/properties/detection-properties.test.js` — **Property 10: Provider detection accuracy**
    - `tests/properties/warnings-properties.test.js` — **Property 12: File size warning threshold**
    - `tests/properties/validation-properties.test.js` — **Property 13: Structural validation detection**
    - **Validates: Requirements 12.4, 13.1, 16.1**

  - [x] 7.6 Implement example-based unit tests (`tests/`)
    - `parser.test.js`: CLI flag behavior, section extraction edge cases
    - `ir.test.js`: serialization edge cases, empty fields
    - `splitter.test.js`: boundary conditions, fragment merge logic
    - `validator.test.js`: per-provider rule checks
    - _Requirements: 16.3_

  - [x] 7.7 Implement fixture-based regression tests
    - Create `tests/fixtures/implement.md` fixture (most complex command with delegations)
    - `tests/emitters.test.js`: parse fixture → emit per Provider → compare against stored snapshots
    - Store expected-output snapshots per Provider alongside fixtures
    - _Requirements: 16.4_

- [x] 8. Checkpoint — Testing layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Documentation and integration
  - [x] 9.1 Write integration tests (`tests/integration.test.js`)
    - End-to-end generation from real `.awos/commands/` directory
    - Provider independence verification (Kiro alone, Cursor alone)
    - Full pipeline: parse → IR → emit → validate → manifest
    - _Requirements: 15.3, 15.4_

  - [x] 9.2 Add `.gitattributes` entry and finalize output metadata
    - Add `.gitattributes` marking `.awos-adapters/` as fork-owned content excluded from upstream diffs
    - Ensure manifest.json schema matches design (generatedAt, nodeVersion, sourceHash, per-provider stats)
    - _Requirements: 1.3, 14.2_

  - [x] 9.3 Wire end-to-end pipeline and verify all providers
    - Verify `generate.js` orchestrates full pipeline for all 5 providers
    - Verify `--dry-run`, `--provider`, `--detect`, `--validate`, `--dump-ir` flags work correctly
    - Verify shared state: all providers reference `context/` paths, no provider-specific state outside `.awos-adapters/`
    - Verify phased rollout: Kiro+Cursor work independently of Phase 2 providers
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 11.2, 11.3, 11.5, 15.3_

- [x] 10. Final checkpoint — All tests pass, integration verified
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate the 13 universal correctness properties defined in the design
- All code uses Node.js 22+ built-in modules only (`node:fs`, `node:path`, `node:test`, `node:assert/strict`, `node:crypto`)
- Follow upstream Prettier formatting (single quotes, semicolons, 80-col, 2-space, LF, es5 trailing commas)
- No hard-wrapped markdown prose in generated adapter files

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "1.6"] },
    { "id": 2, "tasks": ["1.7"] },
    { "id": 3, "tasks": ["1.8"] },
    { "id": 4, "tasks": ["3.1", "3.3"] },
    { "id": 5, "tasks": ["3.2", "3.4", "5.1", "5.2", "5.3"] },
    { "id": 6, "tasks": ["5.4", "7.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 9, "tasks": ["7.6", "7.7"] },
    { "id": 10, "tasks": ["9.1", "9.2"] },
    { "id": 11, "tasks": ["9.3"] }
  ]
}
```
