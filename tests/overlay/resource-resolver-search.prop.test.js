'use strict';

/**
 * Property-Based Tests for Resource Resolver — Search Query Matching
 *
 * Feature: company-resource-overlay, Property 4: Search Query Matching
 *
 * Validates: Requirements 3.6, 3.7
 *
 * For any resource with name N and tags T, and for any query string Q tokenized
 * into terms, `matchQuery` SHALL return that resource if and only if:
 * (a) N contains at least one term as a case-insensitive substring, OR
 * (b) at least one element of T exactly equals at least one term under
 *     case-insensitive comparison.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const { matchQuery } = require('../../.awos-adapters/lib/resource-resolver');

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

const FIRST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const REST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_-';

/** Valid resource name: starts with [a-z0-9], rest [a-z0-9_-], 2–30 chars */
const validNameGen = fc
    .tuple(
        fc.constantFrom(...FIRST_CHARS.split('')),
        fc.array(fc.constantFrom(...REST_CHARS.split('')), { minLength: 1, maxLength: 29 })
    )
    .map(([first, rest]) => first + rest.join(''));

/** Valid resource type */
const validTypeGen = fc.constantFrom('skill', 'agent', 'mcp');

/** Valid tag: non-empty string 1-64 chars (printable, no leading/trailing whitespace) */
const validTagGen = fc
    .array(
        fc.constantFrom(
            ...'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_.'.split('')
        ),
        { minLength: 1, maxLength: 30 }
    )
    .map(chars => chars.join(''));

/** Valid tags array: 0 to 5 tags */
const validTagsGen = fc.array(validTagGen, { minLength: 0, maxLength: 5 });

/** Generate a resolved resource object */
const resourceGen = fc
    .tuple(validNameGen, validTypeGen, validTagsGen)
    .map(([name, type, tags]) => ({
        name,
        type,
        absolutePath: `/fake/path/${name}.md`,
        source: 'company',
        tags,
    }));

/** Generate a non-whitespace query term (lowercase alpha + digits + some safe chars) */
const queryTermGen = fc
    .array(
        fc.constantFrom(
            ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
        ),
        { minLength: 1, maxLength: 15 }
    )
    .map(chars => chars.join(''));

/** Generate a query string with 1-4 terms separated by spaces */
const queryGen = fc
    .array(queryTermGen, { minLength: 1, maxLength: 4 })
    .map(terms => terms.join(' '));

// ---------------------------------------------------------------------
// Helper: reference implementation of match logic
// ---------------------------------------------------------------------

/**
 * Reference implementation that determines whether a resource should match
 * a given query, following the exact specification semantics.
 *
 * @param {Object} resource - Resource with name and tags
 * @param {string} query - Search query string
 * @returns {boolean} Whether the resource should match
 */
function shouldMatch(resource, query) {
    if (!query || typeof query !== 'string') return false;

    const terms = query.split(/\s+/).filter(t => t.length > 0);
    if (terms.length === 0) return false;

    const lowerTerms = terms.map(t => t.toLowerCase());
    const lowerName = resource.name.toLowerCase();

    // (a) name contains at least one term as a case-insensitive substring
    for (const term of lowerTerms) {
        if (lowerName.includes(term)) return true;
    }

    // (b) at least one tag exactly equals at least one term (case-insensitive)
    if (Array.isArray(resource.tags)) {
        for (const tag of resource.tags) {
            const lowerTag = tag.toLowerCase();
            for (const term of lowerTerms) {
                if (lowerTag === term) return true;
            }
        }
    }

    return false;
}

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Feature: company-resource-overlay, Property 4: Search Query Matching', () => {

    it('matchQuery returns resource iff name contains term as substring OR tag exactly equals term (case-insensitive)', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * For any resource with name N and tags T, and for any query Q,
         * matchQuery SHALL return that resource iff the reference match holds.
         */
        fc.assert(
            fc.property(resourceGen, queryGen, (resource, query) => {
                const result = matchQuery([resource], query);
                const expected = shouldMatch(resource, query);

                if (expected) {
                    assert.equal(result.length, 1,
                        `Expected resource "${resource.name}" to match query "${query}" ` +
                        `(tags: ${JSON.stringify(resource.tags)})`);
                    assert.equal(result[0].name, resource.name);
                } else {
                    assert.equal(result.length, 0,
                        `Expected resource "${resource.name}" to NOT match query "${query}" ` +
                        `(tags: ${JSON.stringify(resource.tags)})`);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('a query term that is a substring of name always matches the resource', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * Generate a resource and construct a query that contains a known
         * substring of the resource name → resource must be in the result.
         */
        fc.assert(
            fc.property(
                resourceGen,
                fc.nat(),
                fc.nat(),
                (resource, startSeed, lenSeed) => {
                    const name = resource.name;
                    // Extract a random substring of the name
                    const start = startSeed % name.length;
                    const maxLen = name.length - start;
                    const len = (lenSeed % maxLen) + 1;
                    const substring = name.slice(start, start + len);

                    const result = matchQuery([resource], substring);
                    assert.equal(result.length, 1,
                        `Expected resource "${name}" to match query "${substring}" ` +
                        `(substring at [${start}, ${start + len}])`);
                }
            ),
            { numRuns: 200 }
        );
    });

    it('a query term that exactly equals a tag always matches the resource', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * Generate a resource with tags, pick one tag as the query →
         * resource must be in the result.
         */
        fc.assert(
            fc.property(
                fc.tuple(validNameGen, validTypeGen, fc.array(validTagGen, { minLength: 1, maxLength: 5 })),
                fc.nat(),
                ([name, type, tags], indexSeed) => {
                    const resource = {
                        name,
                        type,
                        absolutePath: `/fake/${name}.md`,
                        source: 'company',
                        tags,
                    };

                    // Pick a random tag as the query
                    const tagIndex = indexSeed % tags.length;
                    const query = tags[tagIndex];

                    const result = matchQuery([resource], query);
                    assert.equal(result.length, 1,
                        `Expected resource "${name}" to match query "${query}" ` +
                        `(exact tag match at index ${tagIndex}, tags: ${JSON.stringify(tags)})`);
                }
            ),
            { numRuns: 200 }
        );
    });

    it('case variations in query still match name substrings', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * Matching is case-insensitive: an uppercase query term that is
         * a substring of the lowercase name should still match.
         */
        fc.assert(
            fc.property(
                resourceGen,
                fc.nat(),
                fc.nat(),
                (resource, startSeed, lenSeed) => {
                    const name = resource.name;
                    const start = startSeed % name.length;
                    const maxLen = name.length - start;
                    const len = (lenSeed % maxLen) + 1;
                    const substring = name.slice(start, start + len).toUpperCase();

                    const result = matchQuery([resource], substring);
                    assert.equal(result.length, 1,
                        `Expected resource "${name}" to match UPPERCASE query "${substring}"`);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('case variations in query still match tags exactly', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * A tag that equals a query term case-insensitively should match.
         */
        fc.assert(
            fc.property(
                fc.tuple(validNameGen, validTypeGen, fc.array(validTagGen, { minLength: 1, maxLength: 5 })),
                fc.nat(),
                ([name, type, tags], indexSeed) => {
                    const resource = {
                        name,
                        type,
                        absolutePath: `/fake/${name}.md`,
                        source: 'company',
                        tags,
                    };

                    // Pick a tag and uppercase it
                    const tagIndex = indexSeed % tags.length;
                    const query = tags[tagIndex].toUpperCase();

                    const result = matchQuery([resource], query);
                    assert.equal(result.length, 1,
                        `Expected resource "${name}" to match UPPERCASE tag query "${query}" ` +
                        `(original tag: "${tags[tagIndex]}")`);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('empty query returns empty result', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * An empty or whitespace-only query should return no matches.
         */
        fc.assert(
            fc.property(
                fc.array(resourceGen, { minLength: 1, maxLength: 5 }),
                fc.constantFrom('', '   ', '\t', '\n', '  \t\n  '),
                (resources, query) => {
                    const result = matchQuery(resources, query);
                    assert.equal(result.length, 0,
                        `Expected empty result for empty/whitespace query "${JSON.stringify(query)}"`);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('multiple resources: only matching ones are returned', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * Given multiple resources and a query, only resources that
         * satisfy the match criteria should be returned.
         */
        fc.assert(
            fc.property(
                fc.array(resourceGen, { minLength: 2, maxLength: 8 }),
                queryGen,
                (resources, query) => {
                    const result = matchQuery(resources, query);

                    // Verify each returned resource actually matches
                    for (const r of result) {
                        assert.ok(shouldMatch(r, query),
                            `Returned resource "${r.name}" does not match query "${query}"`);
                    }

                    // Verify no resource that should match is missing
                    const resultNames = new Set(result.map(r => r.name));
                    for (const r of resources) {
                        if (shouldMatch(r, query)) {
                            assert.ok(resultNames.has(r.name),
                                `Resource "${r.name}" should match query "${query}" but was not returned`);
                        }
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('tag matching is exact, not substring — a tag partial match does not qualify', () => {
        /**
         * Validates: Requirements 3.6, 3.7
         *
         * If a query term is a proper substring of a tag (but not the full tag),
         * and the term is NOT a substring of the name, the resource should NOT match.
         */
        fc.assert(
            fc.property(
                fc.tuple(
                    // Generate a tag long enough to extract a proper substring
                    fc.array(
                        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
                        { minLength: 4, maxLength: 15 }
                    ).map(chars => chars.join('')),
                    fc.nat()
                ),
                ([tag, lenSeed]) => {
                    // Create a proper substring of the tag (shorter than full tag)
                    const subLen = (lenSeed % (tag.length - 1)) + 1; // 1 to tag.length-1
                    const partialTerm = tag.slice(0, subLen);

                    // Use a name that does NOT contain the partial term
                    // Use a name pattern that can't contain the partial term
                    const safeName = 'z9z9z9z9z9';

                    // Only run assertion if partial term is NOT a substring of safeName
                    // and partial term is NOT equal to the full tag
                    if (safeName.includes(partialTerm.toLowerCase()) || partialTerm.toLowerCase() === tag.toLowerCase()) {
                        return; // skip this case
                    }

                    const resource = {
                        name: safeName,
                        type: 'skill',
                        absolutePath: `/fake/${safeName}.md`,
                        source: 'company',
                        tags: [tag],
                    };

                    const result = matchQuery([resource], partialTerm);
                    assert.equal(result.length, 0,
                        `Tag "${tag}" should NOT match partial query "${partialTerm}" ` +
                        `(tag matching is exact, not substring)`);
                }
            ),
            { numRuns: 100 }
        );
    });
});
