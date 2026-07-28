'use strict';

/**
 * Command markdown generators for property-based tests.
 * Produces random valid AWOS command markdown structures.
 *
 * @module tests/generators/command-gen
 */

const VALID_TOOLS = [
    'Agent',
    'Read',
    'Glob',
    'AskUserQuestion',
    'Explore',
    'Plan',
];

const ROLE_TITLES = [
    'Lead Implementation Agent',
    'Specification Writer',
    'Architecture Reviewer',
    'Product Manager',
    'Technical Lead',
    'Verification Agent',
];

const DESCRIPTIONS = [
    'Runs tasks and delegates coding to sub-agents.',
    'Creates specifications from user requirements.',
    'Reviews architecture decisions for consistency.',
    'Manages product roadmap and priorities.',
    'Leads technical design and implementation.',
    'Verifies completed work meets acceptance criteria.',
];

const ARGUMENT_HINTS = [
    null,
    'spec name or path',
    'task number',
    'feature description',
    'file pattern',
];

const STEP_TITLES = [
    'Load Context',
    'Identify Target Specification',
    'Delegate Implementation',
    'Verify Results',
    'Update Progress',
    'Gather Requirements',
    'Run Validation',
    'Report Summary',
];

const INPUT_NAMES = [
    'User Prompt',
    'Spec Path',
    'Task Index',
    'Feature Name',
    'Target File',
];

const OUTPUT_NAMES = [
    'tasks.md',
    'functional-spec.md',
    'technical-considerations.md',
    'progress-report.md',
    'output.md',
];

const CONTEXT_PATHS = [
    'context/spec/[index]-[name]/tasks.md',
    'context/spec/[index]-[name]/functional-spec.md',
    'context/spec/[index]-[name]/technical-considerations.md',
    'context/roadmap/roadmap.md',
    'context/architecture/decisions.md',
];

const AGENT_TYPES = [
    'general-task-execution',
    'context-gatherer',
    'spec-task-execution',
    'requirement-detailer',
];

const GLOB_PATTERNS = [
    '**/*.md',
    'context/**/*.md',
    'src/**/*.js',
    '**/*.test.js',
];

const READ_PATHS = [
    'context/spec/tasks.md',
    'context/roadmap/roadmap.md',
    'context/architecture/decisions.md',
    'src/index.js',
];

const QUESTIONS = [
    'What should we do next?',
    'Which spec do you want to implement?',
    'Should I proceed with these changes?',
    'Do you want to continue?',
];

const EXPLORE_PATHS = ['src/module/', 'lib/', 'context/', 'tests/'];

const PLAN_DESCRIPTIONS = [
    'Plan the implementation approach',
    'Outline refactoring strategy',
    'Design the test coverage',
];

/**
 * Generate a random valid tool reference string.
 * @param {object} rng - Random number generator from PBT harness
 * @param {string} [tool] - Specific tool to generate for
 * @returns {string} A valid tool call syntax string
 */
function genToolReference(rng, tool) {
    const t = tool || rng.pick(VALID_TOOLS);
    switch (t) {
        case 'Agent': {
            const agentType = rng.pick(AGENT_TYPES);
            const hasDesc = rng.int(0, 2) === 1;
            if (hasDesc) {
                return (
                    `Agent(subagent_type=${agentType},` +
                    ` description="Execute task")`
                );
            }
            return `Agent(subagent_type=${agentType})`;
        }
        case 'Read':
            return `Read(${rng.pick(READ_PATHS)})`;
        case 'Glob':
            return `Glob(${rng.pick(GLOB_PATTERNS)})`;
        case 'AskUserQuestion':
            return `AskUserQuestion("${rng.pick(QUESTIONS)}")`;
        case 'Explore':
            return `Explore(${rng.pick(EXPLORE_PATHS)})`;
        case 'Plan':
            return `Plan("${rng.pick(PLAN_DESCRIPTIONS)}")`;
        default:
            return `Read(${rng.pick(READ_PATHS)})`;
    }
}

/**
 * Generate random valid YAML frontmatter.
 * @param {object} rng - Random number generator from PBT harness
 * @returns {string} YAML frontmatter block including --- delimiters
 */
function genFrontmatter(rng) {
    const desc = rng.pick(DESCRIPTIONS);
    const hint = rng.pick(ARGUMENT_HINTS);
    let fm = '---\n';
    fm += `description: ${desc}\n`;
    if (hint !== null) {
        fm += `argument-hint: ${hint}\n`;
    }
    fm += '---\n';
    return fm;
}

/**
 * Generate a random markdown section with optional tool references.
 * @param {object} rng - Random number generator from PBT harness
 * @param {string} name - Section name (ROLE, TASK, etc.)
 * @returns {string} Markdown section content
 */
function genSection(rng, name) {
    switch (name) {
        case 'ROLE':
            return genRoleSection(rng);
        case 'TASK':
            return genTaskSection(rng);
        case 'INPUTS & OUTPUTS':
            return genIOSection(rng);
        case 'INTERACTION':
            return genInteractionSection(rng);
        case 'PROCESS':
            return genProcessSection(rng);
        default:
            return `# ${name}\n\nContent for ${name}.\n`;
    }
}

/**
 * @param {object} rng
 * @returns {string}
 */
function genRoleSection(rng) {
    const title = rng.pick(ROLE_TITLES);
    const ruleCount = rng.int(1, 4);
    let section = `# ROLE\n\nYou are a ${title}.\n\n## Rules\n`;
    for (let i = 0; i < ruleCount; i++) {
        section += `- Rule ${i + 1}: Follow best practices\n`;
    }
    return section;
}

/**
 * @param {object} rng
 * @returns {string}
 */
function genTaskSection(rng) {
    const goals = [
        'Execute pending work for a specification.',
        'Create a new specification from requirements.',
        'Review and verify completed tasks.',
        'Design the architecture for a feature.',
    ];
    const goal = rng.pick(goals);
    const hasBody = rng.int(0, 2) === 1;
    let section = `# TASK\n\n${goal}\n`;
    if (hasBody) {
        section += '\nAdditional context and instructions.\n';
    }
    return section;
}

/**
 * @param {object} rng
 * @returns {string}
 */
function genIOSection(rng) {
    const inputCount = rng.int(1, 4);
    const outputCount = rng.int(1, 3);
    const contextCount = rng.int(1, 4);

    let section = '# INPUTS & OUTPUTS\n\n## Inputs\n';
    for (let i = 0; i < inputCount; i++) {
        const name = rng.pick(INPUT_NAMES);
        const optional = rng.int(0, 2) === 1 ? '(optional) ' : '';
        section += `- **${name}** ${optional}— $ARGUMENTS\n`;
    }

    section += '\n## Outputs\n';
    for (let i = 0; i < outputCount; i++) {
        const name = rng.pick(OUTPUT_NAMES);
        section += `- **${name}** — Updated with results\n`;
    }

    section += '\n## Context Files\n';
    for (let i = 0; i < contextCount; i++) {
        section += `- ${rng.pick(CONTEXT_PATHS)}\n`;
    }

    return section;
}

/**
 * @param {object} rng
 * @returns {string}
 */
function genInteractionSection(rng) {
    const toolCount = rng.int(1, 5);
    const tools = [];
    for (let i = 0; i < toolCount; i++) {
        const t = rng.pick(VALID_TOOLS);
        if (!tools.includes(t)) {
            tools.push(t);
        }
    }

    let section = '# INTERACTION\n\n## Tools\n';
    for (const t of tools) {
        section += `- ${t}\n`;
    }
    const hasNotes = rng.int(0, 2) === 1;
    if (hasNotes) {
        section += '\n## Notes\nUse AskUserQuestion for clarifications.\n';
    }
    return section;
}

/**
 * @param {object} rng
 * @returns {string}
 */
function genProcessSection(rng) {
    const stepCount = rng.int(1, 5);
    let section = '# PROCESS\n';

    for (let i = 0; i < stepCount; i++) {
        const title = rng.pick(STEP_TITLES);
        section += `\n## Step ${i + 1}: ${title}\n\n`;
        section += 'Body content for this step.\n';

        // Add tool references in some steps
        const refCount = rng.int(0, 3);
        for (let j = 0; j < refCount; j++) {
            section += `\nUse ${genToolReference(rng)} here.\n`;
        }
    }

    return section;
}

/**
 * Generate a complete valid AWOS command markdown file.
 * @param {object} rng - Random number generator from PBT harness
 * @returns {string} Complete markdown command file content
 */
function genCommandMarkdown(rng) {
    let md = genFrontmatter(rng);
    md += '\n';
    md += genSection(rng, 'ROLE');
    md += '\n';
    md += genSection(rng, 'TASK');
    md += '\n';
    md += genSection(rng, 'INPUTS & OUTPUTS');
    md += '\n';
    md += genSection(rng, 'INTERACTION');
    md += '\n';
    md += genSection(rng, 'PROCESS');
    return md;
}

/**
 * Generate a command file with specific structural defects.
 * @param {object} rng - Random number generator from PBT harness
 * @returns {{content: string, defect: string}} Malformed content and defect description
 */
function genMalformedCommand(rng) {
    const defects = [
        'missing-role',
        'missing-task',
        'missing-process',
        'invalid-frontmatter',
        'empty-file',
        'no-frontmatter',
    ];
    const defect = rng.pick(defects);

    switch (defect) {
        case 'missing-role': {
            let md = genFrontmatter(rng);
            md += '\n';
            md += genSection(rng, 'TASK');
            md += '\n';
            md += genSection(rng, 'INPUTS & OUTPUTS');
            md += '\n';
            md += genSection(rng, 'INTERACTION');
            md += '\n';
            md += genSection(rng, 'PROCESS');
            return { content: md, defect };
        }
        case 'missing-task': {
            let md = genFrontmatter(rng);
            md += '\n';
            md += genSection(rng, 'ROLE');
            md += '\n';
            md += genSection(rng, 'INPUTS & OUTPUTS');
            md += '\n';
            md += genSection(rng, 'INTERACTION');
            md += '\n';
            md += genSection(rng, 'PROCESS');
            return { content: md, defect };
        }
        case 'missing-process': {
            let md = genFrontmatter(rng);
            md += '\n';
            md += genSection(rng, 'ROLE');
            md += '\n';
            md += genSection(rng, 'TASK');
            md += '\n';
            md += genSection(rng, 'INPUTS & OUTPUTS');
            md += '\n';
            md += genSection(rng, 'INTERACTION');
            return { content: md, defect };
        }
        case 'invalid-frontmatter': {
            let md = '---\n';
            md += 'description: [invalid: yaml: {{{\n';
            md += '---\n\n';
            md += genSection(rng, 'ROLE');
            md += '\n';
            md += genSection(rng, 'TASK');
            md += '\n';
            md += genSection(rng, 'PROCESS');
            return { content: md, defect };
        }
        case 'empty-file':
            return { content: '', defect };
        case 'no-frontmatter': {
            let md = genSection(rng, 'ROLE');
            md += '\n';
            md += genSection(rng, 'TASK');
            md += '\n';
            md += genSection(rng, 'PROCESS');
            return { content: md, defect };
        }
        default:
            return { content: '', defect: 'empty-file' };
    }
}

module.exports = {
    genFrontmatter,
    genSection,
    genCommandMarkdown,
    genMalformedCommand,
    genToolReference,
};
