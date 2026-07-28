'use strict';

/**
 * Property-based tests for Phase 2 Emitters (Codex, Cline, Continue).
 *
 * Validates Properties 5, 6, 8, and 9 from the design document
 * against all three Phase 2 emitter implementations.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 7.2, 7.3, 8.2, 8.3, 8.4,
 *            9.2, 9.4
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { randomInt } = require('node:crypto');
const { createCommandIR, VALID_TOOLS } = require('../../lib/ir.js');
const { emit: emitCodex } = require('../../lib/emitters/codex.js');
const { emit: emitCline } = require('../../lib/emitters/cline.js');
const { emit: emitContinue } = require('../../lib/emitters/continue.js');

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const ITERATIONS = 100;

const RAW_TOOL_PATTERNS = [
    /\bAgent\s*\(/,
    /\bRead\s*\(/,
    /\bGlob\s*\(/,
    /\bAskUserQuestion\s*\(/,
    /\bExplore\s*\(/,
    /\bPlan\s*\(/,
];

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

// ---------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------

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
                agentType:
                    ref.parameters.subagent_type ||
                    'general-task-execution',
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
    ir.role.rules = [
        `Always ${randomWord()}`,
        `Never ${randomWord()}`,
    ];
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
    for (const tool of VALID_TOOLS) {
        if (!ir.toolReferences.some((r) => r.tool === tool)) {
            const ref = randomToolReference(tool);
            const stepIdx = randomInt(0, ir.process.steps.length);
            ir.process.steps[stepIdx].toolReferences.push(ref);
            ir.process.steps[stepIdx].body += '\n' + ref.context;
            if (tool === 'Agent') {
                ir.process.steps[stepIdx].delegations.push({
                    agentType:
                        ref.parameters.subagent_type ||
                        'general-task-execution',
                    promptTemplate: `Execute ${randomWord()} task`,
                });
            }
            ir.toolReferences.push(ref);
        }
    }
    return ir;
}

/**
 * Generate an IR that always includes delegations.
 */
function randomIRWithDelegation() {
    const ir = randomIR();
    const agentRef = randomToolReference('Agent');
    const stepIdx = randomInt(0, ir.process.steps.length);
    ir.process.steps[stepIdx].toolReferences.push(agentRef);
    ir.process.steps[stepIdx].body += '\n' + agentRef.context;
    ir.process.steps[stepIdx].delegations.push({
        agentType: 'general-task-execution',
        promptTemplate: `Execute ${randomWord()} task`,
    });
    ir.toolReferences.push(agentRef);
    return ir;
}

// ---------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------

describe('Phase 2 Emitter Properties', () => {
    /**
     * **Validates: Requirements 6.2, 7.2, 7.3, 8.2, 8.4**
     *
     * Property 5: Tool translation correctness per Provider
     * (Codex, Cline, Continue)
     *
     * For any IR containing Claude Code tool references, the emitted
     * output SHALL contain the Provider-native equivalent for each
     * tool reference and SHALL NOT contain raw Claude Code tool syntax.
     */
    describe('Property 5: Tool translation correctness', () => {
        describe('Codex', () => {
            it('Agent → codex --auto invocations', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitCodex(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        allContent.includes('codex --auto'),
                        `Iteration ${i}: Codex output must ` +
                        'contain codex --auto'
                    );
                }
            });

            it('Read → --context-file argument', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const readRef = randomToolReference('Read');
                    const stepIdx = randomInt(
                        0,
                        ir.process.steps.length
                    );
                    ir.process.steps[stepIdx].toolReferences.push(
                        readRef
                    );
                    ir.process.steps[stepIdx].body +=
                        '\n' + readRef.context;
                    ir.toolReferences.push(readRef);

                    const result = emitCodex(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        allContent.includes('--context-file'),
                        `Iteration ${i}: Read must translate ` +
                        'to --context-file'
                    );
                }
            });

            it('no raw Claude Code tool syntax in output', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithAllTools();
                    const result = emitCodex(ir);
                    for (const file of result.files) {
                        const taskSection =
                            file.content.split('## Tasks')[1] || '';
                        for (const pattern of RAW_TOOL_PATTERNS) {
                            assert.ok(
                                !pattern.test(taskSection),
                                `Iteration ${i}: Codex file ` +
                                `${file.relativePath} has ` +
                                `raw syntax: ${pattern}`
                            );
                        }
                    }
                }
            });
        });

        describe('Cline', () => {
            it('Agent → sequential task with memory bank', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitCline(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        allContent.includes('memory bank') ||
                        allContent.includes('memory-bank') ||
                        allContent.includes('Memory Bank') ||
                        allContent.includes('Memory bank'),
                        `Iteration ${i}: Cline output must ` +
                        'reference memory bank'
                    );
                    assert.ok(
                        allContent.includes('sequentially') ||
                        allContent.includes('Sequential') ||
                        allContent.includes('sequential'),
                        `Iteration ${i}: Cline must use ` +
                        'sequential delegation'
                    );
                }
            });

            it('Read → file read instruction', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const readRef = randomToolReference('Read');
                    const stepIdx = randomInt(
                        0,
                        ir.process.steps.length
                    );
                    ir.process.steps[stepIdx].toolReferences.push(
                        readRef
                    );
                    ir.process.steps[stepIdx].body +=
                        '\n' + readRef.context;
                    ir.toolReferences.push(readRef);

                    const result = emitCline(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        allContent.includes('Read the file') ||
                        allContent.includes(
                            'Read the specified file'
                        ),
                        `Iteration ${i}: Read must translate ` +
                        'to file read instruction'
                    );
                }
            });

            it('no raw Claude Code tool syntax in instructions', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithAllTools();
                    const result = emitCline(ir);
                    for (const file of result.files) {
                        // Cline appends translated tools under
                        // "Cline Instructions:" blocks
                        const blocks =
                            file.content.match(
                                /\*\*Cline Instructions:\*\*[\s\S]*?(?=\n###|\n##|$)/g
                            ) || [];
                        for (const block of blocks) {
                            for (const pattern of RAW_TOOL_PATTERNS) {
                                assert.ok(
                                    !pattern.test(block),
                                    `Iteration ${i}: Cline ` +
                                    `${file.relativePath}` +
                                    ` has raw syntax in ` +
                                    `instructions: ` +
                                    `${pattern}`
                                );
                            }
                        }
                    }
                }
            });
        });

        describe('Continue', () => {
            it('Agent → slash command iteration', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitContinue(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        allContent.includes('slash command') ||
                        allContent.includes('Slash command') ||
                        allContent.includes('Slash Command'),
                        `Iteration ${i}: Continue output must ` +
                        'reference slash command iteration'
                    );
                }
            });

            it('Read → context provider', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const readRef = randomToolReference('Read');
                    const stepIdx = randomInt(
                        0,
                        ir.process.steps.length
                    );
                    ir.process.steps[stepIdx].toolReferences.push(
                        readRef
                    );
                    ir.process.steps[stepIdx].body +=
                        '\n' + readRef.context;
                    ir.toolReferences.push(readRef);

                    const result = emitContinue(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        allContent.includes('Context provider') ||
                        allContent.includes(
                            'context provider'
                        ) ||
                        allContent.includes(
                            'Context Providers'
                        ),
                        `Iteration ${i}: Read must translate ` +
                        'to context provider'
                    );
                }
            });

            it('no raw Claude Code tool syntax in output', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithAllTools();
                    const result = emitContinue(ir);
                    for (const file of result.files) {
                        const processSection =
                            file.content.split('## Process')[1] ||
                            '';
                        for (const pattern of RAW_TOOL_PATTERNS) {
                            assert.ok(
                                !pattern.test(processSection),
                                `Iteration ${i}: Continue file ` +
                                `${file.relativePath} has ` +
                                `raw syntax: ${pattern}`
                            );
                        }
                    }
                }
            });
        });
    });

    /**
     * **Validates: Requirements 6.3, 8.3**
     *
     * Property 6: Path reference integrity
     *
     * All references SHALL use workspace-relative `context/` paths,
     * and all generated file paths SHALL be contained within
     * `.awos-adapters/`.
     */
    describe('Property 6: Path reference integrity', () => {
        describe('Codex', () => {
            it('generated file paths are within tasks/', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const result = emitCodex(ir);
                    for (const file of result.files) {
                        assert.ok(
                            file.relativePath.startsWith('tasks/'),
                            `Iteration ${i}: Codex path ` +
                            `"${file.relativePath}" must ` +
                            'start with tasks/'
                        );
                        assert.ok(
                            !file.relativePath.includes('..'),
                            `Iteration ${i}: path must not ` +
                            'contain ..'
                        );
                    }
                }
            });

            it('context refs use workspace-relative paths', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    if (ir.io.contextFiles.length === 0) {
                        ir.io.contextFiles.push(
                            'context/spec/test/tasks.md'
                        );
                    }
                    const result = emitCodex(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        !allContent.includes('/home/'),
                        `Iteration ${i}: no absolute paths`
                    );
                    assert.ok(
                        !allContent.includes('/Users/'),
                        `Iteration ${i}: no absolute paths`
                    );
                    for (const cf of ir.io.contextFiles) {
                        assert.ok(
                            allContent.includes(cf),
                            `Iteration ${i}: must reference ` +
                            `${cf}`
                        );
                    }
                }
            });
        });

        describe('Cline', () => {
            it('paths are within rules/ or memory-bank/', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const result = emitCline(ir);
                    for (const file of result.files) {
                        assert.ok(
                            file.relativePath.startsWith(
                                'rules/'
                            ) ||
                            file.relativePath.startsWith(
                                'memory-bank/'
                            ),
                            `Iteration ${i}: Cline path ` +
                            `"${file.relativePath}" must ` +
                            'start with rules/ or ' +
                            'memory-bank/'
                        );
                        assert.ok(
                            !file.relativePath.includes('..'),
                            `Iteration ${i}: path must not ` +
                            'contain ..'
                        );
                    }
                }
            });

            it('context refs use workspace-relative paths', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    if (ir.io.contextFiles.length === 0) {
                        ir.io.contextFiles.push(
                            'context/spec/test/tasks.md'
                        );
                    }
                    const result = emitCline(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        !allContent.includes('/home/'),
                        `Iteration ${i}: no absolute paths`
                    );
                    assert.ok(
                        !allContent.includes('/Users/'),
                        `Iteration ${i}: no absolute paths`
                    );
                    for (const cf of ir.io.contextFiles) {
                        assert.ok(
                            allContent.includes(cf),
                            `Iteration ${i}: must reference ` +
                            `${cf}`
                        );
                    }
                }
            });
        });

        describe('Continue', () => {
            it('generated file paths are within config/', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const result = emitContinue(ir);
                    for (const file of result.files) {
                        assert.ok(
                            file.relativePath.startsWith(
                                'config/'
                            ),
                            `Iteration ${i}: Continue path ` +
                            `"${file.relativePath}" must ` +
                            'start with config/'
                        );
                        assert.ok(
                            !file.relativePath.includes('..'),
                            `Iteration ${i}: path must not ` +
                            'contain ..'
                        );
                    }
                }
            });

            it('context refs use workspace-relative paths', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    if (ir.io.contextFiles.length === 0) {
                        ir.io.contextFiles.push(
                            'context/spec/test/tasks.md'
                        );
                    }
                    const result = emitContinue(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');
                    assert.ok(
                        !allContent.includes('/home/'),
                        `Iteration ${i}: no absolute paths`
                    );
                    assert.ok(
                        !allContent.includes('/Users/'),
                        `Iteration ${i}: no absolute paths`
                    );
                    for (const cf of ir.io.contextFiles) {
                        assert.ok(
                            allContent.includes(cf),
                            `Iteration ${i}: must reference ` +
                            `${cf}`
                        );
                    }
                }
            });
        });
    });

    /**
     * **Validates: Requirements 6.4**
     *
     * Property 8: Process step encoding
     *
     * For any CommandIR with N process steps, each emitter SHALL
     * produce output where each process step is addressable as an
     * individual unit.
     */
    describe('Property 8: Process step encoding', () => {
        describe('Codex', () => {
            it('each step as ### Task N: heading', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const stepCount = ir.process.steps.length;
                    if (stepCount === 0) continue;

                    const result = emitCodex(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    for (const step of ir.process.steps) {
                        const heading =
                            `### Task ${step.stepNumber}:`;
                        assert.ok(
                            allContent.includes(heading),
                            `Iteration ${i}: missing ` +
                            `"${heading}"`
                        );
                    }

                    const matches =
                        allContent.match(/### Task \d+:/g) || [];
                    assert.equal(
                        matches.length,
                        stepCount,
                        `Iteration ${i}: expected ` +
                        `${stepCount} Task headings, ` +
                        `found ${matches.length}`
                    );
                }
            });
        });

        describe('Cline', () => {
            it('each step as ### Step N: heading', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const stepCount = ir.process.steps.length;
                    if (stepCount === 0) continue;

                    const result = emitCline(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    for (const step of ir.process.steps) {
                        const heading =
                            `### Step ${step.stepNumber}:`;
                        assert.ok(
                            allContent.includes(heading),
                            `Iteration ${i}: missing ` +
                            `"${heading}"`
                        );
                    }

                    const matches =
                        allContent.match(/### Step \d+:/g) || [];
                    assert.equal(
                        matches.length,
                        stepCount,
                        `Iteration ${i}: expected ` +
                        `${stepCount} Step headings, ` +
                        `found ${matches.length}`
                    );
                }
            });
        });

        describe('Continue', () => {
            it('each step as ### Step N: heading', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIR();
                    const stepCount = ir.process.steps.length;
                    if (stepCount === 0) continue;

                    const result = emitContinue(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    for (const step of ir.process.steps) {
                        const heading =
                            `### Step ${step.stepNumber}:`;
                        assert.ok(
                            allContent.includes(heading),
                            `Iteration ${i}: missing ` +
                            `"${heading}"`
                        );
                    }

                    const matches =
                        allContent.match(/### Step \d+:/g) || [];
                    assert.equal(
                        matches.length,
                        stepCount,
                        `Iteration ${i}: expected ` +
                        `${stepCount} Step headings, ` +
                        `found ${matches.length}`
                    );
                }
            });
        });
    });

    /**
     * **Validates: Requirements 9.2, 9.4**
     *
     * Property 9: Delegation strategy correctness
     * (Codex, Cline, Continue)
     *
     * When emitting Agent delegation calls, output SHALL use the
     * Provider's designated delegation pattern and SHALL include
     * task completion tracking (marking checkboxes in tasks.md).
     */
    describe('Property 9: Delegation strategy correctness', () => {
        describe('Codex', () => {
            it('uses codex --auto with --context-file', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitCodex(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    assert.ok(
                        allContent.includes('codex --auto'),
                        `Iteration ${i}: must use ` +
                        'codex --auto'
                    );
                    assert.ok(
                        allContent.includes('--context-file'),
                        `Iteration ${i}: must include ` +
                        '--context-file'
                    );
                }
            });

            it('includes task completion tracking', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitCodex(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    assert.ok(
                        allContent.includes('tasks.md'),
                        `Iteration ${i}: must reference ` +
                        'tasks.md'
                    );
                    assert.ok(
                        allContent.includes('[ ]') ||
                        allContent.includes('[x]') ||
                        allContent.includes('checkbox'),
                        `Iteration ${i}: must include ` +
                        'checkbox marking'
                    );
                }
            });
        });

        describe('Cline', () => {
            it('uses sequential + memory bank pattern', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitCline(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    assert.ok(
                        allContent.includes('memory bank') ||
                        allContent.includes('memory-bank') ||
                        allContent.includes('Memory Bank') ||
                        allContent.includes('Memory bank'),
                        `Iteration ${i}: must reference ` +
                        'memory bank'
                    );
                    assert.ok(
                        allContent.includes('sequentially') ||
                        allContent.includes('Sequential') ||
                        allContent.includes('sequential'),
                        `Iteration ${i}: must use ` +
                        'sequential pattern'
                    );
                }
            });

            it('includes task completion tracking', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitCline(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    assert.ok(
                        allContent.includes('tasks.md'),
                        `Iteration ${i}: must reference ` +
                        'tasks.md'
                    );
                    assert.ok(
                        allContent.includes('[ ]') ||
                        allContent.includes('[x]') ||
                        allContent.includes('checkbox'),
                        `Iteration ${i}: must include ` +
                        'checkbox marking'
                    );
                }
            });
        });

        describe('Continue', () => {
            it('uses slash command iteration', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitContinue(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    assert.ok(
                        allContent.includes('slash command') ||
                        allContent.includes('Slash command') ||
                        allContent.includes('Slash Command'),
                        `Iteration ${i}: must use slash ` +
                        'command iteration'
                    );
                    assert.ok(
                        allContent.includes(
                            'individual prompt'
                        ) ||
                        allContent.includes(
                            'individual Prompt'
                        ),
                        `Iteration ${i}: must send each ` +
                        'task as individual prompt'
                    );
                }
            });

            it('includes task completion tracking', () => {
                for (let i = 0; i < ITERATIONS; i++) {
                    const ir = randomIRWithDelegation();
                    const result = emitContinue(ir);
                    const allContent = result.files
                        .map((f) => f.content)
                        .join('\n');

                    assert.ok(
                        allContent.includes('tasks.md'),
                        `Iteration ${i}: must reference ` +
                        'tasks.md'
                    );
                    assert.ok(
                        allContent.includes('[ ]') ||
                        allContent.includes('[x]') ||
                        allContent.includes('checkbox'),
                        `Iteration ${i}: must include ` +
                        'checkbox marking'
                    );
                }
            });
        });
    });
});
