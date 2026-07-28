'use strict';

/**
 * Property-based tests for the Cursor Emitter.
 *
 * Validates Properties 5 (Cursor), 6, 7, 8, 9 (Cursor), and 11
 * from the design document using iteration-based random testing.
 *
 * Validates: Requirements 5.2, 5.3, 5.4, 9.2, 9.4, 14.3
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { randomInt } = require('node:crypto');
const { createCommandIR, VALID_TOOLS } = require('../../lib/ir.js');
const { emit } = require('../../lib/emitters/cursor.js');

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const WORDS = [
    'implement',
    'verify',
    'spec',
    'roadmap',
    'tasks',
    'architecture',
    'product',
    'hire',
    'tech',
    'deploy',
    'review',
    'design',
    'build',
    'test',
    'debug',
];

function randomString(minLen = 3, maxLen = 15) {
    const len = randomInt(minLen, maxLen + 1);
    let s = '';
    for (let i = 0; i < len; i++) {
        s += ALPHA[randomInt(0, ALPHA.length)];
    }
    return s;
}

function randomWord() {
    return WORDS[randomInt(0, WORDS.length)];
}

function randomPath() {
    const segments = randomInt(1, 4);
    const parts = [];
    for (let i = 0; i < segments; i++) {
        parts.push(randomString(3, 10));
    }
    return `context/${parts.join('/')}.md`;
}

function randomToolReference(tool) {
    const params = {};
    let context = '';
    switch (tool) {
        case 'Read':
            params.path = randomPath();
            params._positional = params.path;
            context = `Read(${params.path})`;
            break;
        case 'Glob':
            params.pattern = `context/${randomString(3, 8)}/**/*.md`;
            params._positional = params.pattern;
            context = `Glob(${params.pattern})`;
            break;
        case 'Agent':
            params.subagent_type = 'general-task-execution';
            params._positional = params.subagent_type;
            context = `Agent(subagent_type=${params.subagent_type})`;
            break;
        case 'AskUserQuestion':
            params.question = `Should we ${randomWord()}?`;
            params._positional = params.question;
            context = `AskUserQuestion("${params.question}")`;
            break;
        case 'Explore':
            params.target = randomString(5, 12);
            params._positional = params.target;
            context = `Explore(${params.target})`;
            break;
        case 'Plan':
            params.goal = `Plan the ${randomWord()} strategy`;
            params._positional = params.goal;
            context = `Plan("${params.goal}")`;
            break;
    }
    return {
        tool,
        context,
        lineNumber: randomInt(1, 200),
        parameters: params,
    };
}

function randomProcessStep(stepNumber) {
    const toolCount = randomInt(0, 4);
    const toolRefs = [];
    const delegations = [];

    for (let i = 0; i < toolCount; i++) {
        const tool = VALID_TOOLS[randomInt(0, VALID_TOOLS.length)];
        const ref = randomToolReference(tool);
        toolRefs.push(ref);
        if (tool === 'Agent') {
            delegations.push({
                agentType: ref.parameters.subagent_type || 'general-task-execution',
                promptTemplate: `Execute ${randomWord()} task`,
            });
        }
    }

    const bodyParts = [`Do the ${randomWord()} step.`];
    for (const ref of toolRefs) {
        bodyParts.push(ref.context);
    }

    return {
        stepNumber,
        title: `${randomWord()} ${randomWord()}`,
        body: bodyParts.join('\n'),
        toolReferences: toolRefs,
        delegations,
    };
}

function randomIR() {
    const name = randomWord();
    const ir = createCommandIR(name);

    ir.frontmatter.description = `A ${randomWord()} command`;
    ir.role.title = `${randomWord()} Agent`;
    ir.role.description = `You are a ${randomWord()} agent.`;
    ir.role.rules = [`Always ${randomWord()}`, `Never ${randomWord()}`];
    ir.task.goal = `Execute the ${randomWord()} workflow`;
    ir.task.body = `Details about ${randomWord()}.`;

    // Context files
    const cfCount = randomInt(1, 4);
    for (let i = 0; i < cfCount; i++) {
        ir.io.contextFiles.push(randomPath());
    }

    // Process steps
    const stepCount = randomInt(1, 6);
    for (let i = 0; i < stepCount; i++) {
        ir.process.steps.push(randomProcessStep(i + 1));
    }

    // Collect top-level tool references from all steps
    for (const step of ir.process.steps) {
        for (const ref of step.toolReferences) {
            ir.toolReferences.push(ref);
        }
    }

    // Interaction
    const interactionTools = [];
    if (ir.toolReferences.some((r) => r.tool === 'AskUserQuestion')) {
        interactionTools.push('AskUserQuestion');
    }
    if (ir.toolReferences.some((r) => r.tool === 'Explore')) {
        interactionTools.push('Explore');
    }
    if (ir.toolReferences.some((r) => r.tool === 'Plan')) {
        interactionTools.push('Plan');
    }
    ir.interaction.tools = interactionTools;
    ir.interaction.notes = interactionTools.length
        ? `Use ${interactionTools.join(', ')} when needed`
        : '';

    return ir;
}

/**
 * Generate an IR that always contains at least one of each tool type.
 */
function randomIRWithAllTools() {
    const ir = randomIR();
    // Ensure at least one reference per tool type
    for (const tool of VALID_TOOLS) {
        if (!ir.toolReferences.some((r) => r.tool === tool)) {
            const ref = randomToolReference(tool);
            const stepIdx = randomInt(0, ir.process.steps.length);
            ir.process.steps[stepIdx].toolReferences.push(ref);
            ir.process.steps[stepIdx].body += '\n' + ref.context;
            if (tool === 'Agent') {
                ir.process.steps[stepIdx].delegations.push({
                    agentType:
                        ref.parameters.subagent_type || 'general-task-execution',
                    promptTemplate: `Execute ${randomWord()} task`,
                });
            }
            ir.toolReferences.push(ref);
        }
    }
    return ir;
}

// ---------------------------------------------------------------------
// Constants for assertions
// ---------------------------------------------------------------------

const RAW_TOOL_PATTERNS = [
    /\bAgent\s*\(/,
    /\bRead\s*\(/,
    /\bGlob\s*\(/,
    /\bAskUserQuestion\s*\(/,
    /\bExplore\s*\(/,
    /\bPlan\s*\(/,
];

const MD_HEADER =
    '<!-- Auto-generated by generate-adapters — do not edit manually -->';

const ITERATIONS = 100;

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Cursor Emitter — Property Tests', () => {
    /**
     * **Property 5: Tool translation correctness per Provider (Cursor)**
     *
     * For any IR containing Claude Code tool references, the Cursor emitter
     * output SHALL contain the Cursor-native equivalent for each tool
     * reference and SHALL NOT contain raw Claude Code tool syntax.
     *
     * Validates: Requirements 5.2, 5.3
     */
    describe('Property 5: Tool translation correctness (Cursor)', () => {
        it('Read tools translate to @-file reference syntax', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                // Ensure at least one Read reference
                const readRef = randomToolReference('Read');
                const stepIdx = randomInt(0, ir.process.steps.length);
                ir.process.steps[stepIdx].toolReferences.push(readRef);
                ir.process.steps[stepIdx].body += '\n' + readRef.context;
                ir.toolReferences.push(readRef);

                const result = emit(ir);
                const allContent = result.files.map((f) => f.content).join('\n');

                // Should contain @-file reference
                assert.ok(
                    allContent.includes('@'),
                    `Iteration ${i}: output must contain @ references`
                );
                // Should not contain raw Read( syntax in process sections
                const processContent = allContent.split('## Process')[1] || '';
                assert.ok(
                    !processContent.match(/\bRead\s*\(/),
                    `Iteration ${i}: output must not contain raw Read() syntax`
                );
            }
        });

        it('Agent tools translate to sequential composer prompts', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                // Ensure at least one Agent reference
                const agentRef = randomToolReference('Agent');
                const stepIdx = randomInt(0, ir.process.steps.length);
                ir.process.steps[stepIdx].toolReferences.push(agentRef);
                ir.process.steps[stepIdx].body += '\n' + agentRef.context;
                ir.process.steps[stepIdx].delegations.push({
                    agentType: 'general-task-execution',
                    promptTemplate: 'Do the task',
                });
                ir.toolReferences.push(agentRef);

                const result = emit(ir);
                const allContent = result.files.map((f) => f.content).join('\n');

                // Should contain Composer session reference
                assert.ok(
                    allContent.includes('Composer') ||
                    allContent.includes('composer'),
                    `Iteration ${i}: Agent must translate to Composer instructions`
                );
                // Should not contain raw Agent( syntax in process
                const processContent = allContent.split('## Process')[1] || '';
                assert.ok(
                    !processContent.match(/\bAgent\s*\(/),
                    `Iteration ${i}: output must not contain raw Agent() syntax`
                );
            }
        });

        it('Glob tools translate to @folder reference syntax', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                // Ensure at least one Glob reference
                const globRef = randomToolReference('Glob');
                const stepIdx = randomInt(0, ir.process.steps.length);
                ir.process.steps[stepIdx].toolReferences.push(globRef);
                ir.process.steps[stepIdx].body += '\n' + globRef.context;
                ir.toolReferences.push(globRef);

                const result = emit(ir);
                const allContent = result.files.map((f) => f.content).join('\n');

                // Should contain @folder reference
                assert.ok(
                    allContent.includes('@'),
                    `Iteration ${i}: Glob must translate to @ reference`
                );
                // Should not contain raw Glob( syntax in process
                const processContent = allContent.split('## Process')[1] || '';
                assert.ok(
                    !processContent.match(/\bGlob\s*\(/),
                    `Iteration ${i}: output must not contain raw Glob() syntax`
                );
            }
        });

        it('no raw Claude Code tool syntax in emitted output', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIRWithAllTools();
                const result = emit(ir);

                for (const file of result.files) {
                    // Extract only the body after the header
                    const processContent =
                        file.content.split('## Process')[1] || '';
                    for (const pattern of RAW_TOOL_PATTERNS) {
                        assert.ok(
                            !pattern.test(processContent),
                            `Iteration ${i}: file ${file.relativePath} contains ` +
                            `raw tool syntax matching ${pattern}`
                        );
                    }
                }
            }
        });
    });

    /**
     * **Property 6: Path reference integrity**
     *
     * All references to project documents SHALL use workspace-relative
     * `context/` paths, and all generated file paths SHALL be contained
     * within `.awos-adapters/`.
     *
     * Validates: Requirements 5.4
     */
    describe('Property 6: Path reference integrity', () => {
        it('all generated file paths are within .awos-adapters/', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                const result = emit(ir);

                for (const file of result.files) {
                    // relativePath is relative to .awos-adapters/cursor/
                    // so it should start with rules/
                    assert.ok(
                        file.relativePath.startsWith('rules/'),
                        `Iteration ${i}: path ${file.relativePath} must start ` +
                        `with rules/`
                    );
                    // Should not escape the adapter directory
                    assert.ok(
                        !file.relativePath.includes('..'),
                        `Iteration ${i}: path ${file.relativePath} must not ` +
                        `contain ..`
                    );
                }
            }
        });

        it('context references use workspace-relative context/ paths', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                // Ensure context files are set
                if (ir.io.contextFiles.length === 0) {
                    ir.io.contextFiles.push('context/spec/test/tasks.md');
                }
                const result = emit(ir);
                const allContent = result.files.map((f) => f.content).join('\n');

                // Find all @ references (context document references)
                const atRefs = allContent.match(/@[a-zA-Z][^\s)>]*/g) || [];
                for (const ref of atRefs) {
                    const path = ref.slice(1); // remove @
                    // Should be workspace-relative (no leading /, ./, or absolute)
                    assert.ok(
                        !path.startsWith('/'),
                        `Iteration ${i}: @-ref "${ref}" must not use absolute path`
                    );
                    assert.ok(
                        !path.startsWith('./'),
                        `Iteration ${i}: @-ref "${ref}" must not use ./ prefix`
                    );
                }
            }
        });
    });

    /**
     * **Property 7: File size invariant**
     *
     * No generated output file SHALL exceed 500 lines.
     *
     * Validates: Requirements 5.4 (implicit from 12.1)
     */
    describe('Property 7: File size invariant', () => {
        it('no output file exceeds 500 lines', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                const result = emit(ir);

                for (const file of result.files) {
                    const lineCount = file.content.split('\n').length;
                    assert.ok(
                        lineCount <= 500,
                        `Iteration ${i}: file ${file.relativePath} has ` +
                        `${lineCount} lines, exceeds 500-line limit`
                    );
                }
            }
        });

        it('large IRs with many steps still produce files under limit', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                // Add many process steps to push toward the limit
                const extraSteps = randomInt(5, 15);
                for (let s = 0; s < extraSteps; s++) {
                    ir.process.steps.push(
                        randomProcessStep(ir.process.steps.length + 1)
                    );
                }

                const result = emit(ir);

                for (const file of result.files) {
                    const lineCount = file.content.split('\n').length;
                    assert.ok(
                        lineCount <= 500,
                        `Iteration ${i}: file ${file.relativePath} has ` +
                        `${lineCount} lines, exceeds 500-line limit`
                    );
                }
            }
        });
    });

    /**
     * **Property 8: Process step encoding**
     *
     * For any CommandIR with N process steps, the Cursor emitter SHALL
     * produce output where each process step is addressable as an
     * individual unit.
     *
     * Validates: Requirements 9.2
     */
    describe('Property 8: Process step encoding', () => {
        it('each process step appears as an addressable unit', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                const stepCount = ir.process.steps.length;

                if (stepCount === 0) continue;

                const result = emit(ir);
                const allContent = result.files.map((f) => f.content).join('\n');

                // Each step should appear as a ### Step N heading
                for (const step of ir.process.steps) {
                    const stepHeading = `### Step ${step.stepNumber}`;
                    assert.ok(
                        allContent.includes(stepHeading),
                        `Iteration ${i}: missing step heading "${stepHeading}"`
                    );
                }

                // Count of step headings should match step count
                const stepMatches =
                    allContent.match(/### Step \d+/g) || [];
                assert.equal(
                    stepMatches.length,
                    stepCount,
                    `Iteration ${i}: expected ${stepCount} step headings, ` +
                    `found ${stepMatches.length}`
                );
            }
        });
    });

    /**
     * **Property 9: Delegation strategy correctness (Cursor)**
     *
     * When emitting Agent delegation calls, output SHALL use sequential
     * composer prompts with explicit context reloading per task and SHALL
     * include task completion tracking (marking checkboxes in tasks.md).
     *
     * Validates: Requirements 9.2, 9.4
     */
    describe('Property 9: Delegation strategy correctness (Cursor)', () => {
        it('delegations use sequential Composer prompts with context reloading', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                // Ensure at least one delegation
                const agentRef = randomToolReference('Agent');
                const stepIdx = randomInt(0, ir.process.steps.length);
                ir.process.steps[stepIdx].toolReferences.push(agentRef);
                ir.process.steps[stepIdx].body += '\n' + agentRef.context;
                ir.process.steps[stepIdx].delegations.push({
                    agentType: 'general-task-execution',
                    promptTemplate: `Execute ${randomWord()} task`,
                });
                ir.toolReferences.push(agentRef);

                const result = emit(ir);
                const allContent = result.files.map((f) => f.content).join('\n');

                // Must reference new Composer session
                assert.ok(
                    allContent.includes('Composer session') ||
                    allContent.includes('Composer'),
                    `Iteration ${i}: delegation must reference Composer session`
                );

                // Must include context reloading instruction (Load @context/)
                assert.ok(
                    allContent.includes('Load') || allContent.includes('@context'),
                    `Iteration ${i}: delegation must include context reloading`
                );
            }
        });

        it('delegations include task completion tracking (tasks.md checkbox)', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                // Ensure delegation
                const stepIdx = randomInt(0, ir.process.steps.length);
                ir.process.steps[stepIdx].delegations.push({
                    agentType: 'general-task-execution',
                    promptTemplate: `Do the ${randomWord()} step`,
                });

                const result = emit(ir);
                const allContent = result.files.map((f) => f.content).join('\n');

                // Must mention marking checkbox/tasks.md
                assert.ok(
                    allContent.includes('tasks.md') ||
                    allContent.includes('checkbox'),
                    `Iteration ${i}: delegation must reference task ` +
                    `completion tracking (tasks.md)`
                );
            }
        });
    });

    /**
     * **Property 11: Auto-generated header presence**
     *
     * Every file produced SHALL begin with a header comment stating
     * "Auto-generated by generate-adapters — do not edit manually".
     *
     * Validates: Requirements 14.3
     */
    describe('Property 11: Auto-generated header presence', () => {
        it('every generated file starts with the auto-generated header', () => {
            for (let i = 0; i < ITERATIONS; i++) {
                const ir = randomIR();
                const result = emit(ir);

                for (const file of result.files) {
                    assert.ok(
                        file.content.startsWith(MD_HEADER),
                        `Iteration ${i}: file ${file.relativePath} must start ` +
                        `with auto-generated header. Got: ` +
                        `"${file.content.slice(0, 80)}..."`
                    );
                }
            }
        });
    });
});
