'use strict';

/**
 * Property-Based Tests for Provider Detection (Property 10).
 *
 * Validates that for any project directory containing a combination
 * of IDE marker files/directories, the Provider detector reports
 * exactly the set of Providers whose markers are present — no false
 * positives and no false negatives.
 *
 * **Validates: Requirements 13.1**
 *
 * @module tests/properties/detection-properties.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { forAll } = require('../lib/pbt.js');
const { genMarkerCombination } = require('../generators/filesystem-gen.js');
const { detectProviders } = require('../../lib/registry.js');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Create a temporary directory with the specified markers.
 * Markers ending with '/' become directories; others become files.
 *
 * @param {string[]} markers - Marker paths to create
 * @returns {string} Path to the temporary directory
 */
function createTempWithMarkers(markers) {
    const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pbt-detect-')
    );

    for (const marker of markers) {
        const fullPath = path.join(tmpDir, marker);
        if (marker.endsWith('/')) {
            fs.mkdirSync(fullPath.replace(/\/$/, ''), { recursive: true });
        } else {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, '');
        }
    }

    return tmpDir;
}

/**
 * Remove a temporary directory recursively.
 * @param {string} dirPath
 */
function removeTempDir(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
}

// ---------------------------------------------------------------------
// Property 10: Provider detection accuracy
// ---------------------------------------------------------------------

describe('Property 10: Provider detection accuracy', () => {
    // Feature: multi-ide-adapter-layer, Property 10
    it('detectProviders reports exactly the providers whose markers exist', () => {
        forAll(
            'detection accuracy',
            genMarkerCombination,
            (input) => {
                const tmpDir = createTempWithMarkers(input.markers);
                try {
                    const detected = detectProviders(tmpDir);
                    const detectedNames = detected
                        .map((d) => d.name)
                        .sort();

                    // No false positives: every detected provider has markers
                    for (const name of detectedNames) {
                        if (!input.expectedProviders.includes(name)) {
                            return false;
                        }
                    }

                    // No false negatives: every expected provider is detected
                    for (const name of input.expectedProviders) {
                        if (!detectedNames.includes(name)) {
                            return false;
                        }
                    }

                    // Exact match
                    if (detectedNames.length !== input.expectedProviders.length) {
                        return false;
                    }

                    return true;
                } finally {
                    removeTempDir(tmpDir);
                }
            },
            { iterations: 50 }
        );
    });

    it('detectProviders returns empty array for directories with no markers', () => {
        forAll(
            'empty detection',
            () => ({ markers: [], expectedProviders: [] }),
            (input) => {
                const tmpDir = createTempWithMarkers(input.markers);
                try {
                    const detected = detectProviders(tmpDir);
                    return detected.length === 0;
                } finally {
                    removeTempDir(tmpDir);
                }
            },
            { iterations: 20 }
        );
    });

    it('foundMarkers includes only markers that are actually present', () => {
        forAll(
            'marker accuracy',
            genMarkerCombination,
            (input) => {
                const tmpDir = createTempWithMarkers(input.markers);
                try {
                    const detected = detectProviders(tmpDir);

                    for (const provider of detected) {
                        for (const foundMarker of provider.foundMarkers) {
                            if (!input.markers.includes(foundMarker)) {
                                return false;
                            }
                        }
                    }

                    return true;
                } finally {
                    removeTempDir(tmpDir);
                }
            },
            { iterations: 50 }
        );
    });
});
