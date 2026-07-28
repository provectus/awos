'use strict';

const { randomInt } = require('node:crypto');

/**
 * Create a seeded pseudo-random generator using a simple LCG.
 * @param {number} seed
 * @returns {{int: (min: number, max: number) => number, pick: (arr: any[]) => any}}
 */
function createRandom(seed) {
    let state = seed >>> 0 || 1;
    function next() {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state;
    }
    return {
        int(min, max) {
            return min + (next() % (max - min));
        },
        pick(arr) {
            return arr[next() % arr.length];
        },
    };
}

/**
 * Attempt basic shrinking on a failing input.
 * Tries smaller variants; returns the smallest still-failing input.
 * @param {*} input
 * @param {function} property
 * @returns {*}
 */
function shrink(input, property) {
    let smallest = input;
    const candidates = [];
    if (typeof input === 'string') {
        for (let i = 1; i <= Math.min(input.length, 8); i++) {
            candidates.push(input.slice(0, -i));
        }
    } else if (typeof input === 'number') {
        candidates.push(0, Math.floor(input / 2), input - 1);
    } else if (Array.isArray(input)) {
        for (let i = 1; i <= Math.min(input.length, 8); i++) {
            candidates.push(input.slice(0, -i));
        }
    } else if (typeof input === 'object' && input !== null) {
        return smallest;
    }
    for (const candidate of candidates) {
        try {
            if (!property(candidate)) {
                smallest = candidate;
            }
        } catch (_) {
            smallest = candidate;
        }
    }
    return smallest;
}

/**
 * Property-based test runner. Throws on failure for node:test compat.
 * @param {string} name - Property description
 * @param {function} generator - (rng) => random test input
 * @param {function} property - (input) => boolean
 * @param {{iterations?: number, seed?: number}} options
 */
function forAll(name, generator, property, options = {}) {
    const iterations = options.iterations ?? 100;
    const seed = options.seed ?? randomInt(0, 2 ** 32 - 1);
    const rng = createRandom(seed);

    for (let i = 0; i < iterations; i++) {
        const input = generator(rng);
        let holds = false;
        try {
            holds = property(input);
        } catch (err) {
            const shrunk = shrink(input, property);
            throw new Error(
                `Property "${name}" threw at iteration ${i + 1}` +
                ` (seed: ${seed}):\n  Input: ${JSON.stringify(shrunk)}` +
                `\n  Error: ${err.message}`
            );
        }
        if (!holds) {
            const shrunk = shrink(input, property);
            throw new Error(
                `Property "${name}" failed at iteration ${i + 1}` +
                ` (seed: ${seed}):\n  Input: ${JSON.stringify(shrunk)}`
            );
        }
    }
}

module.exports = { forAll, createRandom };
