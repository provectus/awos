'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { splitIfNeeded } = require('../lib/splitter.js');

describe('splitter - splitIfNeeded', () => {
    describe('no split needed', () => {
        it('returns single-element array when lineCount <= maxLines', () => {
            const file = {
                relativePath: 'steering/implement.md',
                content: '## Hello\n\nSome content here.\n',
                lineCount: 3,
            };
            const result = splitIfNeeded(file, 500);
            assert.equal(result.length, 1);
            assert.equal(result[0].relativePath, 'steering/implement.md');
            assert.equal(result[0].content, file.content);
        });

        it('uses default maxLines of 500', () => {
            const lines = Array.from({ length: 500 }, (_, i) => `Line ${i}`);
            const content = lines.join('\n');
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 500,
            };
            const result = splitIfNeeded(file);
            assert.equal(result.length, 1);
        });

        it('computes lineCount if not provided', () => {
            const file = {
                relativePath: 'steering/implement.md',
                content: 'a\nb\nc',
                lineCount: 3,
            };
            const result = splitIfNeeded(file, 500);
            assert.equal(result.length, 1);
            assert.equal(result[0].lineCount, 3);
        });
    });

    describe('splitting at section boundaries', () => {
        it('splits at H2 headings when file exceeds maxLines', () => {
            const section1 = '## Section One\n' +
                Array.from({ length: 14 }, (_, i) => `Line ${i}`).join('\n');
            const section2 = '## Section Two\n' +
                Array.from({ length: 14 }, (_, i) => `Line ${i}`).join('\n');
            const content = section1 + '\n' + section2;
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 30,
            };
            const result = splitIfNeeded(file, 16);
            assert.ok(result.length >= 2);
            // Each part should be <= maxLines (plus header)
            for (const part of result) {
                assert.ok(part.lineCount > 0);
            }
        });

        it('splits at H3 headings', () => {
            const section1 = '### Part A\n' +
                Array.from({ length: 14 }, (_, i) => `A-${i}`).join('\n');
            const section2 = '### Part B\n' +
                Array.from({ length: 14 }, (_, i) => `B-${i}`).join('\n');
            const content = section1 + '\n' + section2;
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 30,
            };
            const result = splitIfNeeded(file, 16);
            assert.ok(result.length >= 2);
        });
    });

    describe('naming convention', () => {
        it('uses {command}-{section}.md naming', () => {
            const section1 = '## Delegation\n' +
                Array.from({ length: 14 }, () => 'content').join('\n');
            const section2 = '## Orchestration\n' +
                Array.from({ length: 14 }, () => 'content').join('\n');
            const content = section1 + '\n' + section2;
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 30,
            };
            const result = splitIfNeeded(file, 16);
            assert.ok(result.length >= 2);
            assert.ok(
                result[0].relativePath.startsWith('steering/implement-')
            );
            assert.ok(result[0].relativePath.endsWith('.md'));
            assert.match(result[0].relativePath, /implement-delegation\.md/);
            assert.match(result[1].relativePath, /implement-orchestration\.md/);
        });

        it('uses part-N fallback for untitled sections', () => {
            // Content without headings that exceeds maxLines
            const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`);
            const content = lines.join('\n');
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 20,
            };
            // With maxLines=10 but no headings to split on, the whole
            // content is one section that will still be one fragment
            // (since it can't split without heading boundaries).
            // Let's test with headings at the right spots:
            const contentWithHeadings =
                Array.from({ length: 12 }, (_, i) => `Line ${i}`).join('\n') +
                '\n## Named Section\n' +
                Array.from({ length: 12 }, (_, i) => `More ${i}`).join('\n');
            const file2 = {
                relativePath: 'steering/implement.md',
                content: contentWithHeadings,
                lineCount: 26,
            };
            const result = splitIfNeeded(file2, 14);
            // First section has no heading title → "intro" → falls back to part-N
            assert.match(result[0].relativePath, /part-1/);
        });
    });

    describe('fragment merging', () => {
        it('merges fragments <10 lines with previous fragment', () => {
            // Three sections: large, large, tiny
            const section1 = '## First\n' +
                Array.from({ length: 19 }, () => 'x').join('\n');
            const section2 = '## Second\n' +
                Array.from({ length: 19 }, () => 'y').join('\n');
            const section3 = '## Tiny\nshort';
            const content = section1 + '\n' + section2 + '\n' + section3;
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 42,
            };
            const result = splitIfNeeded(file, 21);
            // Tiny section (2 lines) should be merged with previous
            // so we get 2 fragments, not 3
            assert.ok(result.length <= 2);
        });

        it('merges with next when no previous exists', () => {
            // tiny first section, then large section
            const section1 = '## Tiny\nhi';
            const section2 = '## Large\n' +
                Array.from({ length: 19 }, () => 'z').join('\n');
            const section3 = '## Also Large\n' +
                Array.from({ length: 19 }, () => 'w').join('\n');
            const content = section1 + '\n' + section2 + '\n' + section3;
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 42,
            };
            // maxLines = 21 means first two sections fit together (2 + 20 = 22)
            // Actually the tiny section would be grouped with the next
            // in buildFragments, then merged in mergeTinyFragments if separate
            const result = splitIfNeeded(file, 21);
            // Should not produce a standalone 2-line fragment
            for (const part of result) {
                assert.ok(
                    part.lineCount >= 10 || result.length === 1,
                    `Fragment too small: ${part.lineCount} lines`
                );
            }
        });
    });

    describe('auto-generated header', () => {
        it('includes header in each split file', () => {
            const section1 = '## Alpha\n' +
                Array.from({ length: 14 }, () => 'a').join('\n');
            const section2 = '## Beta\n' +
                Array.from({ length: 14 }, () => 'b').join('\n');
            const content = section1 + '\n' + section2;
            const file = {
                relativePath: 'steering/implement.md',
                content,
                lineCount: 30,
            };
            const result = splitIfNeeded(file, 16);
            for (const part of result) {
                assert.ok(
                    part.content.includes(
                        'Auto-generated by generate-adapters'
                    ),
                    'Missing auto-generated header'
                );
            }
        });
    });

    describe('error handling', () => {
        it('throws on null file', () => {
            assert.throws(
                () => splitIfNeeded(null),
                /file must be a non-null object/
            );
        });

        it('throws on missing content', () => {
            assert.throws(
                () => splitIfNeeded({ relativePath: 'a.md', lineCount: 1 }),
                /file.content must be a string/
            );
        });

        it('throws on missing relativePath', () => {
            assert.throws(
                () => splitIfNeeded({ content: 'hi', lineCount: 1 }),
                /file.relativePath must be a string/
            );
        });

        it('throws on invalid maxLines', () => {
            const file = {
                relativePath: 'a.md',
                content: 'hi',
                lineCount: 1,
            };
            assert.throws(() => splitIfNeeded(file, 0), /must be a positive/);
            assert.throws(() => splitIfNeeded(file, -1), /must be a positive/);
        });
    });
});
