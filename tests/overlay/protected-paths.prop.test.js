'use strict';

/**
 * Property-Based Tests for Protected Paths Invariant
 *
 * Feature: company-resource-overlay, Property 12: Protected Paths Invariant
 *
 * Validates: Requirements 7.1, 7.5
 *
 * For any overlay discovery or installation operation, no file SHALL be created,
 * modified, or deleted under the paths `.awos/`, `commands/`, `plugins/`,
 * `templates/`, or `src/` relative to the project root.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const fc = require('fast-check');

const { installOverlay, isProtectedPath, PROTECTED_DIRS } = require('../../.awos-adapters/lib/installers/kiro');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Create a temporary directory for test isolation.
 * @returns {string} Absolute path to the temp directory
 */
function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-prop12-'));
}

/**
 * Recursively remove a directory.
 * @param {string} dir
 */
function removeTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Recursively list all files in a directory.
 * @param {string} dir - Directory to scan
 * @returns {string[]} Array of absolute file paths
 */
function listAllFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...listAllFiles(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

/** Content for canary files placed in protected directories. */
const CANARY_CONTENT = 'CANARY_FILE_UNCHANGED_MARKER_12345';

/**
 * Set up protected directories with canary files in the project root.
 * @param {string} projectRoot
 * @returns {Map<string, string>} Map of canary file path → original content
 */
function seedProtectedDirs(projectRoot) {
    const canaryMap = new Map();
    for (const dir of PROTECTED_DIRS) {
        const protectedDir = path.join(projectRoot, dir);
        fs.mkdirSync(protectedDir, { recursive: true });
        const canaryPath = path.join(protectedDir, 'canary.txt');
        fs.writeFileSync(canaryPath, CANARY_CONTENT, 'utf8');
        canaryMap.set(canaryPath, CANARY_CONTENT);
    }
    return canaryMap;
}

/**
 * Verify that no new files were created and no canary files were modified or deleted
 * under protected directories.
 * @param {string} projectRoot
 * @param {Map<string, string>} canaryMap - Original canary file paths and content
 */
function assertProtectedDirsUntouched(projectRoot, canaryMap) {
    for (const dir of PROTECTED_DIRS) {
        const protectedDir = path.join(projectRoot, dir);

        // Check all files in the protected directory
        const currentFiles = listAllFiles(protectedDir);

        // Only the canary file should exist
        const expectedCanaryPath = path.join(protectedDir, 'canary.txt');
        assert.strictEqual(
            currentFiles.length,
            1,
            `Expected only canary file under ${dir}/, found ${currentFiles.length} files: ${JSON.stringify(currentFiles)}`
        );
        assert.strictEqual(
            currentFiles[0],
            expectedCanaryPath,
            `Unexpected file under ${dir}/: ${currentFiles[0]}`
        );

        // Canary file should still have original content (not modified)
        const content = fs.readFileSync(expectedCanaryPath, 'utf8');
        assert.strictEqual(
            content,
            CANARY_CONTENT,
            `Canary file in ${dir}/ was modified`
        );
    }

    // Also verify all original canary files still exist (not deleted)
    for (const [canaryPath, originalContent] of canaryMap) {
        assert.ok(
            fs.existsSync(canaryPath),
            `Canary file was deleted: ${canaryPath}`
        );
        const content = fs.readFileSync(canaryPath, 'utf8');
        assert.strictEqual(
            content,
            originalContent,
            `Canary file content was modified: ${canaryPath}`
        );
    }
}

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

const FIRST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const REST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_-';

/** Valid resource/skill name: starts with [a-z0-9], rest [a-z0-9_-], 1–20 chars */
const validNameGen = fc
    .tuple(
        fc.constantFrom(...FIRST_CHARS.split('')),
        fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 0, maxLength: 18 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Generate random markdown body content */
const markdownBodyGen = fc
    .string({ minLength: 1, maxLength: 200 })
    .map(s => s.replace(/---/g, '===').replace(/\0/g, ''));

/** Generate a valid skill resource with content */
const skillResourceGen = fc
    .tuple(validNameGen, validNameGen, markdownBodyGen)
    .map(([resourceName, skillName, body]) => ({
        resourceName,
        skillName,
        content: `---\nname: ${skillName}\n---\n\n# ${skillName}\n\n${body}\n`,
        filename: `${skillName}.md`,
    }));

/** Generate a valid agent resource (referencing skill names that will exist) */
const agentResourceGen = fc
    .tuple(validNameGen, validNameGen, markdownBodyGen)
    .map(([resourceName, agentName, body]) => ({
        resourceName,
        agentName,
        description: body.slice(0, 50).replace(/\n/g, ' '),
    }));

/** Generate a valid MCP resource */
const mcpResourceGen = fc
    .tuple(
        validNameGen,
        validNameGen,
        fc.constantFrom('npx', 'node', 'python')
    )
    .map(([resourceName, serverName, command]) => ({
        resourceName,
        serverName: `overlay-${serverName}`,
        config: {
            command,
            args: ['-y', `@company/${serverName}`],
            env: { [`${serverName.toUpperCase().replace(/-/g, '_')}_KEY`]: '${API_KEY}' },
        },
    }));

/** Generate a mix of overlay resources (1-5 of each type) */
const overlayResourceSetGen = fc
    .tuple(
        fc.array(skillResourceGen, { minLength: 1, maxLength: 3 }),
        fc.array(agentResourceGen, { minLength: 0, maxLength: 2 }),
        fc.array(mcpResourceGen, { minLength: 0, maxLength: 2 })
    )
    .filter(([skills, agents, mcps]) => {
        // Ensure unique names across all resources
        const names = [
            ...skills.map(s => s.resourceName),
            ...agents.map(a => a.resourceName),
            ...mcps.map(m => m.resourceName),
        ];
        const skillNames = skills.map(s => s.skillName);
        return new Set(names).size === names.length && new Set(skillNames).size === skillNames.length;
    });

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Feature: company-resource-overlay, Property 12: Protected Paths Invariant', () => {

    /**
     * Validates: Requirements 7.1, 7.5
     *
     * For any overlay installation with random skill, agent, and MCP resources,
     * no file SHALL be created, modified, or deleted under the paths `.awos/`,
     * `commands/`, `plugins/`, `templates/`, or `src/` relative to the project root.
     */
    it('no files created/modified/deleted under protected paths during installOverlay', async () => {
        await fc.assert(
            fc.asyncProperty(
                overlayResourceSetGen,
                async ([skills, agents, mcps]) => {
                    const tempDir = createTempDir();
                    try {
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Seed protected directories with canary files
                        const canaryMap = seedProtectedDirs(projectRoot);

                        // Set up source overlay directory
                        const sourceDir = path.join(tempDir, 'overlay-source');
                        fs.mkdirSync(path.join(sourceDir, 'skills'), { recursive: true });
                        fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true });
                        fs.mkdirSync(path.join(sourceDir, 'mcps'), { recursive: true });

                        const resources = [];

                        // Create skill source files
                        for (const skill of skills) {
                            const skillFilePath = path.join(sourceDir, 'skills', skill.filename);
                            fs.writeFileSync(skillFilePath, skill.content, 'utf8');
                            resources.push({
                                name: skill.resourceName,
                                type: 'skill',
                                absolutePath: skillFilePath,
                                source: 'company',
                            });
                        }

                        // Create agent source files (referencing existing skills)
                        for (const agent of agents) {
                            // Agent references the first skill from the skills list
                            const referencedSkill = skills[0].skillName;
                            const agentContent =
                                `---\nname: ${agent.agentName}\ndescription: ${agent.description}\nskills: ${referencedSkill}\n---\n\n# ${agent.agentName}\n\nAgent body.\n`;
                            const agentFilePath = path.join(sourceDir, 'agents', `${agent.agentName}.md`);
                            fs.writeFileSync(agentFilePath, agentContent, 'utf8');
                            resources.push({
                                name: agent.resourceName,
                                type: 'agent',
                                absolutePath: agentFilePath,
                                source: 'company',
                            });
                        }

                        // Create MCP source files
                        for (const mcp of mcps) {
                            const mcpContent = JSON.stringify({ [mcp.serverName]: mcp.config });
                            const mcpFilePath = path.join(sourceDir, 'mcps', `${mcp.resourceName}.json`);
                            fs.writeFileSync(mcpFilePath, mcpContent, 'utf8');
                            resources.push({
                                name: mcp.resourceName,
                                type: 'mcp',
                                absolutePath: mcpFilePath,
                                source: 'company',
                            });
                        }

                        // Execute installOverlay
                        await installOverlay(projectRoot, resources);

                        // Assert: protected directories are completely untouched
                        assertProtectedDirsUntouched(projectRoot, canaryMap);

                        // Assert: all installation output goes to .kiro/
                        const kiroDir = path.join(projectRoot, '.kiro');
                        if (fs.existsSync(kiroDir)) {
                            const kiroFiles = listAllFiles(kiroDir);
                            for (const file of kiroFiles) {
                                const relPath = path.relative(projectRoot, file);
                                assert.ok(
                                    relPath.startsWith('.kiro'),
                                    `Installed file "${relPath}" is not under .kiro/`
                                );
                            }
                        }
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Validates: Requirements 7.1, 7.5
     *
     * The `isProtectedPath` function correctly identifies all protected directories
     * for any valid project root and any path under the protected directories.
     */
    it('isProtectedPath correctly identifies all protected directories', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate a project root suffix
                validNameGen,
                // Generate subdirectory path segments under a protected dir
                fc.array(validNameGen, { minLength: 1, maxLength: 3 }),
                // Generate a filename
                validNameGen.map(n => n + '.txt'),
                async (rootSuffix, subParts, filename) => {
                    const projectRoot = path.join(os.tmpdir(), `proj-${rootSuffix}`);

                    // For each protected directory, a path under it MUST be identified as protected
                    for (const dir of PROTECTED_DIRS) {
                        const protectedPath = path.join(projectRoot, dir, ...subParts, filename);
                        assert.ok(
                            isProtectedPath(projectRoot, protectedPath),
                            `Expected isProtectedPath to return true for path under "${dir}": ${protectedPath}`
                        );
                    }

                    // Paths under .kiro/ MUST NOT be identified as protected
                    const kiroPath = path.join(projectRoot, '.kiro', ...subParts, filename);
                    assert.ok(
                        !isProtectedPath(projectRoot, kiroPath),
                        `Expected isProtectedPath to return false for path under .kiro/: ${kiroPath}`
                    );

                    // Paths under .kiro/skills/ MUST NOT be identified as protected
                    const kiroSkillPath = path.join(projectRoot, '.kiro', 'skills', ...subParts, filename);
                    assert.ok(
                        !isProtectedPath(projectRoot, kiroSkillPath),
                        `Expected isProtectedPath to return false for .kiro/skills/ path: ${kiroSkillPath}`
                    );

                    // Paths under .kiro/steering/ MUST NOT be identified as protected
                    const kiroSteeringPath = path.join(projectRoot, '.kiro', 'steering', ...subParts, filename);
                    assert.ok(
                        !isProtectedPath(projectRoot, kiroSteeringPath),
                        `Expected isProtectedPath to return false for .kiro/steering/ path: ${kiroSteeringPath}`
                    );

                    // Paths under .kiro/settings/ MUST NOT be identified as protected
                    const kiroSettingsPath = path.join(projectRoot, '.kiro', 'settings', ...subParts, filename);
                    assert.ok(
                        !isProtectedPath(projectRoot, kiroSettingsPath),
                        `Expected isProtectedPath to return false for .kiro/settings/ path: ${kiroSettingsPath}`
                    );
                }
            ),
            { numRuns: 100 }
        );
    });
});
