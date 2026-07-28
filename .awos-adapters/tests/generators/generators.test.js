'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createRandom } = require('../lib/pbt.js');
const {
    genFrontmatter,
    genSection,
    genCommandMarkdown,
    genMalformedCommand,
    genToolReference,
} = require('./command-gen.js');
const { genIR } = require('./ir-gen.js');
const { genMarkerCombination, ALL_MARKERS } = require('./filesystem-gen.js');
const { serialize, deserialize, VALID_TOOLS } = require('../../lib/ir.js');

describe('command-gen', () => {
    it('genFrontmatter produces valid YAML frontmatter', () => {
        const rng = createRandom(42);
        for (let i = 0; i < 20; i++) {
            const fm = genFrontmatter(rng);
            assert.ok(fm.startsWith('---\n'), 'starts with ---');
            assert.ok(fm.endsWith('---\n'), 'ends with ---');
            assert.ok(fm.includes('description:'), 'has description');
        }
    });

    it('genSection produces content for each section type', () => {
        const rng = createRandom(99);
        const sections = [
            'ROLE',
            'TASK',
            'INPUTS & OUTPUTS',
            'INTERACTION',
            'PROCESS',
        ];
        for (const name of sections) {
            const content = genSection(rng, name);
            assert.ok(content.length > 0, `${name} has content`);
            assert.ok(
                content.includes(`# ${name}`),
                `${name} has header`
            );
        }
    });

    it('genCommandMarkdown produces complete command files', () => {
        const rng = createRandom(123);
        for (let i = 0; i < 10; i++) {
            const md = genCommandMarkdown(rng);
            assert.ok(md.includes('---'), 'has frontmatter');
            assert.ok(md.includes('# ROLE'), 'has ROLE');
            assert.ok(md.includes('# TASK'), 'has TASK');
            assert.ok(
                md.includes('# INPUTS & OUTPUTS'),
                'has INPUTS & OUTPUTS'
            );
            assert.ok(md.includes('# INTERACTION'), 'has INTERACTION');
            assert.ok(md.includes('# PROCESS'), 'has PROCESS');
        }
    });

    it('genMalformedCommand produces structurally defective files', () => {
        const rng = createRandom(777);
        for (let i = 0; i < 20; i++) {
            const { content, defect } = genMalformedCommand(rng);
            assert.ok(typeof content === 'string', 'content is string');
            assert.ok(typeof defect === 'string', 'defect is string');

            // Verify the defect is actually present
            switch (defect) {
                case 'missing-role':
                    assert.ok(!content.includes('# ROLE'), 'ROLE missing');
                    break;
                case 'missing-task':
                    assert.ok(!content.includes('# TASK'), 'TASK missing');
                    break;
                case 'missing-process':
                    assert.ok(
                        !content.includes('# PROCESS'),
                        'PROCESS missing'
                    );
                    break;
                case 'empty-file':
                    assert.equal(content, '', 'file is empty');
                    break;
                case 'invalid-frontmatter':
                    assert.ok(
                        content.includes('[invalid:'),
                        'has invalid yaml'
                    );
                    break;
                case 'no-frontmatter':
                    assert.ok(!content.startsWith('---'), 'no frontmatter');
                    break;
            }
        }
    });

    it('genToolReference produces valid tool call syntax', () => {
        const rng = createRandom(456);
        for (const tool of VALID_TOOLS) {
            const ref = genToolReference(rng, tool);
            assert.ok(ref.startsWith(`${tool}(`), `starts with ${tool}(`);
            assert.ok(ref.endsWith(')'), 'ends with )');
        }
    });

    it('genToolReference without tool param picks random tool', () => {
        const rng = createRandom(789);
        for (let i = 0; i < 20; i++) {
            const ref = genToolReference(rng);
            const startsWithTool = VALID_TOOLS.some((t) =>
                ref.startsWith(`${t}(`)
            );
            assert.ok(startsWithTool, `ref starts with a valid tool: ${ref}`);
        }
    });
});

describe('ir-gen', () => {
    it('genIR produces valid CommandIR objects', () => {
        const rng = createRandom(42);
        for (let i = 0; i < 20; i++) {
            const ir = genIR(rng);
            assert.ok(typeof ir.name === 'string' && ir.name.length > 0);
            assert.ok(ir.frontmatter !== null);
            assert.ok(typeof ir.frontmatter.description === 'string');
            assert.ok(
                ir.frontmatter.argumentHint === null ||
                typeof ir.frontmatter.argumentHint === 'string'
            );
            assert.ok(typeof ir.role.title === 'string');
            assert.ok(typeof ir.role.description === 'string');
            assert.ok(Array.isArray(ir.role.rules));
            assert.ok(typeof ir.task.goal === 'string');
            assert.ok(typeof ir.task.body === 'string');
            assert.ok(Array.isArray(ir.io.inputs));
            assert.ok(Array.isArray(ir.io.outputs));
            assert.ok(Array.isArray(ir.io.contextFiles));
            assert.ok(Array.isArray(ir.interaction.tools));
            assert.ok(typeof ir.interaction.notes === 'string');
            assert.ok(Array.isArray(ir.process.steps));
            assert.ok(ir.process.steps.length >= 1);
            assert.ok(Array.isArray(ir.toolReferences));
        }
    });

    it('genIR produces IR that survives serialize/deserialize', () => {
        const rng = createRandom(101);
        for (let i = 0; i < 10; i++) {
            const ir = genIR(rng);
            const json = serialize(ir);
            const restored = deserialize(json);
            assert.deepEqual(restored, ir);
        }
    });
});

describe('filesystem-gen', () => {
    it('genMarkerCombination produces valid marker subsets', () => {
        const rng = createRandom(42);
        const allMarkerValues = ALL_MARKERS.map((m) => m.marker);

        for (let i = 0; i < 30; i++) {
            const { markers, expectedProviders } = genMarkerCombination(rng);
            assert.ok(Array.isArray(markers));
            assert.ok(Array.isArray(expectedProviders));

            // All returned markers are from the known set
            for (const m of markers) {
                assert.ok(
                    allMarkerValues.includes(m),
                    `${m} is a known marker`
                );
            }

            // Expected providers are sorted
            const sorted = [...expectedProviders].sort();
            assert.deepEqual(expectedProviders, sorted);

            // Each expected provider has at least one marker present
            for (const prov of expectedProviders) {
                const provMarkers = ALL_MARKERS.filter(
                    (e) => e.provider === prov
                ).map((e) => e.marker);
                const hasMarker = provMarkers.some((m) =>
                    markers.includes(m)
                );
                assert.ok(
                    hasMarker,
                    `provider ${prov} has a marker present`
                );
            }
        }
    });

    it('genMarkerCombination is deterministic for same seed', () => {
        const rng1 = createRandom(555);
        const rng2 = createRandom(555);

        for (let i = 0; i < 10; i++) {
            const result1 = genMarkerCombination(rng1);
            const result2 = genMarkerCombination(rng2);
            assert.deepEqual(result1, result2);
        }
    });
});
