'use strict';

/**
 * Property-Based Tests for Resource Resolver — Merge Prefers Overlay
 *
 * Feature: company-resource-overlay, Property 5: Merge Prefers Overlay
 *
 * Validates: Requirements 3.3, 9.3
 *
 * For any upstream resource list U and overlay resource list O,
 * `mergeResults(U, O)` SHALL return a list where:
 * (a) every resource from O is included
 * (b) every resource from U whose (name, type) pair does NOT appear in O is included
 * (c) no resource from U whose (name, type) pair appears in O is included
 * The resulting list has length |O| + |U \ duplicates|.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const { mergeResults } = require('../../.awos-adapters/lib/resource-resolver');

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

const FIRST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const REST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_-';

/** Valid resource name: starts with [a-z0-9], rest [a-z0-9_-], 2–15 chars */
const validNameGen = fc
    .tuple(
        fc.constantFrom(...FIRST_CHARS.split('')),
        fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 1, maxLength: 14 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Valid resource type */
const validTypeGen = fc.constantFrom('skill', 'agent', 'mcp');

/**
 * Generator for a ResolvedResource with source 'registry' (upstream).
 */
const upstreamResourceGen = fc
    .tuple(validNameGen, validTypeGen)
    .map(([name, type]) => ({
        name,
        type,
        absolutePath: `/upstream/registry/${type}s/${name}.md`,
        source: 'registry',
    }));

/**
 * Generator for a ResolvedResource with source 'company' (overlay).
 */
const overlayResourceGen = fc
    .tuple(validNameGen, validTypeGen)
    .map(([name, type]) => ({
        name,
        type,
        absolutePath: `/company/overlay/${type}s/${name}.md`,
        source: 'company',
    }));

/**
 * Generator for upstream and overlay lists with controlled overlaps.
 *
 * Strategy:
 * 1. Generate a set of shared (name, type) pairs that exist in both lists
 * 2. Generate unique upstream-only resources
 * 3. Generate unique overlay-only resources
 * 4. Combine shared pairs into both upstream and overlay arrays
 */
const mergeInputGen = fc
    .tuple(
        // Shared (name, type) pairs — these exist in both upstream and overlay
        fc.array(fc.tuple(validNameGen, validTypeGen), { minLength: 0, maxLength: 5 }),
        // Upstream-only resources
        fc.array(fc.tuple(validNameGen, validTypeGen), { minLength: 0, maxLength: 5 }),
        // Overlay-only resources
        fc.array(fc.tuple(validNameGen, validTypeGen), { minLength: 0, maxLength: 5 })
    )
    .map(([shared, upstreamOnly, overlayOnly]) => {
        // Deduplicate by (name, type) key across all three groups
        const usedKeys = new Set();

        const sharedPairs = [];
        for (const [name, type] of shared) {
            const key = `${name}|${type}`;
            if (!usedKeys.has(key)) {
                usedKeys.add(key);
                sharedPairs.push({ name, type });
            }
        }

        const upstreamOnlyPairs = [];
        for (const [name, type] of upstreamOnly) {
            const key = `${name}|${type}`;
            if (!usedKeys.has(key)) {
                usedKeys.add(key);
                upstreamOnlyPairs.push({ name, type });
            }
        }

        const overlayOnlyPairs = [];
        for (const [name, type] of overlayOnly) {
            const key = `${name}|${type}`;
            if (!usedKeys.has(key)) {
                usedKeys.add(key);
                overlayOnlyPairs.push({ name, type });
            }
        }

        // Build upstream list: shared pairs + upstream-only pairs
        const upstream = [
            ...sharedPairs.map(({ name, type }) => ({
                name,
                type,
                absolutePath: `/upstream/registry/${type}s/${name}.md`,
                source: 'registry',
            })),
            ...upstreamOnlyPairs.map(({ name, type }) => ({
                name,
                type,
                absolutePath: `/upstream/registry/${type}s/${name}.md`,
                source: 'registry',
            })),
        ];

        // Build overlay list: shared pairs + overlay-only pairs
        const overlay = [
            ...sharedPairs.map(({ name, type }) => ({
                name,
                type,
                absolutePath: `/company/overlay/${type}s/${name}.md`,
                source: 'company',
            })),
            ...overlayOnlyPairs.map(({ name, type }) => ({
                name,
                type,
                absolutePath: `/company/overlay/${type}s/${name}.md`,
                source: 'company',
            })),
        ];

        return {
            upstream,
            overlay,
            sharedPairs,
            upstreamOnlyPairs,
            overlayOnlyPairs,
        };
    });

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Feature: company-resource-overlay, Property 5: Merge Prefers Overlay', () => {

    /**
     * **Validates: Requirements 3.3, 9.3**
     *
     * For any upstream resource list U and overlay resource list O,
     * mergeResults(U, O) SHALL return a list where:
     * (a) every resource from O is included
     * (b) every resource from U whose (name, type) pair does NOT appear in O is included
     * (c) no resource from U whose (name, type) pair appears in O is included
     * The resulting list has length |O| + |U \ duplicates|.
     */
    it('merged result includes all overlay, excludes conflicting upstream, keeps non-conflicting upstream', () => {
        fc.assert(
            fc.property(mergeInputGen, ({ upstream, overlay, sharedPairs, upstreamOnlyPairs, overlayOnlyPairs }) => {
                const result = mergeResults(upstream, overlay);

                // Build sets for lookup
                const overlayKeys = new Set(
                    overlay.map(r => `${r.name}|${r.type}`)
                );

                // (a) Every resource from O is included in result
                for (const overlayResource of overlay) {
                    const found = result.some(r =>
                        r.name === overlayResource.name &&
                        r.type === overlayResource.type &&
                        r.absolutePath === overlayResource.absolutePath &&
                        r.source === 'company'
                    );
                    assert.ok(found,
                        `Overlay resource "${overlayResource.name}" (type: ${overlayResource.type}) must be in result`);
                }

                // (b) Every resource from U whose (name, type) does NOT appear in O is included
                for (const upstreamResource of upstream) {
                    const key = `${upstreamResource.name}|${upstreamResource.type}`;
                    if (!overlayKeys.has(key)) {
                        const found = result.some(r =>
                            r.name === upstreamResource.name &&
                            r.type === upstreamResource.type &&
                            r.absolutePath === upstreamResource.absolutePath &&
                            r.source === 'registry'
                        );
                        assert.ok(found,
                            `Non-conflicting upstream resource "${upstreamResource.name}" (type: ${upstreamResource.type}) must be in result`);
                    }
                }

                // (c) No resource from U whose (name, type) pair appears in O is included
                for (const upstreamResource of upstream) {
                    const key = `${upstreamResource.name}|${upstreamResource.type}`;
                    if (overlayKeys.has(key)) {
                        const found = result.some(r =>
                            r.name === upstreamResource.name &&
                            r.type === upstreamResource.type &&
                            r.absolutePath === upstreamResource.absolutePath &&
                            r.source === 'registry'
                        );
                        assert.ok(!found,
                            `Conflicting upstream resource "${upstreamResource.name}" (type: ${upstreamResource.type}) must NOT be in result`);
                    }
                }

                // Length check: |O| + |U \ duplicates|
                const nonConflictingUpstreamCount = upstream.filter(r => {
                    const key = `${r.name}|${r.type}`;
                    return !overlayKeys.has(key);
                }).length;

                const expectedLength = overlay.length + nonConflictingUpstreamCount;
                assert.equal(result.length, expectedLength,
                    `Result length should be ${expectedLength} (|O|=${overlay.length} + non-conflicting=${nonConflictingUpstreamCount}), got ${result.length}`);
            }),
            { numRuns: 100 }
        );
    });

    it('empty upstream returns only overlay resources', () => {
        fc.assert(
            fc.property(
                fc.array(overlayResourceGen, { minLength: 0, maxLength: 10 }),
                (overlay) => {
                    const result = mergeResults([], overlay);

                    assert.equal(result.length, overlay.length,
                        `Expected ${overlay.length} results with empty upstream`);

                    for (const overlayResource of overlay) {
                        const found = result.some(r =>
                            r.name === overlayResource.name &&
                            r.type === overlayResource.type &&
                            r.source === 'company'
                        );
                        assert.ok(found,
                            `Overlay resource "${overlayResource.name}" must be in result`);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('empty overlay returns all upstream resources', () => {
        fc.assert(
            fc.property(
                fc.array(upstreamResourceGen, { minLength: 0, maxLength: 10 }),
                (upstream) => {
                    const result = mergeResults(upstream, []);

                    assert.equal(result.length, upstream.length,
                        `Expected ${upstream.length} results with empty overlay`);

                    for (const upstreamResource of upstream) {
                        const found = result.some(r =>
                            r.name === upstreamResource.name &&
                            r.type === upstreamResource.type &&
                            r.source === 'registry'
                        );
                        assert.ok(found,
                            `Upstream resource "${upstreamResource.name}" must be in result`);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('same name with different type are NOT considered duplicates', () => {
        fc.assert(
            fc.property(
                validNameGen,
                (name) => {
                    // Upstream has name with type 'skill', overlay has same name with type 'agent'
                    const upstream = [{
                        name,
                        type: 'skill',
                        absolutePath: `/upstream/registry/skills/${name}.md`,
                        source: 'registry',
                    }];

                    const overlay = [{
                        name,
                        type: 'agent',
                        absolutePath: `/company/overlay/agents/${name}.md`,
                        source: 'company',
                    }];

                    const result = mergeResults(upstream, overlay);

                    // Both should be present since (name, type) pairs differ
                    assert.equal(result.length, 2,
                        `Same name "${name}" with different types should both appear in result`);

                    const hasUpstream = result.some(r =>
                        r.name === name && r.type === 'skill' && r.source === 'registry'
                    );
                    const hasOverlay = result.some(r =>
                        r.name === name && r.type === 'agent' && r.source === 'company'
                    );

                    assert.ok(hasUpstream,
                        `Upstream resource "${name}" (skill) should be present`);
                    assert.ok(hasOverlay,
                        `Overlay resource "${name}" (agent) should be present`);
                }
            ),
            { numRuns: 100 }
        );
    });
});
