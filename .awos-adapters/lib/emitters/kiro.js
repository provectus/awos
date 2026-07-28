'use strict';

/**
 * Kiro Emitter for the multi-IDE adapter layer.
 *
 * Translates parsed CommandIR objects into Kiro-native steering files
 * and hook definitions. Produces output in `.awos-adapters/kiro/steering/`
 * with invoke_sub_agent delegation and post-task-execution hooks.
 *
 * @module lib/emitters/kiro
 */

const {
    createEmitResult,
    createEmitWarning,
    createGeneratedFile,
    createDelegationStrategy,
    prependHeader,
    normalizeContextPath,
    DELEGATION_TYPES,
} = require('./base-emitter.js');
const { splitIfNeeded } = require('../splitter.js');

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

/** Output directory for Kiro steering files (relative to provider root). */
const STEERING_DIR = 'steering';

/** Output directory for Kiro hook definitions (relative to provider root). */
const HOOKS_DIR = 'hooks';

// ---------------------------------------------------------------------
// Tool Translation
// ---------------------------------------------------------------------

/**
 * Translate a Claude Code tool reference into Kiro-native syntax.
 *
 * @param {import('../ir.js').ToolReference} ref
 * @returns {string} Kiro-native instruction
 */
function translateToolReference(ref) {
    switch (ref.tool) {
        case 'Agent':
            return translateAgent(ref);
        case 'Read':
            return translateRead(ref);
        case 'Glob':
            return translateGlob(ref);
        case 'AskUserQuestion':
            return translateAskUser(ref);
        case 'Explore':
            return translateExplore(ref);
        case 'Plan':
            return translatePlan(ref);
        default:
            return `<!-- Unknown tool: ${ref.tool} -->`;
    }
}

/**
 * Translate Agent → invoke_sub_agent with general-task-execution.
 * @param {import('../ir.js').ToolReference} ref
 * @returns {string}
 */
function translateAgent(ref) {
    const agentType =
        ref.parameters.subagent_type ||
        ref.parameters._positional ||
        'general-task-execution';
    const desc = ref.parameters.description || '';
    const lines = [
        'Delegate to sub-agent (general-task-execution):',
        `  Agent type: ${agentType}`,
    ];
    if (desc) {
        lines.push(`  Description: ${desc}`);
    }
    lines.push(
        '  Use invoke_sub_agent with name "general-task-execution"'
    );
    return lines.join('\n');
}

/**
 * Translate Read → read_file tool.
 * @param {import('../ir.js').ToolReference} ref
 * @returns {string}
 */
function translateRead(ref) {
    const target =
        ref.parameters._positional || ref.parameters.path || '';
    if (target) {
        const normalized = normalizeContextPath(target);
        return `Use \`read_file\` tool to read: ${normalized}`;
    }
    return 'Use `read_file` tool to read the specified file';
}

/**
 * Translate Glob → file_search tool.
 * @param {import('../ir.js').ToolReference} ref
 * @returns {string}
 */
function translateGlob(ref) {
    const pattern =
        ref.parameters._positional || ref.parameters.pattern || '';
    if (pattern) {
        return `Use \`file_search\` tool with pattern: ${pattern}`;
    }
    return 'Use `file_search` tool to find matching files';
}

/**
 * Translate AskUserQuestion → plain-text chat prompt.
 * @param {import('../ir.js').ToolReference} ref
 * @returns {string}
 */
function translateAskUser(ref) {
    const question = ref.parameters._positional || '';
    if (question) {
        return `Ask the user directly in chat: "${question}"`;
    }
    return 'Ask the user directly in chat for their input';
}

/**
 * Translate Explore → context-gatherer agent.
 * @param {import('../ir.js').ToolReference} ref
 * @returns {string}
 */
function translateExplore(ref) {
    const target =
        ref.parameters._positional || ref.parameters.path || '';
    if (target) {
        return (
            `Use \`invoke_sub_agent\` with name "context-gatherer" ` +
            `to explore: ${target}`
        );
    }
    return (
        'Use `invoke_sub_agent` with name "context-gatherer" ' +
        'to investigate the codebase'
    );
}

/**
 * Translate Plan → task planning prompt.
 * @param {import('../ir.js').ToolReference} ref
 * @returns {string}
 */
function translatePlan(ref) {
    const goal = ref.parameters._positional || '';
    if (goal) {
        return `Create a task plan for: ${goal}`;
    }
    return 'Create a task plan for the current objective';
}

// ---------------------------------------------------------------------
// Delegation Strategy
// ---------------------------------------------------------------------

/**
 * Create the Kiro delegation strategy using invoke_sub_agent.
 * @returns {import('./base-emitter.js').DelegationStrategy}
 */
function createKiroDelegation() {
    return createDelegationStrategy(DELEGATION_TYPES.SUBAGENT, (del) => {
        const agent = del.agentType || 'general-task-execution';
        const prompt = del.promptTemplate || '';
        const lines = [
            'Delegate to sub-agent (general-task-execution):',
            `  Prompt: "${prompt}"`,
            `  Agent type: ${agent}`,
            '  Use invoke_sub_agent with name "general-task-execution"',
        ];
        return lines.join('\n');
    });
}

// ---------------------------------------------------------------------
// Steering File Generation
// ---------------------------------------------------------------------

/**
 * Generate the steering file content for a single CommandIR.
 *
 * @param {import('../ir.js').CommandIR} ir
 * @returns {string} Markdown content for the steering file
 */
function generateSteeringContent(ir) {
    const sections = [];

    // Title
    sections.push(`# ${ir.name}`);
    sections.push('');

    // Description from frontmatter
    if (ir.frontmatter.description) {
        sections.push(`> ${ir.frontmatter.description}`);
        sections.push('');
    }

    // Role section
    if (ir.role.title || ir.role.description) {
        sections.push('## Role');
        sections.push('');
        if (ir.role.title) {
            sections.push(`**${ir.role.title}**`);
            sections.push('');
        }
        if (ir.role.description) {
            sections.push(ir.role.description);
            sections.push('');
        }
        if (ir.role.rules.length > 0) {
            sections.push('### Rules');
            sections.push('');
            for (const rule of ir.role.rules) {
                sections.push(`- ${rule}`);
            }
            sections.push('');
        }
    }

    // Task section
    if (ir.task.goal || ir.task.body) {
        sections.push('## Task');
        sections.push('');
        if (ir.task.goal) {
            sections.push(ir.task.goal);
            sections.push('');
        }
    }

    // Context files
    if (ir.io.contextFiles.length > 0) {
        sections.push('## Context Files');
        sections.push('');
        for (const cf of ir.io.contextFiles) {
            const normalized = normalizeContextPath(cf);
            sections.push(`- ${normalized}`);
        }
        sections.push('');
    }

    // Process steps with translated tool references
    if (ir.process.steps.length > 0) {
        sections.push('## Process');
        sections.push('');
        for (const step of ir.process.steps) {
            sections.push(`### Step ${step.stepNumber}: ${step.title}`);
            sections.push('');
            sections.push(translateStepBody(step));
            sections.push('');
        }
    }

    // Delegation instructions for implement-style commands
    const delegations = collectDelegations(ir);
    if (delegations.length > 0) {
        sections.push('## Delegation');
        sections.push('');
        const strategy = createKiroDelegation();
        for (const del of delegations) {
            sections.push(strategy.translate(del));
            sections.push('');
        }
    }

    // Task completion tracking (Requirement 9.4)
    if (hasDelegations(ir)) {
        sections.push('## Task Completion');
        sections.push('');
        sections.push(
            'After each delegated task completes successfully:'
        );
        sections.push(
            '1. Read the `tasks.md` file from the spec directory'
        );
        sections.push(
            '2. Find the completed task line and change `[ ]` to `[x]`'
        );
        sections.push(
            '3. If all sibling tasks under a slice are complete, ' +
            'also mark the slice header'
        );
        sections.push('4. Save the modified file');
        sections.push('');
    }

    return sections.join('\n');
}

/**
 * Translate a process step body, replacing tool references with
 * Kiro-native equivalents.
 *
 * @param {import('../ir.js').ProcessStep} step
 * @returns {string}
 */
function translateStepBody(step) {
    const lines = [];

    // Include the original body
    if (step.body) {
        lines.push(step.body);
    }

    // Append translated tool references if present
    if (step.toolReferences.length > 0) {
        lines.push('');
        lines.push('**Kiro Tools:**');
        const seen = new Set();
        for (const ref of step.toolReferences) {
            const translated = translateToolReference(ref);
            if (!seen.has(translated)) {
                seen.add(translated);
                lines.push('');
                lines.push(translated);
            }
        }
    }

    // Append delegation instructions if present
    if (step.delegations.length > 0) {
        lines.push('');
        lines.push('**Delegation:**');
        const strategy = createKiroDelegation();
        for (const del of step.delegations) {
            lines.push('');
            lines.push(strategy.translate(del));
        }
    }

    return lines.join('\n');
}

/**
 * Collect all delegation calls from the IR.
 * @param {import('../ir.js').CommandIR} ir
 * @returns {import('./base-emitter.js').DelegationCall[]}
 */
function collectDelegations(ir) {
    const delegations = [];
    for (const step of ir.process.steps) {
        delegations.push(...step.delegations);
    }
    return delegations;
}

/**
 * Check if the IR contains any delegation calls.
 * @param {import('../ir.js').CommandIR} ir
 * @returns {boolean}
 */
function hasDelegations(ir) {
    return ir.process.steps.some((s) => s.delegations.length > 0);
}

// ---------------------------------------------------------------------
// Hook Generation
// ---------------------------------------------------------------------

/**
 * Generate hook definitions for workflow transitions.
 * Produces post-task-execution triggers (e.g., verify after implement).
 *
 * @param {import('../ir.js').CommandIR} ir
 * @returns {string|null} Hook definition content, or null if no hooks
 */
function generateHookContent(ir) {
    // Only generate hooks for commands that have delegation (implement)
    if (!hasDelegations(ir)) {
        return null;
    }

    const lines = [];
    lines.push(`# Hook: Post-Task Execution — ${ir.name}`);
    lines.push('');
    lines.push('## Trigger');
    lines.push('');
    lines.push('- **Event:** postTaskExecution');
    lines.push(`- **Source command:** ${ir.name}`);
    lines.push('');
    lines.push('## Action');
    lines.push('');
    lines.push(
        'After all tasks in the current spec are marked complete:'
    );
    lines.push('');
    lines.push(
        '1. Announce completion status with task count and percentage'
    );
    lines.push(
        '2. Suggest running the verify workflow to validate ' +
        'acceptance criteria'
    );
    lines.push(
        '3. If verify passes, mark the spec as Completed'
    );
    lines.push('');
    lines.push('## Context Files');
    lines.push('');
    for (const cf of ir.io.contextFiles) {
        const normalized = normalizeContextPath(cf);
        lines.push(`- ${normalized}`);
    }
    lines.push('');

    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Main Emit Function
// ---------------------------------------------------------------------

/**
 * Emit Kiro adapter files from a CommandIR.
 *
 * @param {import('../ir.js').CommandIR} ir - Parsed command
 * @param {Object} [options] - Emitter options
 * @param {number} [options.maxLines=500] - Max lines per file
 * @returns {import('./base-emitter.js').EmitResult}
 */
function emit(ir, options = {}) {
    const result = createEmitResult();
    const maxLines = options.maxLines || 500;

    // Generate steering file
    const steeringContent = generateSteeringContent(ir);
    const steeringWithHeader = prependHeader(steeringContent, 'md');
    const steeringFile = createGeneratedFile(
        `${STEERING_DIR}/${ir.name}.md`,
        steeringWithHeader
    );

    // Apply 500-line split if needed
    const steeringFiles = splitIfNeeded(steeringFile, maxLines);
    result.files.push(...steeringFiles);

    // Warn if approaching limit
    for (const f of steeringFiles) {
        if (f.lineCount > 400 && f.lineCount <= maxLines) {
            result.warnings.push(
                createEmitWarning(
                    `File approaching 500-line limit: ${f.relativePath} ` +
                    `(${f.lineCount} lines)`,
                    f.relativePath
                )
            );
        }
    }

    // Generate hook definition if applicable
    const hookContent = generateHookContent(ir);
    if (hookContent) {
        const hookWithHeader = prependHeader(hookContent, 'md');
        const hookFile = createGeneratedFile(
            `${HOOKS_DIR}/${ir.name}-post-task.md`,
            hookWithHeader
        );
        const hookFiles = splitIfNeeded(hookFile, maxLines);
        result.files.push(...hookFiles);
    }

    return result;
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = { emit };
