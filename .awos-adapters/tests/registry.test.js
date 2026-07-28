'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    DEFAULT_PROVIDERS,
    loadProviders,
    detectProviders,
} = require('../lib/registry.js');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function createTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
}

function removeTmpDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------
// DEFAULT_PROVIDERS
// ---------------------------------------------------------------------

describe('DEFAULT_PROVIDERS', () => {
    it('contains exactly 5 providers', () => {
        assert.equal(DEFAULT_PROVIDERS.length, 5);
    });

    it('has kiro and cursor enabled by default', () => {
        const kiro = DEFAULT_PROVIDERS.find((p) => p.name === 'kiro');
        const cursor = DEFAULT_PROVIDERS.find((p) => p.name === 'cursor');
        assert.equal(kiro.enabled, true);
        assert.equal(cursor.enabled, true);
    });

    it('has codex, cline, and continue disabled by default', () => {
        const codex = DEFAULT_PROVIDERS.find((p) => p.name === 'codex');
        const cline = DEFAULT_PROVIDERS.find((p) => p.name === 'cline');
        const cont = DEFAULT_PROVIDERS.find((p) => p.name === 'continue');
        assert.equal(codex.enabled, false);
        assert.equal(cline.enabled, false);
        assert.equal(cont.enabled, false);
    });

    it('is frozen (immutable)', () => {
        assert.throws(() => {
            DEFAULT_PROVIDERS.push({ name: 'test' });
        });
    });

    it('each provider has required fields', () => {
        for (const p of DEFAULT_PROVIDERS) {
            assert.equal(typeof p.name, 'string');
            assert.equal(typeof p.enabled, 'boolean');
            assert.ok(Array.isArray(p.markers));
            assert.ok(p.markers.length > 0);
            assert.equal(typeof p.emitter, 'string');
        }
    });
});

// ---------------------------------------------------------------------
// loadProviders
// ---------------------------------------------------------------------

describe('loadProviders', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });

    afterEach(() => {
        removeTmpDir(tmpDir);
    });

    it('throws on empty configPath', () => {
        assert.throws(
            () => loadProviders(''),
            /configPath must be a non-empty string/
        );
    });

    it('returns DEFAULT_PROVIDERS when file does not exist', () => {
        const result = loadProviders(path.join(tmpDir, 'missing.json'));
        assert.deepEqual(result, [...DEFAULT_PROVIDERS]);
    });

    it('returned defaults are a copy (not the frozen original)', () => {
        const result = loadProviders(path.join(tmpDir, 'missing.json'));
        // Should not throw when mutating
        result.push({ name: 'test', enabled: true, markers: ['x'], emitter: 'y' });
        assert.equal(result.length, 6);
    });

    it('parses valid providers.json', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        const config = {
            providers: [
                {
                    name: 'kiro',
                    enabled: true,
                    markers: ['.kiro/'],
                    emitter: './lib/emitters/kiro.js',
                },
            ],
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        const result = loadProviders(configPath);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'kiro');
        assert.equal(result[0].enabled, true);
        assert.deepEqual(result[0].markers, ['.kiro/']);
        assert.equal(result[0].emitter, './lib/emitters/kiro.js');
    });

    it('throws on invalid JSON', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        fs.writeFileSync(configPath, '{ invalid json }');

        assert.throws(() => loadProviders(configPath), /invalid JSON/);
    });

    it('throws when providers key is missing', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        fs.writeFileSync(configPath, JSON.stringify({ other: [] }));

        assert.throws(
            () => loadProviders(configPath),
            /must contain a "providers" array/
        );
    });

    it('throws when providers is not an array', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        fs.writeFileSync(configPath, JSON.stringify({ providers: 'not-array' }));

        assert.throws(
            () => loadProviders(configPath),
            /must contain a "providers" array/
        );
    });

    it('throws on invalid provider entry (missing name)', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        const config = {
            providers: [{ enabled: true, markers: ['.foo/'], emitter: './foo.js' }],
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        assert.throws(() => loadProviders(configPath), /name must be a non-empty/);
    });

    it('throws on non-kebab-case provider name', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        const config = {
            providers: [
                {
                    name: 'NotKebab',
                    enabled: true,
                    markers: ['.foo/'],
                    emitter: './foo.js',
                },
            ],
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        assert.throws(() => loadProviders(configPath), /must be kebab-case/);
    });

    it('throws on missing enabled field', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        const config = {
            providers: [
                { name: 'test', markers: ['.test/'], emitter: './test.js' },
            ],
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        assert.throws(() => loadProviders(configPath), /enabled must be a boolean/);
    });

    it('throws on empty markers array', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        const config = {
            providers: [
                { name: 'test', enabled: true, markers: [], emitter: './test.js' },
            ],
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        assert.throws(
            () => loadProviders(configPath),
            /markers must be a non-empty array/
        );
    });

    it('throws on missing emitter field', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        const config = {
            providers: [
                { name: 'test', enabled: true, markers: ['.test/'] },
            ],
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        assert.throws(
            () => loadProviders(configPath),
            /emitter must be a non-empty string/
        );
    });

    it('handles multiple providers correctly', () => {
        const configPath = path.join(tmpDir, 'providers.json');
        const config = {
            providers: [
                {
                    name: 'kiro',
                    enabled: true,
                    markers: ['.kiro/'],
                    emitter: './lib/emitters/kiro.js',
                },
                {
                    name: 'cursor',
                    enabled: false,
                    markers: ['.cursor/'],
                    emitter: './lib/emitters/cursor.js',
                },
            ],
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        const result = loadProviders(configPath);
        assert.equal(result.length, 2);
        assert.equal(result[0].name, 'kiro');
        assert.equal(result[1].name, 'cursor');
        assert.equal(result[1].enabled, false);
    });
});

// ---------------------------------------------------------------------
// detectProviders
// ---------------------------------------------------------------------

describe('detectProviders', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });

    afterEach(() => {
        removeTmpDir(tmpDir);
    });

    it('throws on empty projectRoot', () => {
        assert.throws(
            () => detectProviders(''),
            /projectRoot must be a non-empty string/
        );
    });

    it('returns empty array when no markers are present', () => {
        const result = detectProviders(tmpDir);
        assert.deepEqual(result, []);
    });

    it('detects kiro when .kiro/ directory exists', () => {
        fs.mkdirSync(path.join(tmpDir, '.kiro'));

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'kiro');
        assert.deepEqual(result[0].foundMarkers, ['.kiro/']);
    });

    it('detects cursor when .cursor/ directory exists', () => {
        fs.mkdirSync(path.join(tmpDir, '.cursor'));

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'cursor');
        assert.deepEqual(result[0].foundMarkers, ['.cursor/']);
    });

    it('detects cline when .clinerules file exists', () => {
        fs.writeFileSync(path.join(tmpDir, '.clinerules'), '');

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'cline');
        assert.deepEqual(result[0].foundMarkers, ['.clinerules']);
    });

    it('detects cline when .cline/ directory exists', () => {
        fs.mkdirSync(path.join(tmpDir, '.cline'));

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'cline');
        assert.deepEqual(result[0].foundMarkers, ['.cline/']);
    });

    it('detects cline with both markers present', () => {
        fs.writeFileSync(path.join(tmpDir, '.clinerules'), '');
        fs.mkdirSync(path.join(tmpDir, '.cline'));

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'cline');
        assert.deepEqual(result[0].foundMarkers, ['.clinerules', '.cline/']);
    });

    it('detects continue when .continue/ directory exists', () => {
        fs.mkdirSync(path.join(tmpDir, '.continue'));

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'continue');
        assert.deepEqual(result[0].foundMarkers, ['.continue/']);
    });

    it('detects codex when codex.json file exists', () => {
        fs.writeFileSync(path.join(tmpDir, 'codex.json'), '{}');

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'codex');
        assert.deepEqual(result[0].foundMarkers, ['codex.json']);
    });

    it('detects codex when .codex/ directory exists', () => {
        fs.mkdirSync(path.join(tmpDir, '.codex'));

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'codex');
        assert.deepEqual(result[0].foundMarkers, ['.codex/']);
    });

    it('detects multiple providers simultaneously (Req 13.2)', () => {
        fs.mkdirSync(path.join(tmpDir, '.kiro'));
        fs.mkdirSync(path.join(tmpDir, '.cursor'));
        fs.writeFileSync(path.join(tmpDir, '.clinerules'), '');

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 3);

        const names = result.map((p) => p.name);
        assert.ok(names.includes('kiro'));
        assert.ok(names.includes('cursor'));
        assert.ok(names.includes('cline'));
    });

    it('detects all providers when all markers present', () => {
        fs.mkdirSync(path.join(tmpDir, '.kiro'));
        fs.mkdirSync(path.join(tmpDir, '.cursor'));
        fs.writeFileSync(path.join(tmpDir, 'codex.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, '.clinerules'), '');
        fs.mkdirSync(path.join(tmpDir, '.continue'));

        const result = detectProviders(tmpDir);
        assert.equal(result.length, 5);
    });

    it('does not false-positive on a file named like a directory marker', () => {
        // .kiro/ marker expects a directory, not a file
        fs.writeFileSync(path.join(tmpDir, '.kiro'), 'not a directory');

        const result = detectProviders(tmpDir);
        const kiro = result.find((p) => p.name === 'kiro');
        assert.equal(kiro, undefined);
    });

    it('does not false-positive on a directory named like a file marker', () => {
        // codex.json marker expects a file, not a directory
        fs.mkdirSync(path.join(tmpDir, 'codex.json'));

        const result = detectProviders(tmpDir);
        const codex = result.find((p) => p.name === 'codex');
        assert.equal(codex, undefined);
    });
});
