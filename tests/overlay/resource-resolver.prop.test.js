'use strict';

/**
 * Property-Based Tests for Resource Resolver — Schema Validation
 *
 * Feature: company-resource-overlay, Property 1: Schema Validation Correctness
 *
 * Validates: Requirements 2.1, 2.2, 2.6, 2.7, 11.2
 *
 * For any JSON object, the manifest schema validator SHALL accept it if and only if
 * it has a `resources` array where every entry contains:
 * - `name` matching ^[a-z0-9][a-z0-9_-]*$ (1–128 chars)
 * - `type` in {"skill", "agent", "mcp"}
 * - `path` containing no `..` traversal segments
 * - Optional `description` (string, max 256 chars)
 * - Optional `tags` (array, max 20 items, each string 1-64 chars)
 * - No additional properties on entries or top-level
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const fc = require('fast-check');

const { validateSchema, discover } = require('../../.awos-adapters/lib/resource-resolver');

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

const FIRST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const REST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_-';

/** Valid resource name: starts with [a-z0-9], rest [a-z0-9_-], 1–128 chars */
const validNameGen = fc
    .tuple(
        fc.constantFrom(...FIRST_CHARS.split('')),
        fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 0, maxLength: 126 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Valid resource type */
const validTypeGen = fc.constantFrom('skill', 'agent', 'mcp');

/** Valid path: non-empty string without ".." traversal segments */
const PATH_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_.';
const validPathGen = fc
    .array(
        fc.array(fc.constantFrom(...PATH_CHARS.split('')), { minLength: 1, maxLength: 20 }).map(c => c.join('')),
        { minLength: 1, maxLength: 5 }
    )
    .map(segments => segments.join('/'));

/** Valid description: string max 256 chars */
const validDescriptionGen = fc.string({ minLength: 0, maxLength: 256 });

/** Valid single tag: non-empty string, max 64 chars */
const validTagGen = fc.string({ minLength: 1, maxLength: 64 });

/** Valid tags array: max 20 items */
const validTagsGen = fc.array(validTagGen, { minLength: 0, maxLength: 20 });

/** Generator for a valid resource entry (required fields only) */
const validResourceEntryRequiredGen = fc.record({
    name: validNameGen,
    type: validTypeGen,
    path: validPathGen,
});

/** Generator for a valid resource entry (with optional fields) */
const validResourceEntryGen = fc
    .tuple(
        validResourceEntryRequiredGen,
        fc.option(validDescriptionGen, { nil: undefined }),
        fc.option(validTagsGen, { nil: undefined })
    )
    .map(([entry, description, tags]) => {
        const result = { ...entry };
        if (description !== undefined) {
            result.description = description;
        }
        if (tags !== undefined) {
            result.tags = tags;
        }
        return result;
    });

/** Generator for a valid manifest object */
const validManifestGen = fc
    .array(validResourceEntryGen, { minLength: 0, maxLength: 10 })
    .map(resources => ({ resources }));

// --- Invalid generators ---

/** Invalid name: contains uppercase, special chars, or empty */
const invalidNameGen = fc.oneof(
    fc.constant(''),                                     // empty string
    fc.constant('A_upper_start'),                       // starts with uppercase
    fc.constant('_starts-with-underscore'),             // starts with underscore
    fc.constant('-starts-with-dash'),                   // starts with dash
    fc.constant('has spaces'),                          // contains spaces
    fc.constant('HAS.DOTS.AND.CAPS'),                  // uppercase + dots
    // Name that exceeds 128 chars
    fc.constant('a' + 'x'.repeat(128))                 // 129 chars total
);

/** Invalid type: not in the enum */
const invalidTypeGen = fc.oneof(
    fc.constant('SKILL'),
    fc.constant('Agent'),
    fc.constant('unknown'),
    fc.constant(''),
    fc.constant('mcp-server'),
    fc.integer().map(n => String(n))
);

/** Path with traversal */
const traversalPathGen = fc.oneof(
    fc.constant('../etc/passwd'),
    fc.constant('skills/../../../secret'),
    fc.constant('foo/bar/..'),
    fc.constant('..'),
    fc.constant('a/b/../c'),
);

/** Generator for a manifest missing the 'resources' field */
const missingResourcesGen = fc.record({
    other: fc.string(),
}).filter(obj => !('resources' in obj));

/** Generator for a manifest where 'resources' is not an array */
const resourcesNotArrayGen = fc.oneof(
    fc.constant({ resources: 'not-an-array' }),
    fc.constant({ resources: 42 }),
    fc.constant({ resources: null }),
    fc.constant({ resources: {} }),
);

/** Generator for entries missing required fields */
const entryMissingFieldGen = fc.oneof(
    // Missing 'name'
    fc.record({ type: validTypeGen, path: validPathGen }),
    // Missing 'type'
    fc.record({ name: validNameGen, path: validPathGen }),
    // Missing 'path'
    fc.record({ name: validNameGen, type: validTypeGen }),
);

/** Generator for entries with additional properties */
const entryWithExtraPropsGen = fc
    .tuple(validResourceEntryRequiredGen, fc.string({ minLength: 1, maxLength: 10 }))
    .map(([entry, extraVal]) => ({ ...entry, extraProp: extraVal }));

/** Generator for a manifest with additional top-level properties */
const manifestWithExtraTopLevelGen = fc
    .tuple(validManifestGen, fc.string({ minLength: 1, maxLength: 10 }))
    .map(([manifest, extraVal]) => ({ ...manifest, unknownField: extraVal }));

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Feature: company-resource-overlay, Property 1: Schema Validation Correctness', () => {

    it('valid manifests produce zero validation errors', () => {
        /**
         * Validates: Requirements 2.1, 2.2
         *
         * For any valid manifest with resources array where every entry has
         * valid name, type, path, and optional description/tags,
         * validateSchema SHALL return an empty errors array.
         */
        fc.assert(
            fc.property(validManifestGen, (manifest) => {
                const errors = validateSchema(manifest);
                assert.deepStrictEqual(errors, [],
                    `Expected no errors for valid manifest, got: ${JSON.stringify(errors)}`);
            }),
            { numRuns: 100 }
        );
    });

    it('manifests missing "resources" field produce errors', () => {
        /**
         * Validates: Requirements 2.1, 11.2
         *
         * A manifest without the required "resources" array SHALL be rejected.
         */
        fc.assert(
            fc.property(missingResourcesGen, (manifest) => {
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    'Expected errors for manifest missing "resources"');
            }),
            { numRuns: 100 }
        );
    });

    it('manifests where "resources" is not an array produce errors', () => {
        /**
         * Validates: Requirements 2.1, 11.2
         */
        fc.assert(
            fc.property(resourcesNotArrayGen, (manifest) => {
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    'Expected errors when "resources" is not an array');
            }),
            { numRuns: 100 }
        );
    });

    it('entries missing required fields produce errors', () => {
        /**
         * Validates: Requirements 2.2, 2.6, 11.2
         *
         * Any resource entry missing name, type, or path SHALL cause rejection.
         */
        fc.assert(
            fc.property(entryMissingFieldGen, (badEntry) => {
                const manifest = { resources: [badEntry] };
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    `Expected errors for entry missing required field: ${JSON.stringify(badEntry)}`);
            }),
            { numRuns: 100 }
        );
    });

    it('entries with invalid name produce errors', () => {
        /**
         * Validates: Requirements 2.2, 11.2
         *
         * Names not matching ^[a-z0-9][a-z0-9_-]*$ or outside 1-128 chars SHALL be rejected.
         */
        fc.assert(
            fc.property(invalidNameGen, validTypeGen, validPathGen, (name, type, path) => {
                const manifest = { resources: [{ name, type, path }] };
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    `Expected errors for invalid name "${name}"`);
            }),
            { numRuns: 100 }
        );
    });

    it('entries with invalid type produce errors', () => {
        /**
         * Validates: Requirements 2.2, 2.7, 11.2
         *
         * Types not in {"skill", "agent", "mcp"} SHALL be rejected.
         */
        fc.assert(
            fc.property(validNameGen, invalidTypeGen, validPathGen, (name, type, path) => {
                const manifest = { resources: [{ name, type, path }] };
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    `Expected errors for invalid type "${type}"`);
            }),
            { numRuns: 100 }
        );
    });

    it('entries with path traversal produce errors', () => {
        /**
         * Validates: Requirements 2.2, 11.2
         *
         * Paths containing ".." traversal segments SHALL be rejected.
         */
        fc.assert(
            fc.property(validNameGen, validTypeGen, traversalPathGen, (name, type, path) => {
                const manifest = { resources: [{ name, type, path }] };
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    `Expected errors for traversal path "${path}"`);
            }),
            { numRuns: 100 }
        );
    });

    it('entries with additional properties produce errors', () => {
        /**
         * Validates: Requirements 2.1, 11.2
         *
         * No additional properties on entries allowed.
         */
        fc.assert(
            fc.property(entryWithExtraPropsGen, (badEntry) => {
                const manifest = { resources: [badEntry] };
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    `Expected errors for entry with extra properties: ${JSON.stringify(badEntry)}`);
            }),
            { numRuns: 100 }
        );
    });

    it('manifests with additional top-level properties produce errors', () => {
        /**
         * Validates: Requirements 2.1, 11.2
         *
         * No additional top-level properties beyond "resources" allowed.
         */
        fc.assert(
            fc.property(manifestWithExtraTopLevelGen, (manifest) => {
                const errors = validateSchema(manifest);
                assert.ok(errors.length > 0,
                    `Expected errors for manifest with extra top-level properties: ${JSON.stringify(Object.keys(manifest))}`);
            }),
            { numRuns: 100 }
        );
    });

    it('non-object manifests produce errors', () => {
        /**
         * Validates: Requirements 2.1, 11.2
         *
         * Manifests that are not JSON objects SHALL be rejected.
         */
        const nonObjects = [null, 42, 'string', true, [], undefined];
        for (const value of nonObjects) {
            const errors = validateSchema(value);
            assert.ok(errors.length > 0,
                `Expected errors for non-object manifest: ${JSON.stringify(value)}`);
        }
    });
});

// ---------------------------------------------------------------------
// Property 3: Duplicate Name Deduplication
// ---------------------------------------------------------------------

/**
 * Feature: company-resource-overlay, Property 3: Duplicate Name Deduplication
 *
 * **Validates: Requirements 2.5**
 *
 * For any manifest containing resource entries with duplicate `name` values,
 * the resolver SHALL return only the first occurrence of each name and produce
 * exactly one warning per additional duplicate, identifying the duplicate entry.
 */

/**
 * Create a temporary directory for test isolation.
 * @returns {string} Absolute path to the temp directory
 */
function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-prop3-'));
}

/**
 * Recursively remove a directory.
 * @param {string} dir
 */
function removeTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

/** Valid resource name: starts with [a-z0-9], rest [a-z0-9_-], 2–20 chars */
const validNameP3 = fc
    .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
        fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('')), { minLength: 1, maxLength: 19 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Valid resource type */
const validTypeP3 = fc.constantFrom('skill', 'agent', 'mcp');

describe('Feature: company-resource-overlay, Property 3: Duplicate Name Deduplication', () => {

    /**
     * **Validates: Requirements 2.5**
     *
     * For any manifest containing resource entries with duplicate `name` values,
     * the resolver SHALL return only the first occurrence of each name and produce
     * exactly one warning per additional duplicate, identifying the duplicate entry.
     */
    it('should keep only first occurrence of each name and warn for each duplicate', () => {
        fc.assert(
            fc.property(
                // Generate M unique names (1-6), then for each name generate count of occurrences (1-4)
                // ensuring at least one name has count > 1
                fc.integer({ min: 1, max: 6 }).chain(uniqueCount =>
                    fc.tuple(
                        fc.uniqueArray(validNameP3, {
                            minLength: uniqueCount,
                            maxLength: uniqueCount,
                            comparator: 'IsStrictlyEqual',
                        }),
                        fc.array(fc.integer({ min: 1, max: 4 }), {
                            minLength: uniqueCount,
                            maxLength: uniqueCount,
                        })
                    ).filter(([names, counts]) => counts.some(c => c > 1))
                ),
                validTypeP3,
                ([uniqueNames, counts], defaultType) => {
                    const tempDir = createTempDir();
                    try {
                        const overlayDir = path.join(tempDir, '.awos-company');
                        fs.mkdirSync(overlayDir, { recursive: true });

                        // Build resource entries — for each unique name, create `count` entries
                        // Each entry gets a distinct file path
                        const entries = [];
                        const firstPaths = new Map(); // name → absolutePath of first occurrence

                        for (let i = 0; i < uniqueNames.length; i++) {
                            const name = uniqueNames[i];
                            const count = counts[i];

                            for (let j = 0; j < count; j++) {
                                const filename = `${name}-${j}.md`;
                                entries.push({
                                    name,
                                    type: defaultType,
                                    path: filename,
                                });

                                // Create the file on disk so path resolution succeeds
                                fs.writeFileSync(path.join(overlayDir, filename), `content-${name}-${j}`);

                                // Track first path per name
                                if (!firstPaths.has(name)) {
                                    firstPaths.set(name, path.resolve(overlayDir, filename));
                                }
                            }
                        }

                        // Write the manifest
                        fs.writeFileSync(
                            path.join(overlayDir, 'manifest.json'),
                            JSON.stringify({ resources: entries }, null, 2)
                        );

                        // Execute discover
                        const result = discover(tempDir);

                        // Calculate expected values
                        const totalEntries = entries.length;
                        const uniqueNameCount = uniqueNames.length;
                        const expectedDuplicateWarnings = totalEntries - uniqueNameCount;

                        // Assertion 1: Each unique name appears exactly once in result.resources
                        assert.equal(
                            result.resources.length,
                            uniqueNameCount,
                            `Expected ${uniqueNameCount} resources but got ${result.resources.length}`
                        );

                        const resultNames = result.resources.map(r => r.name);
                        for (const name of uniqueNames) {
                            const occurrences = resultNames.filter(n => n === name).length;
                            assert.equal(
                                occurrences,
                                1,
                                `Expected name "${name}" to appear exactly once, but appeared ${occurrences} times`
                            );
                        }

                        // Assertion 2: The resolved resource for each name corresponds to the FIRST occurrence's path
                        for (const resource of result.resources) {
                            const expectedPath = firstPaths.get(resource.name);
                            assert.equal(
                                resource.absolutePath,
                                expectedPath,
                                `Expected resource "${resource.name}" to resolve to first occurrence path`
                            );
                        }

                        // Assertion 3: The number of duplicate warnings equals total entries minus unique names
                        const duplicateWarnings = result.warnings.filter(w =>
                            w.toLowerCase().includes('duplicate')
                        );
                        assert.equal(
                            duplicateWarnings.length,
                            expectedDuplicateWarnings,
                            `Expected ${expectedDuplicateWarnings} duplicate warnings but got ${duplicateWarnings.length}`
                        );

                        // Assertion 4: Each duplicate warning mentions the duplicate name
                        for (let i = 0; i < uniqueNames.length; i++) {
                            const name = uniqueNames[i];
                            const count = counts[i];
                            if (count > 1) {
                                const nameWarnings = duplicateWarnings.filter(w => w.includes(`"${name}"`));
                                assert.equal(
                                    nameWarnings.length,
                                    count - 1,
                                    `Expected ${count - 1} warnings for duplicate name "${name}", got ${nameWarnings.length}`
                                );
                            }
                        }

                        // No errors should be present for valid manifests
                        assert.equal(result.errors.length, 0, 'Expected no errors');
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
// Property 2: Missing Path Resilience
// ---------------------------------------------------------------------

/**
 * Feature: company-resource-overlay, Property 2: Missing Path Resilience
 *
 * **Validates: Requirements 1.4, 2.8, 11.3**
 *
 * For any valid manifest containing N resource entries where K entries
 * reference paths that do not exist on disk (0 ≤ K ≤ N), the resolver
 * SHALL return exactly N−K resolved resources and exactly K warnings
 * (each identifying the entry name and unresolved path). The resolved
 * resources SHALL contain only entries whose paths exist.
 */

/** Valid resource name for Property 2 */
const validNameP2 = fc
    .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
        fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('')), { minLength: 1, maxLength: 15 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Valid resource type for Property 2 */
const validTypeP2 = fc.constantFrom('skill', 'agent', 'mcp');

/** Valid relative path for Property 2 (no traversal) */
const validRelativePathP2 = fc
    .tuple(
        fc.constantFrom('skills', 'agents', 'mcps'),
        validNameP2
    )
    .map(([dir, name]) => `${dir}/${name}.md`);

/** Generator for a valid resource entry for Property 2 */
const validResourceEntryP2 = fc
    .tuple(validNameP2, validTypeP2, validRelativePathP2)
    .map(([name, type, relPath]) => ({ name, type, path: relPath }));

describe('Feature: company-resource-overlay, Property 2: Missing Path Resilience', () => {

    /**
     * **Validates: Requirements 1.4, 2.8, 11.3**
     *
     * For any valid manifest containing N resource entries where K entries
     * reference paths that do not exist on disk (0 ≤ K ≤ N), the resolver
     * SHALL return exactly N−K resolved resources and exactly K warnings
     * (each identifying the entry name and unresolved path). The resolved
     * resources SHALL contain only entries whose paths exist.
     */
    it('discover() returns N−K resources and K warnings for K missing paths', () => {
        fc.assert(
            fc.property(
                // Generate a list of unique resource entries (1 to 10)
                fc.array(validResourceEntryP2, { minLength: 1, maxLength: 10 })
                    .chain(entries => {
                        // Deduplicate by name to avoid duplicate-name warnings interfering
                        const uniqueEntries = [];
                        const seenNames = new Set();
                        for (const entry of entries) {
                            if (!seenNames.has(entry.name)) {
                                seenNames.add(entry.name);
                                uniqueEntries.push(entry);
                            }
                        }
                        // Need at least 1 entry
                        if (uniqueEntries.length === 0) {
                            return fc.constant({
                                entries: [{ name: 'a1', type: 'skill', path: 'skills/a1.md' }],
                                missingIndices: new Set(),
                            });
                        }
                        const n = uniqueEntries.length;
                        // Generate a subset of indices that will be "missing" (not created on disk)
                        return fc.subarray(
                            Array.from({ length: n }, (_, i) => i),
                            { minLength: 0, maxLength: n }
                        ).map(missingArr => ({
                            entries: uniqueEntries,
                            missingIndices: new Set(missingArr),
                        }));
                    }),
                ({ entries, missingIndices }) => {
                    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-prop2-'));
                    try {
                        const overlayDir = path.join(tempDir, '.awos-company');
                        fs.mkdirSync(overlayDir, { recursive: true });

                        const n = entries.length;
                        const k = missingIndices.size;

                        // Create files on disk for entries NOT in missingIndices
                        for (let i = 0; i < entries.length; i++) {
                            if (!missingIndices.has(i)) {
                                const filePath = path.join(overlayDir, entries[i].path);
                                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                                fs.writeFileSync(filePath, `# ${entries[i].name}\nContent for testing.`, 'utf8');
                            }
                        }

                        // Write the manifest with all entries
                        fs.writeFileSync(
                            path.join(overlayDir, 'manifest.json'),
                            JSON.stringify({ resources: entries }, null, 2),
                            'utf8'
                        );

                        // Call discover
                        const result = discover(tempDir);

                        // No schema errors expected
                        assert.equal(result.errors.length, 0,
                            `Expected no errors but got: ${JSON.stringify(result.errors)}`);

                        // Assert exactly N−K resolved resources
                        assert.equal(
                            result.resources.length,
                            n - k,
                            `Expected ${n - k} resolved resources but got ${result.resources.length} (N=${n}, K=${k})`
                        );

                        // Assert exactly K warnings
                        assert.equal(
                            result.warnings.length,
                            k,
                            `Expected ${k} warnings but got ${result.warnings.length} (N=${n}, K=${k})`
                        );

                        // Each warning mentions the missing entry's name
                        const missingNames = entries
                            .filter((_, i) => missingIndices.has(i))
                            .map(e => e.name);

                        for (const name of missingNames) {
                            const found = result.warnings.some(w => w.includes(`"${name}"`));
                            assert.ok(found, `Expected a warning mentioning entry name "${name}"`);
                        }

                        // Each resolved resource has an absolutePath that exists on disk
                        for (const resource of result.resources) {
                            assert.ok(
                                fs.existsSync(resource.absolutePath),
                                `Resolved resource "${resource.name}" has absolutePath that does not exist: ${resource.absolutePath}`
                            );
                        }

                        // Resolved resources contain only entries whose paths exist (not in missingIndices)
                        const existingNames = new Set(
                            entries.filter((_, i) => !missingIndices.has(i)).map(e => e.name)
                        );
                        for (const resource of result.resources) {
                            assert.ok(
                                existingNames.has(resource.name),
                                `Resolved resource "${resource.name}" should only contain entries whose paths exist`
                            );
                        }
                    } finally {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
