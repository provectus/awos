'use strict';

/**
 * Unit Tests for discover() and validate() functions of the Resource Resolver.
 *
 * Uses the Node.js built-in test runner (node --test) and node:assert/strict.
 * References test fixtures at tests/overlay/fixtures/.
 *
 * Validates: Requirements 1.2, 1.4, 2.1, 2.2, 2.5, 2.6, 2.7, 2.8, 11.1, 11.2, 11.3
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { discover, validate } = require('../../.awos-adapters/lib/resource-resolver');

// ---------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const VALID_FIXTURE = path.resolve(FIXTURES_DIR, 'overlay-valid');
const INVALID_FIXTURE = path.resolve(FIXTURES_DIR, 'overlay-invalid');
const MIXED_FIXTURE = path.resolve(FIXTURES_DIR, 'overlay-mixed');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-resolver-test-'));
}

function removeTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeManifest(dir, content) {
    const companyDir = path.join(dir, '.awos-company');
    fs.mkdirSync(companyDir, { recursive: true });
    fs.writeFileSync(path.join(companyDir, 'manifest.json'), content);
}

function createResourceFile(dir, relativePath, content) {
    const fullPath = path.join(dir, '.awos-company', relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content || '# placeholder\n');
}

// ---------------------------------------------------------------------
// discover() tests
// ---------------------------------------------------------------------

describe('discover()', () => {
    const tempDirs = [];

    afterEach(() => {
        for (const dir of tempDirs) {
            removeTempDir(dir);
        }
        tempDirs.length = 0;
    });

    it('returns empty result when .awos-company/ directory does not exist', () => {
        const tempDir = createTempDir();
        tempDirs.push(tempDir);

        const result = discover(tempDir);

        assert.deepStrictEqual(result.resources, []);
        assert.deepStrictEqual(result.warnings, []);
        assert.deepStrictEqual(result.errors, []);
    });

    it('returns empty result when manifest.json is missing within .awos-company/', () => {
        const tempDir = createTempDir();
        tempDirs.push(tempDir);

        // Create .awos-company/ directory but no manifest.json
        fs.mkdirSync(path.join(tempDir, '.awos-company'), { recursive: true });

        const result = discover(tempDir);

        assert.deepStrictEqual(result.resources, []);
        assert.deepStrictEqual(result.warnings, []);
        assert.deepStrictEqual(result.errors, []);
    });

    it('returns errors when manifest.json contains invalid JSON', () => {
        const tempDir = createTempDir();
        tempDirs.push(tempDir);

        writeManifest(tempDir, '{ this is not valid JSON }');

        const result = discover(tempDir);

        assert.deepStrictEqual(result.resources, []);
        assert.deepStrictEqual(result.warnings, []);
        assert.ok(result.errors.length > 0, 'Expected at least one error');
        assert.ok(
            result.errors[0].includes('parse') || result.errors[0].includes('JSON'),
            `Expected parse error message, got: ${result.errors[0]}`
        );
    });

    it('returns 3 resolved resources with no warnings or errors for valid fixture', () => {
        const result = discover(VALID_FIXTURE);

        assert.strictEqual(result.resources.length, 3);
        assert.deepStrictEqual(result.warnings, []);
        assert.deepStrictEqual(result.errors, []);

        // Check each resource is properly resolved
        const names = result.resources.map(r => r.name);
        assert.ok(names.includes('winged-commerce-api'));
        assert.ok(names.includes('winged-backend-agent'));
        assert.ok(names.includes('winged-analytics-mcp'));

        // Check source is 'company'
        for (const resource of result.resources) {
            assert.strictEqual(resource.source, 'company');
            assert.ok(path.isAbsolute(resource.absolutePath));
        }
    });

    it('returns schema errors for invalid fixture', () => {
        const result = discover(INVALID_FIXTURE);

        assert.deepStrictEqual(result.resources, []);
        assert.deepStrictEqual(result.warnings, []);
        assert.ok(result.errors.length > 0, 'Expected schema errors');

        // The invalid fixture has entries with: missing name, invalid type, path traversal, invalid name pattern
        const allErrors = result.errors.join('\n');
        assert.ok(allErrors.includes('Schema error'), 'Expected schema error messages');
    });

    it('returns some resources and warnings for mixed fixture', () => {
        const result = discover(MIXED_FIXTURE);

        // "valid-skill" is the only one that should resolve (file exists on disk)
        assert.strictEqual(result.resources.length, 1);
        assert.strictEqual(result.resources[0].name, 'valid-skill');
        assert.strictEqual(result.resources[0].type, 'skill');
        assert.strictEqual(result.resources[0].source, 'company');

        // Should have warnings for missing paths and duplicate name
        assert.ok(result.warnings.length > 0, 'Expected warnings');
        assert.deepStrictEqual(result.errors, []);
    });

    it('returns empty resources with no warnings or errors for empty manifest', () => {
        const tempDir = createTempDir();
        tempDirs.push(tempDir);

        writeManifest(tempDir, JSON.stringify({ resources: [] }));

        const result = discover(tempDir);

        assert.deepStrictEqual(result.resources, []);
        assert.deepStrictEqual(result.warnings, []);
        assert.deepStrictEqual(result.errors, []);
    });

    it('keeps first occurrence and warns about duplicates', () => {
        const result = discover(MIXED_FIXTURE);

        // The mixed fixture has two entries named "duplicate-name"
        // First occurrence should be processed (but its file is missing, so it gets a path warning)
        // Second occurrence should be detected as duplicate
        const duplicateWarning = result.warnings.find(w =>
            w.includes('Duplicate') && w.includes('duplicate-name')
        );
        assert.ok(duplicateWarning, 'Expected a duplicate name warning');

        // Only one resource named "duplicate-name" should be attempted
        // (it won't resolve since its file doesn't exist, but should not appear twice)
        const duplicateResources = result.resources.filter(r => r.name === 'duplicate-name');
        assert.strictEqual(duplicateResources.length, 0, 'Duplicate should not resolve (file missing)');
    });

    it('skips entries with missing file paths and emits warnings', () => {
        const result = discover(MIXED_FIXTURE);

        // "missing-path-skill" and "another-missing" reference non-existent files
        const missingPathWarnings = result.warnings.filter(w =>
            w.includes('missing path') || w.includes('Missing')
        );
        assert.ok(
            missingPathWarnings.length >= 2,
            `Expected at least 2 missing path warnings, got ${missingPathWarnings.length}: ${JSON.stringify(result.warnings)}`
        );
    });
});

// ---------------------------------------------------------------------
// validate() tests
// ---------------------------------------------------------------------

describe('validate()', () => {
    const tempDirs = [];

    afterEach(() => {
        for (const dir of tempDirs) {
            removeTempDir(dir);
        }
        tempDirs.length = 0;
    });

    it('returns valid=true with resourceCount=3 for valid fixture', () => {
        const result = validate(VALID_FIXTURE);

        assert.strictEqual(result.valid, true);
        assert.deepStrictEqual(result.schemaErrors, []);
        assert.deepStrictEqual(result.pathErrors, []);
        assert.strictEqual(result.resourceCount, 3);
    });

    it('returns valid=false with schemaErrors populated for invalid fixture', () => {
        const result = validate(INVALID_FIXTURE);

        assert.strictEqual(result.valid, false);
        assert.ok(result.schemaErrors.length > 0, 'Expected schema errors');

        // Each schema error should have path and message
        for (const err of result.schemaErrors) {
            assert.ok(err.path, 'Schema error should have a path');
            assert.ok(err.message, 'Schema error should have a message');
        }
    });

    it('returns valid=false with schemaErrors mentioning missing manifest', () => {
        const tempDir = createTempDir();
        tempDirs.push(tempDir);

        // No .awos-company/ directory at all
        const result = validate(tempDir);

        assert.strictEqual(result.valid, false);
        assert.ok(result.schemaErrors.length > 0, 'Expected schema errors');

        const allMessages = result.schemaErrors.map(e => e.message).join('\n');
        assert.ok(
            allMessages.toLowerCase().includes('manifest') || allMessages.toLowerCase().includes('not found'),
            `Expected manifest-related error message, got: ${allMessages}`
        );
    });

    it('returns valid=false with pathErrors for entries with missing file paths', () => {
        const tempDir = createTempDir();
        tempDirs.push(tempDir);

        writeManifest(tempDir, JSON.stringify({
            resources: [
                { name: 'existing-skill', type: 'skill', path: 'skills/exists.md' },
                { name: 'ghost-skill', type: 'skill', path: 'skills/ghost.md' },
                { name: 'ghost-mcp', type: 'mcp', path: 'mcps/ghost.json' },
            ],
        }));

        // Only create the first resource file
        createResourceFile(tempDir, 'skills/exists.md', '# Exists\n');

        const result = validate(tempDir);

        assert.strictEqual(result.valid, false);
        assert.deepStrictEqual(result.schemaErrors, []);
        assert.strictEqual(result.pathErrors.length, 2);

        // pathErrors should contain name and path info
        const ghostSkill = result.pathErrors.find(e => e.name === 'ghost-skill');
        assert.ok(ghostSkill, 'Expected pathError for ghost-skill');
        assert.strictEqual(ghostSkill.path, 'skills/ghost.md');

        const ghostMcp = result.pathErrors.find(e => e.name === 'ghost-mcp');
        assert.ok(ghostMcp, 'Expected pathError for ghost-mcp');
        assert.strictEqual(ghostMcp.path, 'mcps/ghost.json');

        // resourceCount should reflect only the valid (existing) resource
        assert.strictEqual(result.resourceCount, 1);
    });

    it('returns valid=false for mixed fixture due to missing paths', () => {
        const result = validate(MIXED_FIXTURE);

        assert.strictEqual(result.valid, false);
        assert.deepStrictEqual(result.schemaErrors, []);
        assert.ok(result.pathErrors.length > 0, 'Expected path errors');

        // Should have pathErrors for entries with missing files
        const pathErrorNames = result.pathErrors.map(e => e.name);
        assert.ok(pathErrorNames.includes('missing-path-skill'));
        assert.ok(pathErrorNames.includes('another-missing'));

        // resourceCount should count only valid entries (valid-skill + duplicate-name first occurrence if it existed on disk)
        // Only "valid-skill" has a file that exists
        assert.strictEqual(result.resourceCount, 1);
    });
});
