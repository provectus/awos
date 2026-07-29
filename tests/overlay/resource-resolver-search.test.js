'use strict';

/**
 * Unit Tests for Resource Resolver — matchQuery() and mergeResults()
 *
 * Validates: Requirements 3.3, 3.6, 3.7, 9.1, 9.3
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { matchQuery, mergeResults } = require('../../.awos-adapters/lib/resource-resolver');

// ---------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------

const mockResource = (name, type, source, tags = []) => ({
    name,
    type,
    absolutePath: `/fake/${type}s/${name}.md`,
    source,
    tags,
});

// ---------------------------------------------------------------------
// matchQuery() Unit Tests
// ---------------------------------------------------------------------

describe('matchQuery() — search query matching', () => {

    it('single term matching name substring returns the resource', () => {
        const resources = [mockResource('winged-commerce-api', 'skill', 'company', ['api'])];
        const result = matchQuery(resources, 'commerce');
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'winged-commerce-api');
    });

    it('single term NOT matching anything returns empty', () => {
        const resources = [mockResource('winged-commerce-api', 'skill', 'company', ['api'])];
        const result = matchQuery(resources, 'database');
        assert.equal(result.length, 0);
    });

    it('multi-term query where one term matches name returns the resource', () => {
        const resources = [mockResource('winged-commerce-api', 'skill', 'company', ['api'])];
        const result = matchQuery(resources, 'database commerce frontend');
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'winged-commerce-api');
    });

    it('tag exact match (case-insensitive) returns the resource', () => {
        const resources = [mockResource('my-tool', 'skill', 'company', ['Backend', 'Node'])];
        const result = matchQuery(resources, 'backend');
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'my-tool');
    });

    it('tag partial match (substring of tag, not exact) does NOT match', () => {
        const resources = [mockResource('z9z9z9', 'skill', 'company', ['backend'])];
        // "back" is a substring of "backend" but not an exact match
        const result = matchQuery(resources, 'back');
        assert.equal(result.length, 0);
    });

    it('case-insensitive name match (uppercase query, lowercase name) matches', () => {
        const resources = [mockResource('winged-commerce-api', 'skill', 'company')];
        const result = matchQuery(resources, 'COMMERCE');
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'winged-commerce-api');
    });

    it('case-insensitive tag match matches', () => {
        const resources = [mockResource('z9z9z9', 'skill', 'company', ['Analytics'])];
        const result = matchQuery(resources, 'ANALYTICS');
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'z9z9z9');
    });

    it('empty query returns empty array', () => {
        const resources = [
            mockResource('winged-commerce-api', 'skill', 'company', ['api']),
            mockResource('backend-agent', 'agent', 'company', ['node']),
        ];
        const result = matchQuery(resources, '');
        assert.equal(result.length, 0);
    });

    it('whitespace-only query returns empty array', () => {
        const resources = [
            mockResource('winged-commerce-api', 'skill', 'company', ['api']),
            mockResource('backend-agent', 'agent', 'company', ['node']),
        ];
        const result = matchQuery(resources, '   \t  ');
        assert.equal(result.length, 0);
    });

    it('multiple resources, only some match — returns only matching ones', () => {
        const resources = [
            mockResource('winged-commerce-api', 'skill', 'company', ['api', 'commerce']),
            mockResource('backend-agent', 'agent', 'company', ['node', 'backend']),
            mockResource('frontend-tool', 'skill', 'company', ['react', 'frontend']),
        ];
        const result = matchQuery(resources, 'backend');
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'backend-agent');
    });

    it('resource with no tags, name does not match — not returned', () => {
        const resources = [mockResource('winged-commerce-api', 'skill', 'company')];
        const result = matchQuery(resources, 'database');
        assert.equal(result.length, 0);
    });

    it('resource with empty tags array — only name matching works', () => {
        const resources = [mockResource('winged-commerce-api', 'skill', 'company', [])];
        // Matches by name substring
        const result1 = matchQuery(resources, 'commerce');
        assert.equal(result1.length, 1);
        assert.equal(result1[0].name, 'winged-commerce-api');

        // Does not match because no tags and name doesn't contain "database"
        const result2 = matchQuery(resources, 'database');
        assert.equal(result2.length, 0);
    });
});

// ---------------------------------------------------------------------
// mergeResults() Unit Tests
// ---------------------------------------------------------------------

describe('mergeResults() — overlay-wins merge semantics', () => {

    it('no overlap: all upstream + all overlay present in result', () => {
        const upstream = [
            mockResource('registry-skill', 'skill', 'registry'),
            mockResource('registry-agent', 'agent', 'registry'),
        ];
        const overlay = [
            mockResource('company-skill', 'skill', 'company'),
            mockResource('company-mcp', 'mcp', 'company'),
        ];
        const result = mergeResults(upstream, overlay);

        assert.equal(result.length, 4);
        assert.ok(result.some(r => r.name === 'registry-skill' && r.source === 'registry'));
        assert.ok(result.some(r => r.name === 'registry-agent' && r.source === 'registry'));
        assert.ok(result.some(r => r.name === 'company-skill' && r.source === 'company'));
        assert.ok(result.some(r => r.name === 'company-mcp' && r.source === 'company'));
    });

    it('full overlap: only overlay versions in result (upstream excluded)', () => {
        const upstream = [
            mockResource('shared-skill', 'skill', 'registry'),
            mockResource('shared-agent', 'agent', 'registry'),
        ];
        const overlay = [
            mockResource('shared-skill', 'skill', 'company'),
            mockResource('shared-agent', 'agent', 'company'),
        ];
        const result = mergeResults(upstream, overlay);

        assert.equal(result.length, 2);
        assert.ok(result.every(r => r.source === 'company'));
        assert.ok(result.some(r => r.name === 'shared-skill' && r.type === 'skill'));
        assert.ok(result.some(r => r.name === 'shared-agent' && r.type === 'agent'));
    });

    it('partial overlap: non-conflicting upstream kept, conflicting excluded, all overlay present', () => {
        const upstream = [
            mockResource('shared-skill', 'skill', 'registry'),
            mockResource('unique-upstream', 'agent', 'registry'),
        ];
        const overlay = [
            mockResource('shared-skill', 'skill', 'company'),
            mockResource('unique-overlay', 'mcp', 'company'),
        ];
        const result = mergeResults(upstream, overlay);

        assert.equal(result.length, 3);
        // Non-conflicting upstream kept
        assert.ok(result.some(r => r.name === 'unique-upstream' && r.source === 'registry'));
        // Conflicting upstream excluded — only overlay version present
        assert.ok(result.some(r => r.name === 'shared-skill' && r.source === 'company'));
        assert.ok(!result.some(r => r.name === 'shared-skill' && r.source === 'registry'));
        // Overlay resource present
        assert.ok(result.some(r => r.name === 'unique-overlay' && r.source === 'company'));
    });

    it('empty upstream: result equals overlay', () => {
        const overlay = [
            mockResource('company-skill', 'skill', 'company'),
            mockResource('company-agent', 'agent', 'company'),
        ];
        const result = mergeResults([], overlay);

        assert.equal(result.length, 2);
        assert.deepEqual(result, overlay);
    });

    it('empty overlay: result equals upstream', () => {
        const upstream = [
            mockResource('registry-skill', 'skill', 'registry'),
            mockResource('registry-agent', 'agent', 'registry'),
        ];
        const result = mergeResults(upstream, []);

        assert.equal(result.length, 2);
        assert.deepEqual(result, upstream);
    });

    it('same name but different type: NOT considered a duplicate (both kept)', () => {
        const upstream = [
            mockResource('shared-name', 'skill', 'registry'),
        ];
        const overlay = [
            mockResource('shared-name', 'agent', 'company'),
        ];
        const result = mergeResults(upstream, overlay);

        assert.equal(result.length, 2);
        assert.ok(result.some(r => r.name === 'shared-name' && r.type === 'skill' && r.source === 'registry'));
        assert.ok(result.some(r => r.name === 'shared-name' && r.type === 'agent' && r.source === 'company'));
    });

    it('multiple conflicts: all resolved in favor of overlay', () => {
        const upstream = [
            mockResource('skill-a', 'skill', 'registry'),
            mockResource('skill-b', 'skill', 'registry'),
            mockResource('agent-c', 'agent', 'registry'),
            mockResource('unique-d', 'mcp', 'registry'),
        ];
        const overlay = [
            mockResource('skill-a', 'skill', 'company'),
            mockResource('skill-b', 'skill', 'company'),
            mockResource('agent-c', 'agent', 'company'),
        ];
        const result = mergeResults(upstream, overlay);

        assert.equal(result.length, 4);
        // All conflicting resolved in favor of overlay
        assert.ok(result.some(r => r.name === 'skill-a' && r.source === 'company'));
        assert.ok(result.some(r => r.name === 'skill-b' && r.source === 'company'));
        assert.ok(result.some(r => r.name === 'agent-c' && r.source === 'company'));
        // Non-conflicting upstream kept
        assert.ok(result.some(r => r.name === 'unique-d' && r.source === 'registry'));
        // None of the conflicting upstream present
        assert.ok(!result.some(r => r.name === 'skill-a' && r.source === 'registry'));
        assert.ok(!result.some(r => r.name === 'skill-b' && r.source === 'registry'));
        assert.ok(!result.some(r => r.name === 'agent-c' && r.source === 'registry'));
    });
});
