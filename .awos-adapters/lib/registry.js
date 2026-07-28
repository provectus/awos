'use strict';

/**
 * Provider Registry module for the multi-IDE adapter layer.
 *
 * Manages provider detection and configuration loading. Reads
 * providers.json for explicit configuration or falls back to sensible
 * defaults (Kiro + Cursor enabled). Detects active providers by
 * checking for IDE-specific marker files/directories in the project root.
 *
 * @module lib/registry
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------
// Default Provider Configuration
// ---------------------------------------------------------------------

/**
 * Default provider configuration used when providers.json is missing.
 * Kiro and Cursor are enabled by default; others are disabled.
 *
 * @type {ProviderConfig[]}
 */
const DEFAULT_PROVIDERS = Object.freeze([
    {
        name: 'kiro',
        enabled: true,
        markers: ['.kiro/'],
        emitter: './lib/emitters/kiro.js',
    },
    {
        name: 'cursor',
        enabled: true,
        markers: ['.cursor/'],
        emitter: './lib/emitters/cursor.js',
    },
    {
        name: 'codex',
        enabled: false,
        markers: ['codex.json', '.codex/'],
        emitter: './lib/emitters/codex.js',
    },
    {
        name: 'cline',
        enabled: false,
        markers: ['.clinerules', '.cline/'],
        emitter: './lib/emitters/cline.js',
    },
    {
        name: 'continue',
        enabled: false,
        markers: ['.continue/'],
        emitter: './lib/emitters/continue.js',
    },
]);

// ---------------------------------------------------------------------
// Configuration Loading
// ---------------------------------------------------------------------

/**
 * Load provider configuration from a providers.json file.
 *
 * Falls back to DEFAULT_PROVIDERS when the file does not exist.
 * Throws on malformed JSON or invalid provider entries.
 *
 * @param {string} configPath - Absolute path to providers.json
 * @returns {ProviderConfig[]} Array of provider configurations
 */
function loadProviders(configPath) {
    if (typeof configPath !== 'string' || configPath.length === 0) {
        throw new Error('loadProviders: configPath must be a non-empty string');
    }

    if (!fs.existsSync(configPath)) {
        return [...DEFAULT_PROVIDERS];
    }

    let raw;
    try {
        raw = fs.readFileSync(configPath, 'utf8');
    } catch (err) {
        throw new Error(
            `loadProviders: unable to read ${configPath} — ${err.message}`
        );
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(
            `loadProviders: invalid JSON in ${configPath} — ${err.message}`
        );
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.providers)) {
        throw new Error(
            'loadProviders: providers.json must contain a "providers" array'
        );
    }

    const providers = parsed.providers.map((entry, i) => {
        validateProviderEntry(entry, i);
        return {
            name: entry.name,
            enabled: entry.enabled,
            markers: [...entry.markers],
            emitter: entry.emitter,
        };
    });

    return providers;
}

// ---------------------------------------------------------------------
// Provider Detection
// ---------------------------------------------------------------------

/**
 * @typedef {Object} DetectedProvider
 * @property {string} name - Provider identifier (kebab-case)
 * @property {string[]} foundMarkers - Which markers were found
 */

/**
 * Detect which providers are active based on IDE-specific marker
 * files/directories present in the project root.
 *
 * Checks all known providers (from DEFAULT_PROVIDERS) regardless of
 * whether they are enabled in providers.json — detection reports what
 * is present on disk, not what is configured for generation.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {DetectedProvider[]} Array of detected providers with their markers
 */
function detectProviders(projectRoot) {
    if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
        throw new Error(
            'detectProviders: projectRoot must be a non-empty string'
        );
    }

    const detected = [];

    for (const provider of DEFAULT_PROVIDERS) {
        const foundMarkers = [];

        for (const marker of provider.markers) {
            const markerPath = path.join(projectRoot, marker);
            if (markerExists(markerPath, marker)) {
                foundMarkers.push(marker);
            }
        }

        if (foundMarkers.length > 0) {
            detected.push({
                name: provider.name,
                foundMarkers,
            });
        }
    }

    return detected;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Check whether a marker exists on disk. Directories end with '/',
 * files do not.
 *
 * @param {string} markerPath - Full path to the marker
 * @param {string} marker - Original marker string (to check trailing /)
 * @returns {boolean}
 */
function markerExists(markerPath, marker) {
    const isDirectory = marker.endsWith('/');

    try {
        const stat = fs.statSync(markerPath.replace(/\/$/, ''));
        return isDirectory ? stat.isDirectory() : stat.isFile();
    } catch {
        return false;
    }
}

/**
 * Validate a single provider entry from providers.json.
 *
 * @param {unknown} entry - The provider entry to validate
 * @param {number} index - Array index for error messages
 * @throws {Error} On invalid entry structure
 */
function validateProviderEntry(entry, index) {
    const prefix = `loadProviders: providers[${index}]`;

    if (!entry || typeof entry !== 'object') {
        throw new Error(`${prefix} must be an object`);
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
        throw new Error(`${prefix}.name must be a non-empty string`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(entry.name)) {
        throw new Error(`${prefix}.name must be kebab-case (got "${entry.name}")`);
    }
    if (typeof entry.enabled !== 'boolean') {
        throw new Error(`${prefix}.enabled must be a boolean`);
    }
    if (!Array.isArray(entry.markers) || entry.markers.length === 0) {
        throw new Error(`${prefix}.markers must be a non-empty array`);
    }
    for (let j = 0; j < entry.markers.length; j++) {
        if (typeof entry.markers[j] !== 'string' || entry.markers[j].length === 0) {
            throw new Error(`${prefix}.markers[${j}] must be a non-empty string`);
        }
    }
    if (typeof entry.emitter !== 'string' || entry.emitter.length === 0) {
        throw new Error(`${prefix}.emitter must be a non-empty string`);
    }
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = {
    DEFAULT_PROVIDERS,
    loadProviders,
    detectProviders,
};
