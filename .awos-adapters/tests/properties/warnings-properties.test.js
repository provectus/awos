'use strict';

/**
 * Property-Based Tests for File Size Warning Threshold (Property 12).
 *
 * Validates that for any generated file exceeding 400 lines (but ≤500
 * lines), the emitter emits a warning including the file path and line
 * count.
 *
 * **Validates: Requirements 12.4**
 *
 * @module tests/properties/warnings-properties.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { randomInt } = require('node:crypto');
const { forAll } = require('../lib/pbt.js');
const { createCommandIR } = require('../../lib/ir.js');
const { emit } = require('../../lib/emitters/kiro.js');

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

/**
 * Generate a random string of given length.
 * @param {number} len
 * @returns {string}
 */
function randomString(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars[randomInt(chars.length)];
    }
    return result;
}

/**
 * Generate a CommandIR that produces output in the 401-500 line range.
 * We achieve this by adding many process steps with lengthy body text.
 *
 * @param {object} rng - PBT random number generator
 * @returns {{ir: object, targetLines: number}}
 */
function genLargeIR(rng) {
    // Target a line count in the 401-500 range
    const targetLines = rng.int(401, 501);

    const name = `cmd-${randomString(6)}`;
    const ir = createCommandIR(name);

    ir.frontmatter.description = `Test command generating large output`;
    ir.role.title = `Role Title`;
    ir.role.description = `A role description for testing purposes.`;
    ir.task.goal = `Goal: produce output that exceeds 400 lines`;
    ir.task.body = `Body content for large file test.`;
    ir.io.contextFiles = ['context/spec/test/tasks.md'];

    // Each step generates roughly 8-12 lines of output (title + body +
    // tool references + spacing). We target enough steps to reach the
    // desired line range.
    const stepsNeeded = Math.ceil(targetLines / 8);

    for (let i = 1; i <= stepsNeeded; i++) {
        ir.process.steps.push({
            stepNumber: i,
            title: `Step ${i}: ${randomString(10)}`,
            body: `Body for step ${i}. ${randomString(30)}\n${randomString(30)}`,
            toolReferences: [
                {
                    tool: 'Read',
                    context: 'Read context',
                    lineNumber: i * 10,
                    parameters: { _positional: `context/file-${i}.md` },
                },
            ],
            delegations: [],
        });
    }

    return { ir, targetLines };
}

/**
 * Generate a CommandIR that produces output ≤400 lines.
 * Deliberately small, with few process steps.
 *
 * @param {object} rng - PBT random number generator
 * @returns {{ir: object}}
 */
function genSmallIR(rng) {
    const name = `cmd-${randomString(6)}`;
    const ir = createCommandIR(name);

    ir.frontmatter.description = `Small test command`;
    ir.role.title = `Role`;
    ir.role.description = `Short role.`;
    ir.task.goal = `Small goal`;
    ir.task.body = `Short body.`;
    ir.io.contextFiles = ['context/spec/test/tasks.md'];

    const stepCount = rng.int(1, 5);
    for (let i = 1; i <= stepCount; i++) {
        ir.process.steps.push({
            stepNumber: i,
            title: `Step ${i}`,
            body: `Body ${i}`,
            toolReferences: [],
            delegations: [],
        });
    }

    return { ir };
}

// ---------------------------------------------------------------------
// Property 12: File size warning threshold
// ---------------------------------------------------------------------

describe('Property 12: File size warning threshold', () => {
    // Feature: multi-ide-adapter-layer, Property 12
    it('emitter warns when output file exceeds 400 lines but is ≤500', () => {
        forAll(
            'warning for >400 lines',
            genLargeIR,
            (input) => {
                const result = emit(input.ir, { maxLines: 500 });

                // Check files that exceed 400 lines
                for (const file of result.files) {
                    if (file.lineCount > 400 && file.lineCount <= 500) {
                        // There MUST be a warning mentioning this file
                        const hasWarning = result.warnings.some(
                            (w) =>
                                w.message.includes(file.relativePath) &&
                                w.message.includes(String(file.lineCount))
                        );
                        if (!hasWarning) {
                            return false;
                        }
                    }
                }

                return true;
            },
            { iterations: 100 }
        );
    });

    it('emitter does NOT warn when output file is ≤400 lines', () => {
        forAll(
            'no warning for ≤400 lines',
            genSmallIR,
            (input) => {
                const result = emit(input.ir, { maxLines: 500 });

                // For files ≤400 lines, there should be NO file-size warning
                for (const file of result.files) {
                    if (file.lineCount <= 400) {
                        const hasFileSizeWarning = result.warnings.some(
                            (w) =>
                                w.message.includes(file.relativePath) &&
                                w.message.includes('limit')
                        );
                        if (hasFileSizeWarning) {
                            return false;
                        }
                    }
                }

                return true;
            },
            { iterations: 100 }
        );
    });

    it('warning includes both file path and line count', () => {
        forAll(
            'warning content includes path and count',
            genLargeIR,
            (input) => {
                const result = emit(input.ir, { maxLines: 500 });

                for (const warning of result.warnings) {
                    // Each warning about file size should include both pieces
                    if (warning.message.includes('limit')) {
                        const hasPath = warning.file !== undefined;
                        const hasLineCount = /\d+/.test(warning.message);
                        if (!hasPath || !hasLineCount) {
                            return false;
                        }
                    }
                }

                return true;
            },
            { iterations: 100 }
        );
    });
});
