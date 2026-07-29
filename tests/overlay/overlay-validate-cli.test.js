'use strict';

/**
 * Unit Tests for Validation CLI (overlay-validate.js)
 *
 * Spawns the CLI script as a child process and asserts stdout/stderr/exit code
 * for valid, invalid, and missing manifest scenarios.
 *
 * Validates: Requirements 11.4, 11.5, 11.6
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Path to the CLI script
const CLI_PATH = path.resolve(__dirname, '../../.awos-adapters/lib/cli/overlay-validate.js');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-validate-cli-'));
}

function removeTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Run the overlay-validate CLI with cwd set to the given directory.
 * Returns a promise resolving to { code, stdout, stderr }.
 */
function runCli(cwd) {
    return new Promise((resolve) => {
        execFile('node', [CLI_PATH], { cwd }, (err, stdout, stderr) => {
            resolve({
                code: err ? err.code : 0,
                stdout: stdout || '',
                stderr: stderr || '',
            });
        });
    });
}

/**
 * Write a manifest.json inside .awos-company/ in the given directory.
 */
function writeManifest(dir, manifest) {
    const companyDir = path.join(dir, '.awos-company');
    fs.mkdirSync(companyDir, { recursive: true });
    fs.writeFileSync(
        path.join(companyDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );
}

/**
 * Create a file at the given path relative to .awos-company/ in the temp dir.
 */
function createResourceFile(dir, relativePath, content) {
    const fullPath = path.join(dir, '.awos-company', relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content || '# placeholder\n');
}

// ---------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------

describe('Validation CLI', () => {
    const tempDirs = [];

    afterEach(() => {
        for (const dir of tempDirs) {
            removeTempDir(dir);
        }
        tempDirs.length = 0;
    });

    describe('valid manifest → exit 0, stdout has resource count', () => {
        it('exits with code 0 and reports resource count for a valid manifest', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            // Create a valid manifest with 3 resources
            writeManifest(tempDir, {
                resources: [
                    { name: 'my-skill', type: 'skill', path: 'skills/my-skill.md' },
                    { name: 'my-agent', type: 'agent', path: 'agents/my-agent.md' },
                    { name: 'my-mcp', type: 'mcp', path: 'mcps/my-mcp.json' },
                ],
            });

            // Create the referenced files
            createResourceFile(tempDir, 'skills/my-skill.md', '---\nname: my-skill\n---\n# Skill\n');
            createResourceFile(tempDir, 'agents/my-agent.md', '---\nname: my-agent\n---\n# Agent\n');
            createResourceFile(tempDir, 'mcps/my-mcp.json', '{"my-mcp": {"command": "npx"}}');

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 0, `Expected exit code 0, got ${code}. stderr: ${stderr}`);
            assert.match(stdout, /3 resources validated successfully/);
            assert.strictEqual(stderr, '');
        });

        it('exits with code 0 for a valid manifest with 0 resources', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            writeManifest(tempDir, { resources: [] });

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 0, `Expected exit code 0, got ${code}. stderr: ${stderr}`);
            assert.match(stdout, /0 resources validated successfully/);
            assert.strictEqual(stderr, '');
        });
    });

    describe('invalid manifest (schema errors) → exit 1, stderr has schema errors', () => {
        it('exits with code 1 and reports schema errors for missing required fields', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            // Manifest with entries missing required fields
            writeManifest(tempDir, {
                resources: [
                    { name: 'valid-name', type: 'skill' },          // missing path
                    { type: 'agent', path: 'agents/x.md' },          // missing name
                    { name: 'bad-type', type: 'invalid', path: 'x' }, // invalid type
                ],
            });

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 1, `Expected exit code 1, got ${code}`);
            assert.match(stderr, /Schema error at/);
            assert.strictEqual(stdout, '');
        });

        it('exits with code 1 for a manifest where resources is not an array', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            writeManifest(tempDir, { resources: 'not-an-array' });

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 1, `Expected exit code 1, got ${code}`);
            assert.match(stderr, /Schema error at/);
            assert.strictEqual(stdout, '');
        });

        it('exits with code 1 for manifest with path traversal', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            writeManifest(tempDir, {
                resources: [
                    { name: 'bad-path', type: 'skill', path: '../etc/passwd' },
                ],
            });

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 1, `Expected exit code 1, got ${code}`);
            assert.match(stderr, /Schema error at/);
            assert.strictEqual(stdout, '');
        });
    });

    describe('missing manifest → exit 1, stderr has appropriate error', () => {
        it('exits with code 1 when .awos-company/ directory does not exist', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            // Don't create .awos-company/ at all
            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 1, `Expected exit code 1, got ${code}`);
            assert.match(stderr, /Schema error at/);
            assert.match(stderr, /[Mm]anifest/i);
            assert.strictEqual(stdout, '');
        });

        it('exits with code 1 when .awos-company/ exists but manifest.json is missing', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            // Create .awos-company/ but without manifest.json
            fs.mkdirSync(path.join(tempDir, '.awos-company'), { recursive: true });

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 1, `Expected exit code 1, got ${code}`);
            assert.match(stderr, /Schema error at/);
            assert.match(stderr, /[Mm]anifest/i);
            assert.strictEqual(stdout, '');
        });
    });

    describe('missing file paths → exit 1, stderr contains path errors', () => {
        it('exits with code 1 and reports missing paths when files do not exist', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            // Valid schema but referenced paths don't exist on disk
            writeManifest(tempDir, {
                resources: [
                    { name: 'ghost-skill', type: 'skill', path: 'skills/nonexistent.md' },
                    { name: 'ghost-mcp', type: 'mcp', path: 'mcps/missing.json' },
                ],
            });

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 1, `Expected exit code 1, got ${code}`);
            assert.match(stderr, /Missing path:/);
            assert.match(stderr, /ghost-skill/);
            assert.match(stderr, /ghost-mcp/);
            assert.strictEqual(stdout, '');
        });

        it('exits with code 1 when some paths exist and some do not', async () => {
            const tempDir = createTempDir();
            tempDirs.push(tempDir);

            writeManifest(tempDir, {
                resources: [
                    { name: 'real-skill', type: 'skill', path: 'skills/real.md' },
                    { name: 'missing-agent', type: 'agent', path: 'agents/nope.md' },
                ],
            });

            // Only create the first file
            createResourceFile(tempDir, 'skills/real.md', '# Skill\n');

            const { code, stdout, stderr } = await runCli(tempDir);

            assert.strictEqual(code, 1, `Expected exit code 1, got ${code}`);
            assert.match(stderr, /Missing path:/);
            assert.match(stderr, /missing-agent/);
            assert.strictEqual(stdout, '');
        });
    });
});
