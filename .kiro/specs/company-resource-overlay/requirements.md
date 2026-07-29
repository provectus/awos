# Requirements Document

## Introduction

This feature enables implementing companies (e.g., WingedCommerce) to provide their own company-specific resources — skills, agents, and MCP server configurations — that the AWOS hire workflow can discover and use at the project level. The mechanism follows an overlay pattern: company resources augment (never replace) the upstream `awos-recruitment` registry and require zero modifications to the base `awos` repository. The overlay integrates through the existing adapter layer, with minimal adaptations to local hook/installer wiring permitted.

## Glossary

- **Overlay_Registry**: A project-local directory structure (`.awos-company/`) that holds company-specific resource definitions discoverable by the Hire_Workflow
- **Hire_Workflow**: The AWOS hire command (`commands/hire.md`) that searches for skills, agents, and MCP servers to install into a project
- **Resource_Manifest**: A JSON file (`manifest.json`) inside the Overlay_Registry that declares all company-provided resources with their types, names, and metadata
- **Company_Skill**: A skill definition provided by the implementing company, stored in the Overlay_Registry under a `skills/` subdirectory
- **Company_Agent**: An agent definition provided by the implementing company, stored in the Overlay_Registry under an `agents/` subdirectory
- **Company_MCP_Config**: An MCP server configuration provided by the implementing company, stored in the Overlay_Registry under an `mcps/` subdirectory
- **Resource_Resolver**: The module responsible for discovering and merging resources from both the upstream `awos-recruitment` registry and the Overlay_Registry
- **Kiro_Installer**: The existing installer at `.awos-adapters/lib/installers/kiro.js` that handles last-mile installation of steering files and hooks into `.kiro/`
- **Base_Repo**: The upstream `awos` repository which must remain unmodified (pristine)
- **Upstream_Registry**: The `awos-recruitment` MCP server that provides the canonical Provectus skill/agent/MCP catalog

## Requirements

### Requirement 1: Overlay Registry Directory Structure

**User Story:** As an implementing company, I want a well-defined directory structure for providing my company-specific resources, so that I can organize skills, agents, and MCP configs in a predictable location without touching the base awos repo.

#### Acceptance Criteria

1. THE Overlay_Registry SHALL reside at the path `.awos-company/` relative to the project root
2. THE Overlay_Registry SHALL contain a `manifest.json` file at its root that declares all available resources; if `.awos-company/` exists without a `manifest.json`, the Resource_Resolver SHALL treat the overlay as absent and emit a warning
3. THE Overlay_Registry SHALL recognize a `skills/` subdirectory for Company_Skill definitions, an `agents/` subdirectory for Company_Agent definitions, and an `mcps/` subdirectory for Company_MCP_Config definitions when they are present; none of these subdirectories are required to exist for the Overlay_Registry to be considered valid
4. IF the Resource_Manifest references a path within a subdirectory that does not exist on disk, THEN the Resource_Resolver SHALL skip that entry and emit a warning without failing the overall discovery
5. THE Overlay_Registry SHALL be excluded from Base_Repo version control by being listed in the `.gitignore` file at the root of the base awos repository
6. THE Overlay_Registry SHALL be considered valid when it contains only `manifest.json` with zero resource entries and no subdirectories

### Requirement 2: Resource Manifest Schema

**User Story:** As an implementing company, I want a structured manifest file that declares my company resources, so that the hire workflow can discover them without scanning the filesystem.

#### Acceptance Criteria

1. THE Resource_Manifest SHALL be a valid JSON file conforming to a defined JSON schema, containing a top-level `resources` array of resource entry objects
2. THE Resource_Manifest SHALL declare each resource entry with a `name` (a non-empty string of 1 to 128 characters containing only lowercase alphanumeric characters, hyphens, and underscores), a `type` (one of "skill", "agent", "mcp"), and a `path` (a relative path from the Overlay_Registry root that does not contain parent-directory traversal segments such as `..`)
3. THE Resource_Manifest SHALL support an optional `description` field per resource (string, maximum 256 characters) for display during the hire workflow
4. THE Resource_Manifest SHALL support an optional `tags` array per resource (maximum 20 tags, each a non-empty string of at most 64 characters) to enable search matching against technology domains
5. THE Resource_Manifest SHALL NOT contain duplicate `name` values within the `resources` array; IF duplicate names are detected, THEN THE Resource_Resolver SHALL use the first occurrence and emit a warning to stderr identifying the duplicate entry
6. IF a resource entry in the Resource_Manifest is missing any required field (`name`, `type`, or `path`), THEN THE Resource_Resolver SHALL skip that entry and emit a warning to stderr identifying the missing field and entry index
7. WHEN the Resource_Manifest contains a resource entry with an invalid `type` value, THE Resource_Resolver SHALL skip that entry and emit a warning to stderr identifying the invalid type and entry index
8. WHEN the Resource_Manifest references a `path` that does not exist on disk, THE Resource_Resolver SHALL skip that entry and emit a warning to stderr identifying the unresolved path

### Requirement 3: Resource Discovery and Resolution

**User Story:** As an AWOS user running the hire workflow, I want the system to automatically discover company overlay resources alongside upstream registry resources, so that I get a unified view of all available skills, agents, and MCPs.

#### Acceptance Criteria

1. WHEN the Hire_Workflow executes its search step, THE Resource_Resolver SHALL check for the existence of `.awos-company/manifest.json` in the project root
2. WHEN the Overlay_Registry exists and contains a Resource_Manifest that passes schema validation as defined in Requirement 2, THE Resource_Resolver SHALL include all valid overlay resources in the search results alongside Upstream_Registry results
3. WHEN both the Upstream_Registry and the Overlay_Registry provide a resource with the same `name` and same `type` value, THE Resource_Resolver SHALL prefer the Overlay_Registry version (company override) and exclude the Upstream_Registry duplicate from the merged results
4. IF the Upstream_Registry is unavailable (network connection fails or no response is received within 10 seconds), THEN THE Resource_Resolver SHALL use Overlay_Registry resources as the primary source instead of falling back to generic templates
5. IF the Overlay_Registry does not exist (no `.awos-company/` directory or no `manifest.json` within it), THEN THE Resource_Resolver SHALL proceed with only the Upstream_Registry (or generic fallback) without emitting any error or warning to the user
6. THE Resource_Resolver SHALL match overlay resources against search queries by performing case-insensitive substring matching against the `name` field and case-insensitive exact matching against individual entries in the `tags` array from the Resource_Manifest
7. WHEN the Resource_Resolver matches overlay resources against a search query containing multiple terms, THE Resource_Resolver SHALL return a resource if any single tag matches any query term exactly (case-insensitive) or if the `name` field contains any query term as a substring (case-insensitive)

### Requirement 4: Company Skill Integration

**User Story:** As an implementing company, I want to provide my own skill files that the hire workflow installs into the project, so that my agents have access to company-specific expertise.

#### Acceptance Criteria

1. THE Company_Skill SHALL follow the same file format as skills installed by the `awos-recruitment` CLI (markdown with YAML frontmatter containing at minimum a `name` and `description` field)
2. WHEN the Hire_Workflow selects a Company_Skill for installation, THE Resource_Resolver SHALL copy the skill file from the Overlay_Registry to the appropriate IDE-specific skill directory, preserving the source filename
3. WHERE the Kiro IDE adapter is active, THE Resource_Resolver SHALL install Company_Skill files into `.kiro/skills/{skill-name}/` where `{skill-name}` matches the `name` field from the skill's YAML frontmatter, creating the directory if it does not exist
4. THE Company_Skill installation SHALL be idempotent — reinstalling an already-present skill overwrites the target file with the overlay version and completes without emitting an error to the user
5. IF a Company_Skill file lacks valid YAML frontmatter or is missing a required `name` field, THEN THE Resource_Resolver SHALL skip that skill, emit a warning identifying the file path and the validation failure, and continue processing remaining skills

### Requirement 5: Company Agent Integration

**User Story:** As an implementing company, I want to provide pre-configured agent definitions, so that the hire workflow can install company-specific specialist agents without generating them from generic templates.

#### Acceptance Criteria

1. THE Company_Agent SHALL follow the same file format as agents in the `plugins/awos/agents/` directory (markdown with YAML frontmatter containing `name`, `description`, and `skills` fields, where `skills` is a comma-separated list of skill names)
2. WHEN the Hire_Workflow selects a Company_Agent for installation, THE Resource_Resolver SHALL copy the agent file from the Overlay_Registry to the project's agent directory appropriate for the active IDE
3. WHERE the Kiro IDE adapter is active, THE Resource_Resolver SHALL install the Company_Agent definition as a steering file in `.kiro/steering/` that references the agent's declared skills
4. WHEN a Company_Agent references skills by name, THE Resource_Resolver SHALL verify those skills exist either in the Overlay_Registry or in the already-installed project skills
5. IF a Company_Agent references a skill that does not exist in the Overlay_Registry or the already-installed project skills, THEN THE Resource_Resolver SHALL emit a warning identifying the missing skill name and skip installation of that agent
6. THE Company_Agent installation SHALL be idempotent — reinstalling an already-present agent overwrites with the overlay version without error

### Requirement 6: Company MCP Server Configuration

**User Story:** As an implementing company, I want to provide MCP server configurations for my company-specific services, so that the hire workflow can wire them into the project's IDE configuration.

#### Acceptance Criteria

1. THE Company_MCP_Config SHALL declare the following fields: a required `name` (string, the MCP server identifier), a required `command` (string, the executable to start the server), an optional `args` (array of strings, command-line arguments), and an optional `env` (object mapping variable names to string values or environment variable references)
2. THE Company_MCP_Config SHALL use a JSON format where each entry is keyed by server name and contains `command`, `args`, and `env` fields, matching the structure expected under the `mcpServers` key of the target IDE's MCP configuration file
3. WHEN the Hire_Workflow selects a Company_MCP_Config for installation, THE Kiro_Installer SHALL insert the server entry as a key under the `mcpServers` object in the project's `.kiro/settings/mcp.json`, preserving all existing entries that are not in conflict
4. IF the target file `.kiro/settings/mcp.json` does not exist, THEN THE Kiro_Installer SHALL create it with a top-level `mcpServers` object containing the new entry
5. WHEN a Company_MCP_Config declares environment variable references using `${VARIABLE_NAME}` syntax within `env` values, THE Kiro_Installer SHALL preserve those references as literal strings without resolving them (the user provides values at runtime)
6. IF a Company_MCP_Config conflicts with an already-configured MCP server of the same name in `.kiro/settings/mcp.json`, THEN THE Kiro_Installer SHALL warn the user indicating the server name and require confirmation before overwriting; if the user declines, THE Kiro_Installer SHALL skip that entry and continue processing remaining entries

### Requirement 7: Base Repository Pristineness

**User Story:** As a company maintaining an awos fork, I want the overlay mechanism to work without modifying the base awos repository files, so that I can cleanly pull upstream updates.

#### Acceptance Criteria

1. THE Overlay_Registry SHALL perform resource discovery, resolution, and installation without creating, modifying, or deleting any file under `.awos/`, `commands/`, `plugins/`, `templates/`, or `src/` in the Base_Repo
2. THE Resource_Resolver SHALL reside entirely within the `.awos-adapters/` directory, with no source files, configuration entries, or import hooks placed in Base_Repo paths
3. WHEN the Base_Repo receives an upstream update via git pull or rebase, THE Overlay_Registry and its integration points SHALL require zero manual conflict resolution on files in `.awos/`, `commands/`, `plugins/`, `templates/`, or `src/`, and THE Resource_Resolver SHALL successfully discover and resolve overlay resources without reconfiguration
4. IF the Kiro_Installer is extended with overlay support, THEN THE Kiro_Installer SHALL produce identical output for projects that do not contain an Overlay_Registry as it did before the extension was added
5. THE Overlay_Registry SHALL NOT register any git-tracked files within Base_Repo paths (`.awos/`, `commands/`, `plugins/`, `templates/`, `src/`) as part of its installation or operation

### Requirement 8: Hire Workflow Integration

**User Story:** As an AWOS user, I want the hire workflow to seamlessly use overlay resources in its existing Steps 4 and 5, so that company resources appear naturally in the search and install flow.

#### Acceptance Criteria

1. WHEN the Hire_Workflow reaches Step 4 (Search the MCP Server), THE Resource_Resolver SHALL inject overlay search results into the same results table used for MCP server results, populating the same columns (Role, Found Skills, Found MCPs, Found Agents) so that overlay and registry results appear as a single merged list
2. WHEN the Hire_Workflow reaches Step 5 (Install Found Components), THE Resource_Resolver SHALL handle overlay resource installation using file copy from the Overlay_Registry to the target IDE directory rather than `npx @provectusinc/awos-recruitment` commands
3. THE Hire_Workflow SHALL distinguish overlay-sourced resources from registry-sourced resources by including a "Source" column in the Step 4 results table, displaying "company" for overlay resources and "registry" for Upstream_Registry resources
4. WHEN the Hire_Workflow writes `context/product/hired-agents.md`, THE coverage report SHALL include overlay-installed resources in the Coverage by Technology table with their Agent column value prefixed by the source indicator "company overlay" (e.g., "company overlay: my-agent")
5. IF a file copy operation fails during overlay resource installation in Step 5, THEN THE Resource_Resolver SHALL report the failure with the resource name and file path that could not be copied, skip that resource, and continue installing remaining resources

### Requirement 9: Overlay Alongside Upstream Registry

**User Story:** As an AWOS user with access to both the upstream registry and a company overlay, I want both sources to contribute resources, so that I get the best of both worlds.

#### Acceptance Criteria

1. WHEN both the Upstream_Registry and the Overlay_Registry are available, THE Resource_Resolver SHALL query both sources and merge results into a single response within 10 seconds
2. THE Resource_Resolver SHALL present merged results to the user in a single unified table that includes at minimum the resource name, version, and a source column indicating origin ("registry" or "company")
3. WHEN duplicate resources exist across sources (matched by resource name), THE Resource_Resolver SHALL display only the company version by default, and provide a user-selectable option to switch to the registry version for each duplicate entry
4. IF the Upstream_Registry is unavailable but the Overlay_Registry is available, THEN THE Resource_Resolver SHALL return results from the Overlay_Registry only and indicate that the upstream registry was unreachable
5. IF the Overlay_Registry is unavailable but the Upstream_Registry is available, THEN THE Resource_Resolver SHALL return results from the Upstream_Registry only and indicate that the overlay was unreachable
6. THE Resource_Resolver SHALL execute overlay discovery locally (filesystem read) without requiring network access

### Requirement 10: Kiro Adapter Wiring

**User Story:** As a Kiro IDE user, I want the overlay mechanism to integrate with the existing Kiro adapter installer, so that company resources are wired into my `.kiro/` directory structure correctly.

#### Acceptance Criteria

1. THE Kiro_Installer SHALL expose an `installOverlay` function that executes after `installSteering` and `installHooks` complete during a full install
2. WHEN the Overlay_Registry contains Company_Skill files, THE Kiro_Installer SHALL install each skill into `.kiro/skills/{skill-name}/` where `{skill-name}` is the `name` field from the Resource_Manifest entry
3. WHEN the Overlay_Registry contains Company_Agent definitions, THE Kiro_Installer SHALL generate a steering file per agent in `.kiro/steering/` with `inclusion: manual` frontmatter and a reference to the agent's declared skills
4. WHEN the Overlay_Registry contains Company_MCP_Config entries, THE Kiro_Installer SHALL merge them into `.kiro/settings/mcp.json`, preserving any existing MCP server entries that are not targeted by the overlay
5. THE Kiro_Installer overlay phase SHALL NOT remove or overwrite files installed by the standard phase. IF an overlay file has the same filename as a standard-phase file, THEN THE Kiro_Installer SHALL overwrite that specific file with the overlay version.
6. IF the Overlay_Registry directory does not exist or does not contain a valid Resource_Manifest, THEN THE Kiro_Installer SHALL skip the overlay phase without error and return an empty installation result
7. IF `.kiro/settings/mcp.json` does not exist when a Company_MCP_Config is being installed, THEN THE Kiro_Installer SHALL create the file and any required parent directories before writing the configuration

### Requirement 11: Manifest Validation

**User Story:** As an implementing company, I want validation feedback when my manifest has errors, so that I can fix issues before running the hire workflow.

#### Acceptance Criteria

1. WHEN the Resource_Resolver loads the Resource_Manifest, THE Resource_Resolver SHALL validate it against the defined JSON schema before performing overlay discovery
2. IF the Resource_Manifest fails schema validation, THEN THE Resource_Resolver SHALL report all validation errors to stderr — each error including the JSON path of the violating field and a description of the violation — and skip overlay discovery
3. IF the Resource_Manifest is valid but references a file path that does not exist relative to the Overlay_Registry root, THEN THE Resource_Resolver SHALL emit a warning to stderr for each missing-path entry (including the entry name and the unresolved path) and continue processing remaining entries
4. THE Resource_Resolver SHALL provide a standalone validation command (`npx awos overlay validate`) that performs both JSON schema validation and file path existence checks against the Overlay_Registry
5. IF the standalone validation command detects one or more schema errors or missing file paths, THEN THE Resource_Resolver SHALL exit with a non-zero exit code
6. IF the standalone validation command detects no errors and no missing paths, THEN THE Resource_Resolver SHALL print a summary indicating the number of resources validated and exit with code 0
