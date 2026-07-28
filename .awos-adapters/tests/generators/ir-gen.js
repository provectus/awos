'use strict';

/**
 * IR object generators for property-based tests.
 * Produces random valid CommandIR objects for round-trip testing.
 *
 * @module tests/generators/ir-gen
 */

const { createCommandIR, VALID_TOOLS } = require('../../lib/ir.js');

const COMMAND_NAMES = [
    'implement',
    'spec',
    'architecture',
    'verify',
    'tasks',
    'product',
    'roadmap',
    'hire',
    'tech',
];

const ROLE_TITLES = [
    'Lead Implementation Agent',
    'Specification Writer',
    'Architecture Reviewer',
    'Verification Agent',
    'Product Manager',
];

const DESCRIPTIONS = [
    'Runs tasks and delegates coding.',
    'Creates specifications from requirements.',
    'Reviews architecture decisions.',
    'Verifies completed work.',
    'Manages product priorities.',
];

const STEP_TITLES = [
    'Load Context',
    'Identify Target',
    'Delegate Work',
    'Verify Results',
    'Update Progress',
    'Gather Info',
    'Validate Output',
    'Report Summary',
];

const AGENT_TYPES = [
    'general-task-execution',
    'context-gatherer',
    'spec-task-execution',
];

const CONTEXT_PATHS = [
    'context/spec/tasks.md',
    'context/roadmap/roadmap.md',
    'context/architecture/decisions.md',
    'src/index.js',
];

const INPUT_NAMES = [
    'User Prompt',
    'Spec Path',
    'Task Index',
    'Feature Name',
];

const OUTPUT_NAMES = [
    'tasks.md',
    'functional-spec.md',
    'technical-considerations.md',
    'output.md',
];

const CONTEXT_FILE_PATHS = [
    'context/spec/[index]-[name]/tasks.md',
    'context/spec/[index]-[name]/functional-spec.md',
    'context/roadmap/roadmap.md',
];

/**
 * Generate a random valid ToolReference object.
 * @param {object} rng - Random number generator from PBT harness
 * @returns {object} A valid ToolReference
 */
function genToolRef(rng) {
    const tool = rng.pick(VALID_TOOLS);
    const lineNumber = rng.int(1, 200);
    const parameters = {};

    switch (tool) {
        case 'Agent':
            parameters.subagent_type = rng.pick(AGENT_TYPES);
            break;
        case 'Read':
            parameters.path = rng.pick(CONTEXT_PATHS);
            break;
        case 'Glob':
            parameters.pattern = rng.pick([
                '**/*.md',
                'context/**/*.md',
                'src/**/*.js',
            ]);
            break;
        case 'AskUserQuestion':
            parameters.question = 'What should we do?';
            break;
        case 'Explore':
            parameters.path = rng.pick(['src/', 'lib/', 'context/']);
            break;
        case 'Plan':
            parameters.description = 'Plan the approach';
            break;
    }

    return {
        tool,
        context: `${tool}(...)`,
        lineNumber,
        parameters,
    };
}

/**
 * Generate a random valid DelegationCall object.
 * @param {object} rng - Random number generator from PBT harness
 * @returns {object} A valid DelegationCall
 */
function genDelegation(rng) {
    return {
        agentType: rng.pick(AGENT_TYPES),
        promptTemplate: 'Execute the following task: {{task}}',
    };
}

/**
 * Generate a random valid ProcessStep object.
 * @param {object} rng - Random number generator from PBT harness
 * @param {number} stepNumber - The step number
 * @returns {object} A valid ProcessStep
 */
function genProcessStep(rng, stepNumber) {
    const refCount = rng.int(0, 3);
    const toolReferences = [];
    for (let i = 0; i < refCount; i++) {
        toolReferences.push(genToolRef(rng));
    }

    const delCount = rng.int(0, 2);
    const delegations = [];
    for (let i = 0; i < delCount; i++) {
        delegations.push(genDelegation(rng));
    }

    return {
        stepNumber,
        title: rng.pick(STEP_TITLES),
        body: 'Step body content with instructions.',
        toolReferences,
        delegations,
    };
}

/**
 * Generate a random valid CommandIR object.
 * Uses createCommandIR from lib/ir.js and populates all fields.
 * @param {object} rng - Random number generator from PBT harness
 * @returns {object} A valid CommandIR object
 */
function genIR(rng) {
    const name = rng.pick(COMMAND_NAMES);
    const ir = createCommandIR(name);

    // Frontmatter
    ir.frontmatter.description = rng.pick(DESCRIPTIONS);
    const hasHint = rng.int(0, 2) === 1;
    ir.frontmatter.argumentHint = hasHint ? 'spec name or path' : null;

    // Role
    ir.role.title = rng.pick(ROLE_TITLES);
    ir.role.description = `You are a ${ir.role.title}.`;
    const ruleCount = rng.int(0, 4);
    for (let i = 0; i < ruleCount; i++) {
        ir.role.rules.push(`Rule ${i + 1}: Follow best practices`);
    }

    // Task
    ir.task.goal = 'Execute pending work for the specification.';
    const hasBody = rng.int(0, 2) === 1;
    ir.task.body = hasBody ? 'Additional task context.' : '';

    // IO
    const inputCount = rng.int(1, 4);
    for (let i = 0; i < inputCount; i++) {
        ir.io.inputs.push({
            name: rng.pick(INPUT_NAMES),
            optional: rng.int(0, 2) === 1,
            source: '$ARGUMENTS',
        });
    }

    const outputCount = rng.int(1, 3);
    for (let i = 0; i < outputCount; i++) {
        ir.io.outputs.push({
            name: rng.pick(OUTPUT_NAMES),
            description: 'Updated with results',
        });
    }

    const ctxCount = rng.int(1, 3);
    for (let i = 0; i < ctxCount; i++) {
        ir.io.contextFiles.push(rng.pick(CONTEXT_FILE_PATHS));
    }

    // Interaction
    const toolCount = rng.int(1, 5);
    const tools = new Set();
    for (let i = 0; i < toolCount; i++) {
        tools.add(rng.pick(VALID_TOOLS));
    }
    ir.interaction.tools = [...tools];
    const hasNotes = rng.int(0, 2) === 1;
    ir.interaction.notes = hasNotes
        ? 'Use AskUserQuestion for clarifications.'
        : '';

    // Process
    const stepCount = rng.int(1, 5);
    for (let i = 0; i < stepCount; i++) {
        ir.process.steps.push(genProcessStep(rng, i + 1));
    }

    // Top-level tool references (aggregated from steps)
    const topRefCount = rng.int(1, 4);
    for (let i = 0; i < topRefCount; i++) {
        ir.toolReferences.push(genToolRef(rng));
    }

    return ir;
}

module.exports = {
    genIR,
};
