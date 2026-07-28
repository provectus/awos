'use strict';

/**
 * Filesystem/marker generators for property-based tests.
 * Produces random subsets of IDE marker directories for
 * provider detection testing.
 *
 * @module tests/generators/filesystem-gen
 */

/**
 * All IDE markers with their associated provider names.
 * @type {ReadonlyArray<{provider: string, marker: string}>}
 */
const ALL_MARKERS = Object.freeze([
    { provider: 'kiro', marker: '.kiro/' },
    { provider: 'cursor', marker: '.cursor/' },
    { provider: 'cline', marker: '.clinerules' },
    { provider: 'cline', marker: '.cline/' },
    { provider: 'continue', marker: '.continue/' },
    { provider: 'codex', marker: 'codex.json' },
    { provider: 'codex', marker: '.codex/' },
]);

/**
 * Generate a random subset of IDE marker directories/files.
 * Returns an object containing the selected markers and the
 * expected set of providers that should be detected.
 *
 * @param {object} rng - Random number generator from PBT harness
 * @returns {{markers: string[], expectedProviders: string[]}}
 */
function genMarkerCombination(rng) {
    const markers = [];
    const providerSet = new Set();

    // Each marker has an independent chance of being included
    for (const entry of ALL_MARKERS) {
        if (rng.int(0, 2) === 1) {
            markers.push(entry.marker);
            providerSet.add(entry.provider);
        }
    }

    return {
        markers,
        expectedProviders: [...providerSet].sort(),
    };
}

module.exports = {
    genMarkerCombination,
    ALL_MARKERS,
};
