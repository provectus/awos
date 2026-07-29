'use strict';

/**
 * Property-Based Tests for Kiro Installer Overlay
 *
 * Feature: company-resource-overlay, Property 6: Skill Installation Content Preservation
 *
 * Validates: Requirements 4.2, 4.3, 10.2
 *
 * For any valid skill resource with a source file containing content C and a
 * manifest name N, after `installOverlay` completes, the file at
 * `.kiro/skills/{N}/{original-filename}` SHALL exist and its content SHALL be
 * byte-identical to C.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const fc = require('fast-check');

const { installOverlay } = require('../../.awos-adapters/lib/installers/kiro');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Create a temporary directory for test isolation.
 * @returns {string} Absolute path to the temp directory
 */
function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-prop6-'));
}

/**
 * Recursively remove a directory.
 * @param {string} dir
 */
function removeTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

const FIRST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const REST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_-';

/** Valid skill name for frontmatter: starts with [a-z0-9], rest [a-z0-9_-], 1–30 chars */
const validSkillNameGen = fc
    .tuple(
        fc.constantFrom(...FIRST_CHARS.split('')),
        fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 0, maxLength: 28 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Valid filename segment (no path separators, reasonable length) */
const validFilenameGen = fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), { minLength: 1, maxLength: 20 })
    .map(chars => chars.join('') + '.md');

/** Generate random markdown body content (non-empty, various lengths) */
const markdownBodyGen = fc.string({ minLength: 1, maxLength: 500 }).map(s =>
    // Ensure content doesn't interfere with YAML frontmatter delimiters
    s.replace(/---/g, '===').replace(/\0/g, '')
);

/**
 * Generate a valid skill file content with YAML frontmatter containing a `name` field.
 * Returns { content, skillName, filename }.
 */
const skillFileGen = fc
    .tuple(validSkillNameGen, markdownBodyGen, validFilenameGen)
    .map(([skillName, body, filename]) => ({
        skillName,
        filename,
        content: `---\nname: ${skillName}\n---\n\n# ${skillName}\n\n${body}\n`,
    }));

/** Valid resource name for the manifest entry */
const validResourceNameGen = fc
    .tuple(
        fc.constantFrom(...FIRST_CHARS.split('')),
        fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 0, maxLength: 19 })
    )
    .map(([first, rest]) => first + rest.join(''));

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Feature: company-resource-overlay, Property 6: Skill Installation Content Preservation', () => {

    /**
     * Validates: Requirements 4.2, 4.3, 10.2
     *
     * For any valid skill resource with a source file containing content C and a
     * manifest name N, after `installOverlay` completes, the file at
     * `.kiro/skills/{N}/{original-filename}` SHALL exist and its content SHALL be
     * byte-identical to C.
     */
    it('installed skill file is byte-identical to source', async () => {
        await fc.assert(
            fc.asyncProperty(
                skillFileGen,
                validResourceNameGen,
                async ({ skillName, content, filename }, resourceName) => {
                    const tempDir = createTempDir();
                    try {
                        // Set up source file in a temp overlay directory
                        const sourceDir = path.join(tempDir, 'overlay-source');
                        fs.mkdirSync(sourceDir, { recursive: true });
                        const sourceFilePath = path.join(sourceDir, filename);
                        fs.writeFileSync(sourceFilePath, content, 'utf8');

                        // Build ResolvedResource array with type 'skill'
                        const resources = [
                            {
                                name: resourceName,
                                type: 'skill',
                                absolutePath: sourceFilePath,
                                source: 'company',
                            },
                        ];

                        // Create project root directory
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Execute installOverlay
                        const result = await installOverlay(projectRoot, resources);

                        // Assert: the file at .kiro/skills/{skillName}/{filename} exists
                        const expectedPath = path.join(
                            projectRoot,
                            '.kiro',
                            'skills',
                            skillName,
                            filename
                        );
                        assert.ok(
                            fs.existsSync(expectedPath),
                            `Expected installed skill file at .kiro/skills/${skillName}/${filename} but it does not exist`
                        );

                        // Assert: content is byte-identical to source
                        const installedContent = fs.readFileSync(expectedPath, 'utf8');
                        assert.strictEqual(
                            installedContent,
                            content,
                            'Installed file content is not byte-identical to source'
                        );

                        // Assert: result.skills contains the skill name from frontmatter
                        assert.ok(
                            result.skills.includes(skillName),
                            `Expected result.skills to contain "${skillName}", got: ${JSON.stringify(result.skills)}`
                        );
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ---------------------------------------------------------------------
// Property 8: Agent Steering Generation
// ---------------------------------------------------------------------

describe('Feature: company-resource-overlay, Property 8: Agent Steering Generation', () => {

    /**
     * Validates: Requirements 5.3, 10.3
     *
     * For any valid agent resource declaring skills S₁, S₂, …, Sₖ (all of which
     * exist in the overlay or project), `installOverlay` SHALL generate a steering
     * file at `.kiro/steering/{agent-name}.md` whose content includes
     * `inclusion: manual` in its YAML frontmatter and references each of S₁ through Sₖ.
     */
    it('generated steering file has inclusion: manual frontmatter and references all skills', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate 1-3 unique skill names
                fc.array(validSkillNameGen, { minLength: 1, maxLength: 3 })
                    .chain(names => {
                        // Deduplicate skill names to avoid collisions
                        const unique = [...new Set(names)];
                        if (unique.length === 0) return fc.constant([FIRST_CHARS[0]]);
                        return fc.constant(unique);
                    }),
                // Agent name
                validSkillNameGen,
                // Agent description
                fc.string({ minLength: 1, maxLength: 100 }).map(s => s.replace(/\n/g, ' ').replace(/\0/g, '')),
                async (skillNames, agentName, agentDescription) => {
                    // Ensure agent name is distinct from all skill names
                    if (skillNames.includes(agentName)) return; // skip trivial collision

                    const tempDir = createTempDir();
                    try {
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        const sourceDir = path.join(tempDir, 'overlay-source');
                        fs.mkdirSync(path.join(sourceDir, 'skills'), { recursive: true });
                        fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true });

                        const resources = [];

                        // Create skill resources on disk
                        for (const skillName of skillNames) {
                            const skillContent = `---\nname: ${skillName}\n---\n\n# ${skillName}\n\nSkill content.\n`;
                            const skillFilePath = path.join(sourceDir, 'skills', `${skillName}.md`);
                            fs.writeFileSync(skillFilePath, skillContent, 'utf8');

                            resources.push({
                                name: skillName,
                                type: 'skill',
                                absolutePath: skillFilePath,
                                source: 'company',
                            });
                        }

                        // Create agent resource on disk
                        const skillsList = skillNames.join(', ');
                        const agentContent =
                            `---\nname: ${agentName}\ndescription: ${agentDescription}\nskills: ${skillsList}\n---\n\n# ${agentName}\n\nAgent body.\n`;
                        const agentFilePath = path.join(sourceDir, 'agents', `${agentName}.md`);
                        fs.writeFileSync(agentFilePath, agentContent, 'utf8');

                        resources.push({
                            name: agentName,
                            type: 'agent',
                            absolutePath: agentFilePath,
                            source: 'company',
                        });

                        // Execute installOverlay
                        const result = await installOverlay(projectRoot, resources);

                        // Assert: steering file exists at .kiro/steering/{agentName}.md
                        const steeringPath = path.join(
                            projectRoot,
                            '.kiro',
                            'steering',
                            `${agentName}.md`
                        );
                        assert.ok(
                            fs.existsSync(steeringPath),
                            `Expected steering file at .kiro/steering/${agentName}.md but it does not exist`
                        );

                        // Read steering file content
                        const steeringContent = fs.readFileSync(steeringPath, 'utf8');

                        // Assert: content starts with ---\ninclusion: manual\n---
                        assert.ok(
                            steeringContent.startsWith('---\ninclusion: manual\n---'),
                            `Expected steering file to start with "---\\ninclusion: manual\\n---", got: "${steeringContent.slice(0, 50)}"`
                        );

                        // Assert: each skill name appears in the steering file content
                        for (const skillName of skillNames) {
                            assert.ok(
                                steeringContent.includes(skillName),
                                `Expected steering file to reference skill "${skillName}" but it was not found in content`
                            );
                        }

                        // Assert: result.agents contains the agent name
                        assert.ok(
                            result.agents.includes(agentName),
                            `Expected result.agents to contain "${agentName}", got: ${JSON.stringify(result.agents)}`
                        );
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ---------------------------------------------------------------------
// Property 9: Agent Skill Dependency Check
// ---------------------------------------------------------------------

/**
 * Feature: company-resource-overlay, Property 9: Agent Skill Dependency Check
 *
 * Validates: Requirements 5.4, 5.5
 *
 * For any agent resource referencing at least one skill name that does not exist
 * in the overlay registry or in `.kiro/skills/`, `installOverlay` SHALL skip that
 * agent, emit a warning identifying the missing skill name, and successfully install
 * all remaining valid resources.
 */

describe('Feature: company-resource-overlay, Property 9: Agent Skill Dependency Check', () => {

    // --- Generators ---

    /** Valid name for skills/agents: starts with [a-z0-9], rest [a-z0-9_-], 1–20 chars */
    const validNameGen = fc
        .tuple(
            fc.constantFrom(...FIRST_CHARS.split('')),
            fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 0, maxLength: 18 })
        )
        .map(([first, rest]) => first + rest.join(''));

    /** Generate a skill name guaranteed to NOT collide with valid ones by using an uppercase prefix */
    const nonExistentSkillNameGen = validNameGen.map(name => `nonexistent-${name}`);

    /** Generate a list of 1+ non-existent skill names */
    const missingSkillsGen = fc.array(nonExistentSkillNameGen, { minLength: 1, maxLength: 3 });

    /** Generate a list of 1+ valid skill names that WILL exist */
    const existingSkillsGen = fc.array(validNameGen, { minLength: 1, maxLength: 3 })
        .filter(names => {
            // Ensure no duplicates and no names start with 'nonexistent-'
            const unique = new Set(names);
            return unique.size === names.length && names.every(n => !n.startsWith('nonexistent-'));
        });

    /** Generate agent name */
    const agentNameGen = validNameGen.map(name => `agent-${name}`);

    /**
     * Validates: Requirements 5.4, 5.5
     *
     * For any agent referencing at least one missing skill, installOverlay SHALL:
     * - Skip that agent (NOT in result.agents)
     * - NOT generate a steering file for the skipped agent
     * - Emit a warning identifying the missing skill name
     * - Successfully install all remaining valid skill resources
     */
    it('agent referencing non-existent skills is skipped with warning, valid skills still install', async () => {
        await fc.assert(
            fc.asyncProperty(
                agentNameGen,
                existingSkillsGen,
                missingSkillsGen,
                async (agentName, existingSkillNames, missingSkillNames) => {
                    const tempDir = createTempDir();
                    try {
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Set up source directories
                        const sourceDir = path.join(tempDir, 'overlay-source');
                        fs.mkdirSync(path.join(sourceDir, 'skills'), { recursive: true });
                        fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true });

                        // Create valid skill source files (these exist in the overlay)
                        const skillResources = existingSkillNames.map((skillName, i) => {
                            const skillContent = `---\nname: ${skillName}\n---\n\n# ${skillName}\n\nSkill body ${i}\n`;
                            const skillFilePath = path.join(sourceDir, 'skills', `${skillName}.md`);
                            fs.writeFileSync(skillFilePath, skillContent, 'utf8');
                            return {
                                name: skillName,
                                type: 'skill',
                                absolutePath: skillFilePath,
                                source: 'company',
                            };
                        });

                        // Create the agent file that references BOTH existing and missing skills
                        const allSkillsForAgent = [...existingSkillNames, ...missingSkillNames];
                        const agentContent =
                            `---\nname: ${agentName}\ndescription: Test agent\nskills: ${allSkillsForAgent.join(', ')}\n---\n\n# ${agentName}\n\nAgent body\n`;
                        const agentFilePath = path.join(sourceDir, 'agents', `${agentName}.md`);
                        fs.writeFileSync(agentFilePath, agentContent, 'utf8');

                        const agentResource = {
                            name: agentName,
                            type: 'agent',
                            absolutePath: agentFilePath,
                            source: 'company',
                        };

                        // Combine resources: valid skills + agent with missing dependencies
                        const resources = [...skillResources, agentResource];

                        // Execute installOverlay
                        const result = await installOverlay(projectRoot, resources);

                        // Assert: the agent is NOT in result.agents (it was skipped)
                        assert.ok(
                            !result.agents.includes(agentName),
                            `Expected agent "${agentName}" to be skipped, but it was installed: ${JSON.stringify(result.agents)}`
                        );

                        // Assert: no steering file generated for the skipped agent
                        const steeringPath = path.join(projectRoot, '.kiro', 'steering', `${agentName}.md`);
                        assert.ok(
                            !fs.existsSync(steeringPath),
                            `Expected no steering file at ${steeringPath} for skipped agent, but file exists`
                        );

                        // Assert: result.warnings contains a warning mentioning at least one missing skill name
                        const hasWarningWithMissingSkill = result.warnings.some(w =>
                            missingSkillNames.some(ms => w.includes(ms))
                        );
                        assert.ok(
                            hasWarningWithMissingSkill,
                            `Expected a warning mentioning one of the missing skills ${JSON.stringify(missingSkillNames)}, got warnings: ${JSON.stringify(result.warnings)}`
                        );

                        // Assert: valid skills that were in the resources list ARE still installed successfully
                        for (const skillName of existingSkillNames) {
                            assert.ok(
                                result.skills.includes(skillName),
                                `Expected valid skill "${skillName}" to be installed but it was not in result.skills: ${JSON.stringify(result.skills)}`
                            );
                        }
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ---------------------------------------------------------------------
// Property 10: MCP Merge Preserves Existing Entries
// ---------------------------------------------------------------------

/**
 * Feature: company-resource-overlay, Property 10: MCP Merge Preserves Existing Entries
 *
 * Validates: Requirements 6.3, 10.4
 *
 * For any existing `.kiro/settings/mcp.json` containing server entries E₁, E₂, …, Eₘ
 * and for any new overlay MCP entries N₁, N₂, …, Nₖ where no Nᵢ shares a key with any Eⱼ,
 * the resulting `mcp.json` SHALL contain all of E₁…Eₘ unchanged plus all of N₁…Nₖ
 * under the `mcpServers` key.
 */

describe('Feature: company-resource-overlay, Property 10: MCP Merge Preserves Existing Entries', () => {

    // --- Generators ---

    /** Generate a valid MCP server name (lowercase alphanumeric + hyphens, 1-20 chars) */
    const mcpServerNameGen = fc
        .tuple(
            fc.constantFrom(...FIRST_CHARS.split('')),
            fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 0, maxLength: 18 })
        )
        .map(([first, rest]) => first + rest.join(''));

    /** Generate a valid env variable name (uppercase letters and underscores) */
    const envVarNameGen = fc
        .tuple(
            fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
            fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789'.split('')), { minLength: 0, maxLength: 10 })
        )
        .map(([first, rest]) => first + rest.join(''));

    /**
     * Generate a simple MCP server config object as a plain JSON-safe object.
     * We use JSON.parse(JSON.stringify(...)) to ensure we get regular objects
     * (no null prototypes) which is what the code under test produces.
     */
    const mcpServerConfigGen = fc
        .tuple(
            fc.constantFrom('npx', 'node', 'python', 'docker'),
            fc.array(fc.constantFrom('--port', '3000', '-y', '@company/mcp', 'serve'), { minLength: 0, maxLength: 3 }),
            fc.array(
                fc.tuple(envVarNameGen, fc.constantFrom('value1', 'https://api.example.com', '${MY_SECRET}', 'true')),
                { minLength: 0, maxLength: 3 }
            )
        )
        .map(([command, args, envPairs]) => {
            const env = {};
            for (const [k, v] of envPairs) {
                env[k] = v;
            }
            return JSON.parse(JSON.stringify({ command, args, env }));
        });

    /**
     * Generate M existing MCP server entries and K new overlay entries with NO key overlap.
     * Uses a prefix strategy to guarantee uniqueness between existing and new.
     */
    const mcpMergeInputGen = fc
        .tuple(
            fc.integer({ min: 1, max: 5 }),  // M existing entries
            fc.integer({ min: 1, max: 5 }),  // K new overlay entries
            fc.array(mcpServerConfigGen, { minLength: 10, maxLength: 10 }),  // pool of configs
            fc.array(mcpServerNameGen, { minLength: 10, maxLength: 10 })     // pool of name suffixes
        )
        .map(([m, k, configs, nameSuffixes]) => {
            // Use prefixes to ensure no overlap between existing and new keys
            const existingEntries = {};
            for (let i = 0; i < m; i++) {
                const key = `existing-${nameSuffixes[i] || 'srv' + i}`;
                existingEntries[key] = configs[i] || { command: 'node', args: [], env: {} };
            }

            const newEntries = {};
            for (let i = 0; i < k; i++) {
                const key = `overlay-${nameSuffixes[m + i] || 'srv' + (m + i)}`;
                newEntries[key] = configs[m + i] || { command: 'npx', args: [], env: {} };
            }

            return { existingEntries, newEntries };
        });

    /**
     * Validates: Requirements 6.3, 10.4
     *
     * For any existing mcp.json with M entries and K new non-conflicting overlay entries,
     * the resulting mcp.json SHALL contain all M original entries unchanged plus all K new entries.
     */
    it('all original entries preserved and new entries added when no key overlap', async () => {
        await fc.assert(
            fc.asyncProperty(
                mcpMergeInputGen,
                async ({ existingEntries, newEntries }) => {
                    const tempDir = createTempDir();
                    try {
                        // Set up project root with existing mcp.json
                        const projectRoot = path.join(tempDir, 'project');
                        const mcpDir = path.join(projectRoot, '.kiro', 'settings');
                        fs.mkdirSync(mcpDir, { recursive: true });

                        const existingMcpConfig = { mcpServers: { ...existingEntries } };
                        const mcpFilePath = path.join(mcpDir, 'mcp.json');
                        fs.writeFileSync(mcpFilePath, JSON.stringify(existingMcpConfig, null, 2), 'utf8');

                        // Create MCP source files for overlay entries
                        const sourceDir = path.join(tempDir, 'overlay-mcps');
                        fs.mkdirSync(sourceDir, { recursive: true });

                        const resources = [];
                        let fileIndex = 0;
                        for (const [serverName, serverConfig] of Object.entries(newEntries)) {
                            const mcpSourceFile = path.join(sourceDir, `mcp-${fileIndex}.json`);
                            const mcpContent = { [serverName]: serverConfig };
                            fs.writeFileSync(mcpSourceFile, JSON.stringify(mcpContent), 'utf8');

                            resources.push({
                                name: `mcp-resource-${fileIndex}`,
                                type: 'mcp',
                                absolutePath: mcpSourceFile,
                                source: 'company',
                            });
                            fileIndex++;
                        }

                        // Execute installOverlay
                        const result = await installOverlay(projectRoot, resources);

                        // Read resulting mcp.json
                        const resultContent = fs.readFileSync(mcpFilePath, 'utf8');
                        const resultConfig = JSON.parse(resultContent);

                        const existingKeys = Object.keys(existingEntries);
                        const newKeys = Object.keys(newEntries);

                        // Assert: all M original entries are still present with identical content
                        for (const key of existingKeys) {
                            assert.ok(
                                key in resultConfig.mcpServers,
                                `Existing entry "${key}" was lost after merge`
                            );
                            assert.deepStrictEqual(
                                resultConfig.mcpServers[key],
                                existingEntries[key],
                                `Existing entry "${key}" was modified after merge`
                            );
                        }

                        // Assert: all K new entries are present
                        for (const key of newKeys) {
                            assert.ok(
                                key in resultConfig.mcpServers,
                                `New overlay entry "${key}" was not added`
                            );
                            assert.deepStrictEqual(
                                resultConfig.mcpServers[key],
                                newEntries[key],
                                `New overlay entry "${key}" does not match source`
                            );
                        }

                        // Assert: total keys in mcpServers = M + K
                        const totalKeys = Object.keys(resultConfig.mcpServers).length;
                        assert.strictEqual(
                            totalKeys,
                            existingKeys.length + newKeys.length,
                            `Expected ${existingKeys.length + newKeys.length} total entries, got ${totalKeys}`
                        );

                        // Assert: no errors from installation
                        assert.strictEqual(
                            result.errors.length,
                            0,
                            `Expected zero errors, got: ${JSON.stringify(result.errors)}`
                        );
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ---------------------------------------------------------------------
// Property 11: Environment Variable Reference Preservation
// ---------------------------------------------------------------------

/**
 * Feature: company-resource-overlay, Property 11: Environment Variable Reference Preservation
 *
 * Validates: Requirements 6.5
 *
 * For any MCP config containing `env` values with `${VARIABLE_NAME}` syntax,
 * after installation the corresponding entries in `.kiro/settings/mcp.json`
 * SHALL contain those `${...}` references as literal strings, not resolved values.
 */

// Generators for Property 11

/** Generate a valid uppercase environment variable name (e.g., ANALYTICS_API_KEY, DB_HOST) */
const envVarNameGen = fc
    .tuple(
        fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
        fc.array(
            fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('')),
            { minLength: 1, maxLength: 20 }
        )
    )
    .map(([first, rest]) => first + rest.join(''));

/** Generate an env value that uses ${VARIABLE_NAME} syntax */
const envVarReferenceGen = envVarNameGen.map(name => `\${${name}}`);

/** Generate an env value that may include mixed content with ${VAR} references */
const envValueWithVarGen = fc.oneof(
    envVarReferenceGen,
    fc.tuple(fc.string({ minLength: 0, maxLength: 20 }), envVarReferenceGen).map(
        ([prefix, ref]) => prefix.replace(/[{}"\\]/g, '') + ref
    ),
    fc.tuple(envVarReferenceGen, fc.string({ minLength: 0, maxLength: 20 })).map(
        ([ref, suffix]) => ref + suffix.replace(/[{}"\\]/g, '')
    )
);

/** Generate a valid MCP server name */
const mcpServerNameGen = fc
    .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
        fc.array(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
            { minLength: 1, maxLength: 20 }
        )
    )
    .map(([first, rest]) => first + rest.join(''));

/** Generate an env object with 1-5 entries, each value using ${VAR} syntax */
const envObjectWithVarsGen = fc
    .array(
        fc.tuple(envVarNameGen, envValueWithVarGen),
        { minLength: 1, maxLength: 5 }
    )
    .map(pairs => {
        const env = {};
        for (const [key, value] of pairs) {
            env[key] = value;
        }
        return env;
    });

/** Generate a full MCP config object with server entries containing env vars */
const mcpConfigWithEnvVarsGen = fc
    .tuple(mcpServerNameGen, envObjectWithVarsGen)
    .map(([serverName, env]) => ({
        serverName,
        config: {
            [serverName]: {
                command: 'npx',
                args: ['-y', `@company/${serverName}`],
                env,
            },
        },
        env,
    }));

describe('Feature: company-resource-overlay, Property 11: Environment Variable Reference Preservation', () => {

    /**
     * Validates: Requirements 6.5
     *
     * For any MCP config containing `env` values with `${VARIABLE_NAME}` syntax,
     * after installation the corresponding entries in `.kiro/settings/mcp.json`
     * SHALL contain those `${...}` references as literal strings, not resolved values.
     */
    it('${VARIABLE_NAME} references in env values are preserved as literal strings in output mcp.json', async () => {
        await fc.assert(
            fc.asyncProperty(
                mcpConfigWithEnvVarsGen,
                validResourceNameGen,
                async ({ serverName, config, env }, resourceName) => {
                    const tempDir = createTempDir();
                    try {
                        // Set up MCP source file
                        const sourceDir = path.join(tempDir, 'overlay-source');
                        fs.mkdirSync(sourceDir, { recursive: true });
                        const sourceFilePath = path.join(sourceDir, `${resourceName}.json`);
                        fs.writeFileSync(sourceFilePath, JSON.stringify(config), 'utf8');

                        // Build ResolvedResource array with type 'mcp'
                        const resources = [
                            {
                                name: resourceName,
                                type: 'mcp',
                                absolutePath: sourceFilePath,
                                source: 'company',
                            },
                        ];

                        // Create project root directory
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Execute installOverlay
                        const result = await installOverlay(projectRoot, resources);

                        // Read the resulting mcp.json
                        const mcpJsonPath = path.join(projectRoot, '.kiro', 'settings', 'mcp.json');
                        assert.ok(
                            fs.existsSync(mcpJsonPath),
                            'Expected .kiro/settings/mcp.json to exist after MCP installation'
                        );

                        const mcpContent = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));

                        // Assert server was installed
                        assert.ok(
                            mcpContent.mcpServers[serverName],
                            `Expected server "${serverName}" to be in mcpServers`
                        );

                        const installedEnv = mcpContent.mcpServers[serverName].env;
                        assert.ok(
                            installedEnv && typeof installedEnv === 'object',
                            'Expected installed server to have an env object'
                        );

                        // Assert each ${VARIABLE_NAME} reference is preserved literally
                        for (const [key, originalValue] of Object.entries(env)) {
                            assert.strictEqual(
                                installedEnv[key],
                                originalValue,
                                `Env var "${key}" value should be preserved as literal string. ` +
                                `Expected: "${originalValue}", Got: "${installedEnv[key]}"`
                            );

                            // Verify ${...} patterns are present as literal text, not resolved
                            const varRefPattern = /\$\{[A-Z0-9_]+\}/;
                            if (varRefPattern.test(originalValue)) {
                                assert.ok(
                                    varRefPattern.test(installedEnv[key]),
                                    `Expected ${key} value to contain literal \${...} reference. ` +
                                    `Value "${installedEnv[key]}" should not have been resolved.`
                                );
                            }
                        }

                        // Assert no errors for this resource
                        assert.strictEqual(
                            result.errors.length,
                            0,
                            `Expected no errors, got: ${JSON.stringify(result.errors)}`
                        );
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
