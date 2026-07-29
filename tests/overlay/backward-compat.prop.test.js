'use strict';

/**
 * Property-Based Tests for Backward Compatibility Without Overlay
 *
 * Feature: company-resource-overlay, Property 13: Backward Compatibility Without Overlay
 *
 * Validates: Requirements 7.4, 10.6
 *
 * For any project where `.awos-company/` does not exist, calling the extended
 * `install()` function SHALL produce output identical to calling the pre-extension
 * `install()` (i.e., `installOverlay` returns an empty result and performs no
 * filesystem operations).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const fc = require('fast-check');

const { install, installOverlay } = require('../../.awos-adapters/lib/installers/kiro');
const { discover } = require('../../.awos-adapters/lib/resource-resolver');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Create a temporary directory for test isolation.
 * @returns {string} Absolute path to the temp directory
 */
function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-prop13-'));
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

/** Valid directory/file name: lowercase alphanumeric + hyphens/underscores, 1–15 chars */
const validDirNameGen = fc
    .tuple(
        fc.constantFrom(...FIRST_CHARS.split('')),
        fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 0, maxLength: 13 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Generate a random markdown file content */
const markdownContentGen = fc
    .string({ minLength: 1, maxLength: 200 })
    .map(s => `# Title\n\n${s.replace(/\0/g, '')}\n`);

/**
 * Generate a random project structure that does NOT have `.awos-company/`.
 * May optionally include `.awos-adapters/kiro/steering/` and `.awos-adapters/kiro/hooks/`
 * directories with random files.
 */
const projectStructureGen = fc.record({
    /** Whether to include .awos-adapters/kiro/steering/ with files */
    hasSteering: fc.boolean(),
    /** Number of steering files (0–3) */
    steeringFileCount: fc.integer({ min: 0, max: 3 }),
    /** Steering filenames */
    steeringNames: fc.array(validDirNameGen, { minLength: 3, maxLength: 3 }),
    /** Whether to include .awos-adapters/kiro/hooks/ with files */
    hasHooks: fc.boolean(),
    /** Number of hook files (0–2) */
    hookFileCount: fc.integer({ min: 0, max: 2 }),
    /** Hook filenames */
    hookNames: fc.array(validDirNameGen, { minLength: 2, maxLength: 2 }),
    /** Whether to include some random extra directories (not .awos-company) */
    extraDirs: fc.array(
        validDirNameGen.filter(name =>
            name !== 'awos-company' && !name.startsWith('.awos-company')
        ),
        { minLength: 0, maxLength: 3 }
    ),
});

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Feature: company-resource-overlay, Property 13: Backward Compatibility Without Overlay', () => {

    /**
     * Validates: Requirements 7.4, 10.6
     *
     * Test that `installOverlay` with an empty resources array returns an empty result
     * with all arrays empty, no errors, no warnings.
     */
    it('installOverlay with empty resources returns empty result', async () => {
        await fc.assert(
            fc.asyncProperty(
                projectStructureGen,
                async (structure) => {
                    const tempDir = createTempDir();
                    try {
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Create extra directories (none should be .awos-company)
                        for (const dir of structure.extraDirs) {
                            fs.mkdirSync(path.join(projectRoot, dir), { recursive: true });
                        }

                        // Call installOverlay with an empty resources array
                        const result = await installOverlay(projectRoot, []);

                        // Assert: result.overlay is the empty result
                        assert.deepStrictEqual(result.skills, [],
                            'Expected skills to be empty array');
                        assert.deepStrictEqual(result.agents, [],
                            'Expected agents to be empty array');
                        assert.deepStrictEqual(result.mcps, [],
                            'Expected mcps to be empty array');
                        assert.deepStrictEqual(result.warnings, [],
                            'Expected warnings to be empty array');
                        assert.deepStrictEqual(result.errors, [],
                            'Expected errors to be empty array');

                        // Assert: no .kiro/skills/ directory was created by overlay
                        const kiroSkillsDir = path.join(projectRoot, '.kiro', 'skills');
                        assert.ok(
                            !fs.existsSync(kiroSkillsDir),
                            'Expected no .kiro/skills/ directory to be created when no overlay resources'
                        );
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Validates: Requirements 7.4, 10.6
     *
     * Test that `discover()` on a project without `.awos-company/` returns
     * empty resources with no warnings and no errors.
     */
    it('discover returns empty result when .awos-company/ does not exist', async () => {
        await fc.assert(
            fc.asyncProperty(
                projectStructureGen,
                async (structure) => {
                    const tempDir = createTempDir();
                    try {
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Set up directories that are NOT .awos-company
                        for (const dir of structure.extraDirs) {
                            fs.mkdirSync(path.join(projectRoot, dir), { recursive: true });
                        }

                        // Explicitly verify .awos-company does NOT exist
                        assert.ok(
                            !fs.existsSync(path.join(projectRoot, '.awos-company')),
                            'Test precondition: .awos-company/ must not exist'
                        );

                        // Call discover
                        const result = discover(projectRoot);

                        // Assert: empty resources, no warnings, no errors
                        assert.deepStrictEqual(result.resources, [],
                            'Expected resources to be empty array');
                        assert.deepStrictEqual(result.warnings, [],
                            'Expected warnings to be empty array');
                        assert.deepStrictEqual(result.errors, [],
                            'Expected errors to be empty array');
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Validates: Requirements 7.4, 10.6
     *
     * Test that `discover()` on a project with `.awos-company/` but no
     * `manifest.json` returns empty resources with no warnings and no errors.
     */
    it('discover returns empty result when .awos-company/ exists but has no manifest.json', async () => {
        await fc.assert(
            fc.asyncProperty(
                projectStructureGen,
                async (structure) => {
                    const tempDir = createTempDir();
                    try {
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Create .awos-company/ directory without manifest.json
                        const overlayDir = path.join(projectRoot, '.awos-company');
                        fs.mkdirSync(overlayDir, { recursive: true });

                        // Optionally add some subdirectories to .awos-company
                        for (const dir of structure.extraDirs.slice(0, 2)) {
                            fs.mkdirSync(path.join(overlayDir, dir), { recursive: true });
                        }

                        // Verify precondition: no manifest.json
                        assert.ok(
                            !fs.existsSync(path.join(overlayDir, 'manifest.json')),
                            'Test precondition: manifest.json must not exist'
                        );

                        // Call discover
                        const result = discover(projectRoot);

                        // Assert: empty resources, no warnings, no errors
                        assert.deepStrictEqual(result.resources, [],
                            'Expected resources to be empty array');
                        assert.deepStrictEqual(result.warnings, [],
                            'Expected warnings to be empty array');
                        assert.deepStrictEqual(result.errors, [],
                            'Expected errors to be empty array');
                    } finally {
                        removeTempDir(tempDir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Validates: Requirements 7.4, 10.6
     *
     * For any project where `.awos-company/` does not exist, calling the full
     * `install()` function SHALL produce an overlay result identical to the empty
     * overlay result. The steering and hooks results should reflect what actually
     * exists in the project, unaffected by the overlay integration.
     */
    it('install() on project without .awos-company/ produces empty overlay result and does not affect steering/hooks', async () => {
        await fc.assert(
            fc.asyncProperty(
                projectStructureGen,
                markdownContentGen,
                async (structure, mdContent) => {
                    const tempDir = createTempDir();
                    try {
                        const projectRoot = path.join(tempDir, 'project');
                        fs.mkdirSync(projectRoot, { recursive: true });

                        // Set up .awos-adapters/kiro/steering/ if structure says to
                        if (structure.hasSteering && structure.steeringFileCount > 0) {
                            const steeringDir = path.join(projectRoot, '.awos-adapters', 'kiro', 'steering');
                            fs.mkdirSync(steeringDir, { recursive: true });
                            const count = Math.min(structure.steeringFileCount, structure.steeringNames.length);
                            for (let i = 0; i < count; i++) {
                                const filename = `${structure.steeringNames[i]}.md`;
                                fs.writeFileSync(
                                    path.join(steeringDir, filename),
                                    mdContent,
                                    'utf8'
                                );
                            }
                        }

                        // Set up .awos-adapters/kiro/hooks/ if structure says to
                        if (structure.hasHooks && structure.hookFileCount > 0) {
                            const hooksDir = path.join(projectRoot, '.awos-adapters', 'kiro', 'hooks');
                            fs.mkdirSync(hooksDir, { recursive: true });
                            const count = Math.min(structure.hookFileCount, structure.hookNames.length);
                            for (let i = 0; i < count; i++) {
                                const filename = `${structure.hookNames[i]}-post-task.md`;
                                fs.writeFileSync(
                                    path.join(hooksDir, filename),
                                    mdContent,
                                    'utf8'
                                );
                            }
                        }

                        // Ensure no .awos-company/ directory
                        assert.ok(
                            !fs.existsSync(path.join(projectRoot, '.awos-company')),
                            'Test precondition: .awos-company/ must not exist'
                        );

                        // Call the full install()
                        const result = await install(projectRoot);

                        // Assert: overlay result is empty
                        assert.deepStrictEqual(result.overlay.skills, [],
                            'Expected overlay.skills to be empty');
                        assert.deepStrictEqual(result.overlay.agents, [],
                            'Expected overlay.agents to be empty');
                        assert.deepStrictEqual(result.overlay.mcps, [],
                            'Expected overlay.mcps to be empty');
                        assert.deepStrictEqual(result.overlay.warnings, [],
                            'Expected overlay.warnings to be empty');
                        assert.deepStrictEqual(result.overlay.errors, [],
                            'Expected overlay.errors to be empty');

                        // Assert: no overlay-specific files were created in .kiro/skills/
                        const kiroSkillsDir = path.join(projectRoot, '.kiro', 'skills');
                        assert.ok(
                            !fs.existsSync(kiroSkillsDir),
                            'Expected no .kiro/skills/ directory to be created by overlay'
                        );

                        // Assert: steering and hooks results are properly returned
                        // (they reflect actual adapter content, not affected by overlay)
                        assert.ok(
                            'installed' in result.steering,
                            'Expected steering result to have installed property'
                        );
                        assert.ok(
                            'errors' in result.steering,
                            'Expected steering result to have errors property'
                        );
                        assert.ok(
                            'installed' in result.hooks,
                            'Expected hooks result to have installed property'
                        );
                        assert.ok(
                            'errors' in result.hooks,
                            'Expected hooks result to have errors property'
                        );

                        // Assert: no overlay-related warnings or errors leaked into
                        // steering or hooks results
                        for (const err of result.steering.errors) {
                            assert.ok(
                                !err.includes('overlay') && !err.includes('.awos-company'),
                                `Unexpected overlay-related error in steering: ${err}`
                            );
                        }
                        for (const err of result.hooks.errors) {
                            assert.ok(
                                !err.includes('overlay') && !err.includes('.awos-company'),
                                `Unexpected overlay-related error in hooks: ${err}`
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
