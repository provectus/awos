# Requirements Document

## Introduction

This specification defines a multi-IDE adapter layer for the AWOS framework that translates Claude Code-specific conventions into IDE-native equivalents. The adapter layer lives in `.awos-adapters/` and enables AWOS spec-driven workflows to run across Kiro, Cursor, Codex, Antigravity, and VSCode extensions (Cline, Continue) without modifying the upstream framework. The `context/` directory serves as shared state across all IDEs, and a code generation script produces IDE-specific instruction files from the canonical AWOS commands.

## Glossary

- **Adapter**: A module that translates AWOS command prompts into an IDE's native instruction format (steering files, rules, task definitions)
- **Upstream**: The canonical provectus/awos repository content in `commands/`, `templates/`, `scripts/`, `src/` — never modified by the adapter layer
- **Generate_Script**: The `generate-adapters` script that reads `.awos/commands/*.md` and produces IDE-specific output files in `.awos-adapters/{ide}/`
- **Provider**: A target IDE or AI development environment (Kiro, Cursor, Codex, Antigravity, Cline, Continue)
- **Delegation_Strategy**: The per-IDE approach for handling subagent task delegation, the hardest feature to port from Claude Code's native `Agent` tool
- **Shared_State**: The `context/` directory structure that all IDEs read from and write to, maintaining workflow continuity across providers
- **Command_Prompt**: A markdown file in `.awos/commands/` containing ROLE/TASK/PROCESS structured instructions for an AWOS workflow step
- **Adapter_Registry**: A configuration file that maps IDE detection signals to their corresponding adapter module
- **Intermediate_Representation**: The structured data format produced by parsing a Command_Prompt, used as input to each Provider emitter
- **Emitter**: A Provider-specific module within the Generate_Script that transforms the Intermediate_Representation into IDE-native files

## Requirements

### Requirement 1: Adapter Directory Structure

**User Story:** As a developer using multiple IDEs, I want the adapter layer to live in a predictable, isolated directory, so that upstream AWOS updates never conflict with IDE-specific adaptations.

#### Acceptance Criteria

1. THE Generate_Script SHALL produce adapter output files in `.awos-adapters/{provider-name}/` directories, one per supported Provider
2. WHEN the upstream `.awos/commands/` directory is updated, THE Adapter layer SHALL NOT require modifications to files in `commands/`, `templates/`, `scripts/`, or `src/`
3. THE Adapter layer SHALL maintain a manifest file at `.awos-adapters/manifest.json` listing all supported Providers and their generation timestamps
4. IF the `.awos-adapters/` directory does not exist, THEN THE Generate_Script SHALL create it with the correct subdirectory structure for all configured Providers

### Requirement 2: Command Prompt Parsing

**User Story:** As a maintainer of the adapter layer, I want the generation script to automatically parse AWOS command prompts, so that adapters stay synchronized with upstream changes without manual translation.

#### Acceptance Criteria

1. THE Generate_Script SHALL parse each markdown file in `.awos/commands/` and extract the ROLE, TASK, INPUTS & OUTPUTS, INTERACTION, and PROCESS sections
2. THE Generate_Script SHALL extract frontmatter fields (description, argument-hint) from each command file
3. WHEN a command file contains Claude Code-specific tool references (Agent, Read, Glob, AskUserQuestion, Explore, Plan), THE Generate_Script SHALL identify and tag them for per-Provider translation
4. THE Generate_Script SHALL produce a structured Intermediate_Representation of each command before emitting Provider-specific output
5. IF a command file cannot be parsed due to malformed structure, THEN THE Generate_Script SHALL report the error with the file path and continue processing remaining files

### Requirement 3: Intermediate Representation Serialization

**User Story:** As a maintainer, I want the parsed command structure to be serializable to JSON and back, so that I can inspect, debug, and validate the parsing stage independently of emission.

#### Acceptance Criteria

1. THE Generate_Script SHALL serialize the Intermediate_Representation to JSON format when invoked with a `--dump-ir` flag
2. THE Generate_Script SHALL deserialize a previously-dumped JSON Intermediate_Representation and produce identical Provider output as parsing the original Command_Prompt (round-trip property)
3. FOR ALL valid Command_Prompts, parsing then serializing then deserializing then emitting SHALL produce output equivalent to parsing then emitting directly

### Requirement 4: Kiro Adapter Generation

**User Story:** As a Kiro user, I want AWOS workflows available as Kiro steering files and hooks, so that I can run the spec-driven development cycle natively in Kiro.

#### Acceptance Criteria

1. WHEN the Generate_Script runs for the Kiro Provider, THE Generate_Script SHALL produce steering files in `.awos-adapters/kiro/steering/` corresponding to each AWOS command
2. THE Kiro Adapter SHALL translate `AskUserQuestion` tool calls into plain-text prompts compatible with Kiro's chat interface
3. THE Kiro Adapter SHALL translate `Agent` delegation calls into `invoke_sub_agent` instructions with the appropriate agent type mapping
4. THE Kiro Adapter SHALL produce hook definitions for workflow transitions (post-task-execution triggers for the verify step)
5. THE Kiro Adapter SHALL reference the `context/` directory using paths relative to the workspace root
6. WHILE a Kiro Adapter output file exceeds 500 lines, THE Generate_Script SHALL split it into multiple files with a clear naming convention

### Requirement 5: Cursor Adapter Generation

**User Story:** As a Cursor user, I want AWOS workflows available as Cursor rules and composer commands, so that I can run spec-driven development without switching to Claude Code.

#### Acceptance Criteria

1. WHEN the Generate_Script runs for the Cursor Provider, THE Generate_Script SHALL produce rule files in `.awos-adapters/cursor/rules/` corresponding to each AWOS command
2. THE Cursor Adapter SHALL translate file reading operations into `@-file` reference syntax native to Cursor
3. THE Cursor Adapter SHALL translate `Agent` delegation into sequential composer prompt instructions, since Cursor lacks native subagent spawning
4. THE Cursor Adapter SHALL include context injection directives that load relevant `context/` documents into the composer session
5. THE Cursor Adapter SHALL produce a `.cursor/rules/awos.mdc` master rule file that references all generated AWOS rules

### Requirement 6: Codex Adapter Generation

**User Story:** As a Codex CLI user, I want AWOS workflows available as task definitions, so that I can run spec-driven development using the Codex autonomous mode.

#### Acceptance Criteria

1. WHEN the Generate_Script runs for the Codex Provider, THE Generate_Script SHALL produce task files in `.awos-adapters/codex/tasks/` corresponding to each AWOS command
2. THE Codex Adapter SHALL translate `Agent` delegation into sequential `codex --auto` invocations with context file references
3. THE Codex Adapter SHALL include instructions for loading `context/` documents as context file arguments to each Codex invocation
4. THE Codex Adapter SHALL encode the PROCESS section steps as individually-executable Codex task descriptions

### Requirement 7: Cline Adapter Generation

**User Story:** As a Cline (VSCode extension) user, I want AWOS workflows available as Cline rules and memory bank entries, so that I can run spec-driven development in VSCode with Cline.

#### Acceptance Criteria

1. WHEN the Generate_Script runs for the Cline Provider, THE Generate_Script SHALL produce rule files in `.awos-adapters/cline/rules/` and memory bank templates in `.awos-adapters/cline/memory-bank/`
2. THE Cline Adapter SHALL translate `Agent` delegation into sequential task execution instructions with memory bank state tracking between tasks
3. THE Cline Adapter SHALL map the AWOS ROLE section to Cline's system prompt format
4. THE Cline Adapter SHALL encode auto-approve patterns for known-safe file operations within the `context/` directory

### Requirement 8: Continue Adapter Generation

**User Story:** As a Continue (VSCode extension) user, I want AWOS workflows available as custom slash commands and context providers, so that I can run spec-driven development in VSCode with Continue.

#### Acceptance Criteria

1. WHEN the Generate_Script runs for the Continue Provider, THE Generate_Script SHALL produce configuration entries in `.awos-adapters/continue/config/` corresponding to each AWOS command
2. THE Continue Adapter SHALL map each AWOS command to a custom slash command definition in Continue's configuration format
3. THE Continue Adapter SHALL define context providers that automatically inject relevant `context/` documents based on the active command
4. THE Continue Adapter SHALL translate `Agent` delegation into a custom slash command that iterates tasks, sending each as an individual prompt

### Requirement 9: Delegation Strategy Abstraction

**User Story:** As a developer, I want each IDE adapter to handle task delegation appropriately for that IDE's capabilities, so that the implement workflow functions correctly regardless of which IDE runs it.

#### Acceptance Criteria

1. THE Adapter layer SHALL define a Delegation_Strategy interface with methods for: single-task delegation, multi-task orchestration, progress tracking, and failure handling
2. WHEN generating the implement command adapter, THE Generate_Script SHALL emit the Provider-specific Delegation_Strategy:
   - Kiro: `invoke_sub_agent` with general-task-execution agent type
   - Cursor: sequential composer prompts with explicit context reloading per task
   - Codex: sequential `codex --auto` invocations with context file references
   - Cline: sequential task execution with memory bank state tracking
   - Continue: custom slash command iterating tasks as individual prompts
3. IF a Provider does not support autonomous multi-task execution, THEN THE Adapter SHALL emit instructions that guide the user through manual sequential task execution
4. THE Delegation_Strategy for each Provider SHALL preserve the task completion tracking contract (marking checkboxes in `tasks.md`)

### Requirement 10: Shared State Compatibility

**User Story:** As a developer who switches between IDEs, I want all adapters to read from and write to the same `context/` directory, so that work started in one IDE can be continued in another.

#### Acceptance Criteria

1. THE Adapter layer SHALL NOT define any Provider-specific state directories outside of `.awos-adapters/`
2. WHEN any Provider adapter references project documents, THE Adapter SHALL use the canonical `context/` directory paths defined by upstream AWOS
3. THE Adapter layer SHALL NOT modify the format or schema of any document in `context/` — all adapters produce and consume the same markdown structures
4. WHEN a spec directory is created by any Provider adapter, THE Adapter SHALL use the same numbering convention as the upstream `scripts/create-spec-directory.sh` script

### Requirement 11: Generate Script CLI Interface

**User Story:** As a developer, I want a single command to regenerate all adapter files, so that I can quickly synchronize adapters after an upstream update.

#### Acceptance Criteria

1. THE Generate_Script SHALL be executable via `node .awos-adapters/generate.js` with no external npm dependencies
2. WHEN invoked with no arguments, THE Generate_Script SHALL regenerate adapters for all configured Providers
3. WHEN invoked with a `--provider {name}` argument, THE Generate_Script SHALL regenerate only the specified Provider's adapter files
4. THE Generate_Script SHALL print a summary of generated files grouped by Provider, including file count and total line count per Provider
5. WHEN invoked with `--dry-run`, THE Generate_Script SHALL report what files would be created or modified without writing to disk
6. IF the Generate_Script detects that `.awos/commands/` does not exist or is empty, THEN THE Generate_Script SHALL exit with a descriptive error message and non-zero exit code
7. THE Generate_Script SHALL require Node.js 22 or higher and use only built-in modules (fs, path, node:test for self-tests)

### Requirement 12: Adapter File Size Constraints

**User Story:** As a maintainer, I want adapter files to remain small and focused, so that they are easy to understand, review, and maintain independently.

#### Acceptance Criteria

1. THE Generate_Script SHALL NOT produce any single output file exceeding 500 lines
2. WHEN an adapter translation exceeds 500 lines, THE Generate_Script SHALL split it into multiple files using a clear naming convention (e.g., `implement-delegation.md`, `implement-orchestration.md`)
3. THE Generate_Script source code itself SHALL follow the same 500-line constraint, splitting into modules by responsibility (parser, emitter, CLI)
4. THE Generate_Script SHALL report a warning to stderr when any generated file exceeds 400 lines, indicating it is approaching the limit

### Requirement 13: Provider Detection and Routing

**User Story:** As a developer, I want the adapter layer to automatically detect which IDE I'm using, so that setup instructions can guide me to the correct adapter output.

#### Acceptance Criteria

1. THE Adapter_Registry SHALL detect Providers by checking for IDE-specific marker directories:
   - Kiro: `.kiro/` directory exists
   - Cursor: `.cursor/` directory exists
   - Cline: `.clinerules` file or `.cline/` directory exists
   - Continue: `.continue/` directory exists
   - Codex: `codex.json` or `.codex/` directory exists
2. WHEN multiple Provider markers are detected, THE Adapter_Registry SHALL list all detected Providers and recommend the user choose one
3. THE Generate_Script SHALL accept a `--detect` flag that reports which Providers are detected in the current project without generating files

### Requirement 14: Upstream Synchronization Safety

**User Story:** As a fork maintainer, I want clear guardrails preventing accidental upstream modifications, so that the fork stays rebasing-friendly.

#### Acceptance Criteria

1. THE Generate_Script SHALL validate before execution that no files in `commands/`, `templates/`, `scripts/`, or `src/` have uncommitted modifications, and warn the user if they do
2. THE Adapter layer SHALL include a `.gitattributes` entry marking `.awos-adapters/` as fork-owned content that is excluded from upstream diffs
3. WHEN the Generate_Script produces output, THE Generate_Script SHALL include a header comment in each generated file stating "Auto-generated by generate-adapters — do not edit manually"
4. THE Adapter layer SHALL include documentation in `.awos-adapters/README.md` explaining the upstream-is-king policy and the regeneration workflow

### Requirement 15: Phased Rollout Support

**User Story:** As a project maintainer, I want to deliver Kiro and Cursor adapters first, so that the most impactful cost-reduction targets are available early while other adapters are developed iteratively.

#### Acceptance Criteria

1. THE Generate_Script SHALL support a provider configuration file at `.awos-adapters/providers.json` listing which Providers are enabled for generation
2. WHEN a Provider is not listed in the configuration, THE Generate_Script SHALL skip generation for that Provider without error
3. THE Adapter layer SHALL function correctly with only a subset of Providers configured — the Kiro and Cursor adapters SHALL NOT depend on other Provider adapters being present
4. WHEN a new Provider is added to the configuration, THE Generate_Script SHALL generate its adapter files without requiring changes to existing Provider adapters

### Requirement 16: Adapter Validation and Testing

**User Story:** As a maintainer, I want automated validation that generated adapters conform to each IDE's expected file structure and syntax, so that I catch regressions before deploying to a real IDE.

#### Acceptance Criteria

1. THE Generate_Script SHALL include a `--validate` flag that checks all generated adapter files against Provider-specific structural rules (correct file extensions, valid YAML/JSON where required, correct directory nesting)
2. WHEN validation fails, THE Generate_Script SHALL report each violation with the Provider name, file path, and rule that was violated
3. THE Adapter layer SHALL include self-tests runnable via `node --test .awos-adapters/tests/` using the Node.js built-in test runner with no external dependencies
4. FOR EACH Provider, THE self-tests SHALL verify that generating from a known Command_Prompt fixture produces the expected output files (snapshot-style regression testing)
