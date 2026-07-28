'use strict';

/**
 * Fixture-based regression tests for Provider emitters.
 *
 * Parses tests/fixtures/implement.md → emits via each Provider → compares
 * against stored snapshots in tests/fixtures/expected/{provider}/.
 *
 * On first run: creates snapshot files (baseline).
 * On subsequent runs: compares current output against stored snapshots.
 *
 * **Validates: Requirements 16.4**
 *
 * @module tests/emitters.test
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseCommand } = require('../lib/parser.js');
const kiroEmitter = require('../lib/emitters/kiro.js');
const cursorEmitter = require('../lib/emitters/cursor.js');
const codexEmitter = require('../lib/emitters/codex.js');
const clineEmitter = require('../lib/emitters/cline.js');
const continueEmitter = require('../lib/emitters/continue.js');

// ---------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const EXPECTED_DIR = path.join(FIXTURES_DIR, 'expected');
const FIXTURE_FILE = path.join(FIXTURES_DIR, 'implement.md');

// ---------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------

const PROVIDERS = [
    { name: 'kiro', emitter: kiroEmitter },
    { name: 'cursor', emitter: cursorEmitter },
    { name: 'codex', emitter: codexEmitter },
    { name: 'cline', emitter: clineEmitter },
    { name: 'continue', emitter: continueEmitter },
];

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Produce a simple unified-style diff message between expected and actual.
 * @param {string} expected
 * @param {string} actual
 * @param {string} filePath
 * @returns {string}
 */
function diffMessage(expected, actual, filePath) {
    const expLines = expected.split('\n');
    const actLines = actual.split('\n');
    const lines = [`Snapshot mismatch for: ${filePath}`];
    const maxLines = Math.max(expLines.length, actLines.length);
    let diffCount = 0;

    for (let i = 0; i < maxLines; i++) {
        const exp = expLines[i];
        const act = actLines[i];
        if (exp !== act) {
            diffCount++;
            if (diffCount <= 20) {
                lines.push(`  Line ${i + 1}:`);
                if (exp !== undefined) lines.push(`    - ${exp}`);
                if (act !== undefined) lines.push(`    + ${act}`);
            }
        }
    }

    if (diffCount > 20) {
        lines.push(`  ... and ${diffCount - 20} more differences`);
    }

    lines.push('');
    lines.push(
        'To update snapshots, delete the expected/ directory and re-run.'
    );

    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------

describe('Emitter snapshot regression tests', () => {
    // Parse the fixture once for all providers
    const fixtureContent = fs.readFileSync(FIXTURE_FILE, 'utf-8');
    const { ir } = parseCommand(FIXTURE_FILE, fixtureContent);

    for (const { name, emitter } of PROVIDERS) {
        describe(`Provider: ${name}`, () => {
            const providerDir = path.join(EXPECTED_DIR, name);
            const result = emitter.emit(ir);

            it('should produce at least one output file', () => {
                assert.ok(
                    result.files.length > 0,
                    `${name} emitter produced no files`
                );
            });

            for (const file of result.files) {
                it(`snapshot: ${file.relativePath}`, () => {
                    ensureDir(providerDir);

                    // Sanitize relative path for filesystem storage
                    const snapshotName = file.relativePath.replace(
                        /\//g,
                        '__'
                    );
                    const snapshotPath = path.join(providerDir, snapshotName);

                    if (!fs.existsSync(snapshotPath)) {
                        // First run — write baseline snapshot
                        fs.writeFileSync(snapshotPath, file.content, 'utf-8');
                        // Pass on first run (baseline created)
                        return;
                    }

                    // Subsequent run — compare against stored snapshot
                    const expected = fs.readFileSync(snapshotPath, 'utf-8');

                    assert.strictEqual(
                        file.content,
                        expected,
                        diffMessage(expected, file.content, snapshotPath)
                    );
                });
            }
        });
    }
});
