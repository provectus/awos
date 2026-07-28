'use strict';

/**
 * Continue Emitter for the multi-IDE adapter layer.
 *
 * Translates CommandIR into Continue-native custom slash command
 * definitions and context provider configurations. Uses the sequential
 * delegation strategy — a custom slash command iterating tasks as
 * individual prompts.
 *
 * Output lands in `.awos-adapters/continue/config/{command}.md`.
 *
 * @module lib/emitters/continue
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

const CONFIG_DIR = 'config';
const MAX_LINES = 500;

// ---------------------------------------------------------------------
// Tool Translation
// ---------------------------------------------------------------------

/**
 * Translate a Read tool reference to a Continue context provider.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateRead(ref) {
    const p = ref.parameters._positional || ref.parameters.path || '';
    if (p) {
        const normalized = normalizeContextPath(p);
        return `Context provider: load \`${normalized}\``;
    }
    return 'Context provider: load the specified file';
}

/**
 * Translate a Glob tool reference to a Continue context provider glob.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateGlob(ref) {
    const pattern =
        ref.parameters._positional || ref.parameters.pattern || '';
    if (pattern) {
        return `Context provider glob: \`${pattern}\``;
    }
    return 'Context provider glob: match relevant files';
}

/**
 * Translate an Agent tool reference to slash command iteration.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateAgent(ref) {
    const agentType =
        ref.parameters.subagent_type ||
        ref.parameters._positional ||
        'general-task-execution';
    return (
        `Slash command iteration (agent: ${agentType}): ` +
        'send each task as an individual prompt in sequence.'
    );
}

/**
 * Translate a single tool reference to Continue-native syntax.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateToolReference(ref) {
    switch (ref.tool) {
        case 'Read':
            return translateRead(ref);
        case 'Glob':
            return translateGlob(ref);
        case 'Agent':
            return translateAgent(ref);
        case 'AskUserQuestion': {
            const q =
                ref.parameters._positional || ref.parameters.question || '';
            return q
                ? `Slash command prompt: "${q}"`
                : 'Slash command prompt: ask the user for input.';
        }
        case 'Explore': {
            const t =
                ref.parameters._positional || ref.parameters.target || '';
            return t
                ? `Context gather prompt: explore "${t}"`
                : 'Context gather prompt: explore the relevant codebase.';
        }
        case 'Plan': {
            const g =
                ref.parameters._positional || ref.parameters.goal || '';
            return g
                ? `Planning slash command: "${g}"`
                : 'Planning slash command: plan the next steps.';
        }
        default:
            return ref.context;
    }
}

// ---------------------------------------------------------------------
// Context Provider Section Builder
// ---------------------------------------------------------------------

/**
 * Build the context providers section that auto-injects context/
 * documents based on the active command.
 * @param {string[]} contextFiles
 * @returns {string}
 */
function buildContextProviders(contextFiles) {
    const lines = [
        '## Context Providers',
        '',
        'The following context documents are automatically injected ' +
        'when this slash command is active:',
        '',
    ];

    if (contextFiles.length > 0) {
        for (const cf of contextFiles) {
            const normalized = normalizeContextPath(cf);
            lines.push(`- \`${normalized}\``);
        }
    } else {
        lines.push('- `context/spec/[spec-name]/tasks.md`');
    }
    lines.push('');
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Delegation Section Builder
// ---------------------------------------------------------------------

/**
 * Build the delegation strategy section for Continue (sequential slash
 * command iteration). Each delegated task becomes an individual prompt.
 * @param {DelegationCall[]} delegations
 * @param {string[]} contextFiles
 * @returns {string}
 */
function buildDelegationSection(delegations, contextFiles) {
    const lines = [
        '### Task Delegation (Slash Command Iteration)',
        '',
        'For each delegated task, send an individual prompt with the ' +
        'following context injected:',
        '',
    ];

    if (contextFiles.length > 0) {
        for (const cf of contextFiles) {
            lines.push(`1. Load \`${normalizeContextPath(cf)}\``);
        }
    } else {
        lines.push('1. Load `context/spec/[spec-name]/tasks.md`');
    }

    lines.push('2. Provide the task description as an individual prompt');
    lines.push(
        '3. After completion, mark the checkbox in tasks.md ' +
        'before proceeding to the next task'
    );
    lines.push('');

    if (delegations.length > 0) {
        lines.push('#### Delegated Tasks');
        lines.push('');
        for (const del of delegations) {
            const agent = del.agentType || 'general-task-execution';
            const prompt = del.promptTemplate
                ? `: ${del.promptTemplate}`
                : '';
            lines.push(`- **${agent}**${prompt}`);
        }
        lines.push('');
    }

    lines.push(
        '> **Task Completion:** After each task prompt completes, ' +
        'mark its checkbox in `tasks.md` to track progress.'
    );
    lines.push('');
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Slash Command Definition Builder
// ---------------------------------------------------------------------

/**
 * Build the custom slash command definition section.
 * @param {CommandIR} ir
 * @returns {string}
 */
function buildSlashCommandDefinition(ir) {
    const desc = ir.frontmatter.description || `Run the ${ir.name} workflow`;
    const lines = [
        '## Slash Command Definition',
        '',
        `- **Name:** \`/${ir.name}\``,
        `- **Description:** ${desc}`,
    ];

    if (ir.frontmatter.argumentHint) {
        lines.push(`- **Argument hint:** ${ir.frontmatter.argumentHint}`);
    }

    lines.push('');
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Config File Generation
// ---------------------------------------------------------------------

/**
 * Build the content of a Continue config file for a command.
 * @param {CommandIR} ir
 * @returns {string}
 */
function buildConfigContent(ir) {
    const lines = [];

    lines.push(`# ${ir.name}`);
    lines.push('');

    // Slash command definition
    lines.push(buildSlashCommandDefinition(ir));

    // Role
    if (ir.role.title) {
        lines.push(`## Role: ${ir.role.title}`);
        lines.push('');
        if (ir.role.description) {
            lines.push(ir.role.description);
            lines.push('');
        }
        if (ir.role.rules.length > 0) {
            lines.push('### Rules');
            lines.push('');
            for (const rule of ir.role.rules) {
                lines.push(`- ${rule}`);
            }
            lines.push('');
        }
    }

    // Task
    if (ir.task.goal) {
        lines.push('## Task');
        lines.push('');
        lines.push(ir.task.goal);
        lines.push('');
    }

    // Context providers (auto-inject context/ docs)
    const contextFiles = ir.io.contextFiles || [];
    lines.push(buildContextProviders(contextFiles));

    // Process steps — each step is an individual prompt unit
    if (ir.process.steps.length > 0) {
        lines.push('## Process');
        lines.push('');
        lines.push(
            'Each process step is addressable as an individual prompt:'
        );
        lines.push('');
        for (const step of ir.process.steps) {
            lines.push(
                `### Step ${step.stepNumber}: ${step.title}`
            );
            lines.push('');
            lines.push(translateStepBody(step));
            lines.push('');
            if (step.delegations.length > 0) {
                lines.push(
                    buildDelegationSection(step.delegations, contextFiles)
                );
            }
        }
    }

    // Interaction
    if (ir.interaction.notes) {
        lines.push('## Interaction');
        lines.push('');
        lines.push(translateInteractionNotes(ir.interaction));
        lines.push('');
    }

    // Task completion tracking (Requirement 9.4)
    if (hasDelegations(ir)) {
        lines.push('## Task Completion Tracking');
        lines.push('');
        lines.push(
            'After each delegated task prompt completes successfully:'
        );
        lines.push('');
        lines.push(
            '1. Read `tasks.md` from the spec directory'
        );
        lines.push(
            '2. Find the completed task and change `[ ]` to `[x]`'
        );
        lines.push(
            '3. If all sibling tasks under a slice are complete, ' +
            'also mark the slice header'
        );
        lines.push('4. Save the modified file');
        lines.push(
            '5. Proceed to the next task prompt in the sequence'
        );
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Translate a process step body, replacing raw Claude Code tool
 * references with Continue-native equivalents.
 * @param {ProcessStep} step
 * @returns {string}
 */
function translateStepBody(step) {
    let body = step.body;
    for (const ref of step.toolReferences) {
        const translation = translateToolReference(ref);
        const escaped = escapeRegex(ref.context);
        const re = new RegExp(escaped, 'g');
        if (re.test(body)) {
            body = body.replace(re, translation);
        }
    }
    return body;
}

/**
 * Translate interaction notes, replacing tool names with Continue
 * equivalents.
 * @param {InteractionSection} interaction
 * @returns {string}
 */
function translateInteractionNotes(interaction) {
    let notes = interaction.notes;
    if (interaction.tools.includes('AskUserQuestion')) {
        notes = notes.replace(/AskUserQuestion/g, 'slash command prompt');
    }
    if (interaction.tools.includes('Explore')) {
        notes = notes.replace(/Explore/g, 'context gather prompt');
    }
    if (interaction.tools.includes('Plan')) {
        notes = notes.replace(/Plan/g, 'planning slash command');
    }
    return notes;
}

// ---------------------------------------------------------------------
// Delegation Strategy
// ---------------------------------------------------------------------

/**
 * Create the Continue delegation strategy (sequential — slash command
 * iteration sending each task as an individual prompt).
 * @returns {DelegationStrategy}
 */
function createContinueDelegationStrategy() {
    return createDelegationStrategy(
        DELEGATION_TYPES.SEQUENTIAL,
        (delegation) => {
            const agent = delegation.agentType || 'general-task-execution';
            const prompt = delegation.promptTemplate || '';
            const lines = [
                `**Delegated Task** (agent: ${agent})`,
            ];
            if (prompt) lines.push(`Prompt: ${prompt}`);
            lines.push('');
            lines.push('Steps (slash command iteration):');
            lines.push('1. Inject context providers for the task');
            lines.push(
                '2. Send the task description as an individual prompt'
            );
            lines.push('3. Wait for completion');
            lines.push(
                '4. Mark the checkbox in tasks.md before proceeding'
            );
            return lines.join('\n');
        }
    );
}

// ---------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------

/**
 * Check if the IR contains any delegation calls.
 * @param {CommandIR} ir
 * @returns {boolean}
 */
function hasDelegations(ir) {
    return ir.process.steps.some((s) => s.delegations.length > 0);
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------
// Main Emit Function
// ---------------------------------------------------------------------

/**
 * Emit Continue adapter files from a CommandIR.
 * @param {CommandIR} ir - Parsed command intermediate representation
 * @param {Object} [options] - Emitter options
 * @param {number} [options.maxLines=500] - Max lines per output file
 * @returns {EmitResult}
 */
function emit(ir, options = {}) {
    const maxLines = options.maxLines || MAX_LINES;
    const result = createEmitResult();

    // Build config file content
    const configContent = buildConfigContent(ir);
    const withHeader = prependHeader(configContent, 'md');
    const relativePath = `${CONFIG_DIR}/${ir.name}.md`;
    const file = createGeneratedFile(relativePath, withHeader);

    // Apply 500-line split if needed
    const splitFiles = splitIfNeeded(file, maxLines);
    for (const sf of splitFiles) {
        result.files.push(sf);
    }

    // Emit warning if approaching limit
    for (const sf of result.files) {
        if (sf.lineCount > 400 && sf.lineCount <= maxLines) {
            result.warnings.push(
                createEmitWarning(
                    `File approaching 500-line limit: ${sf.relativePath} ` +
                    `(${sf.lineCount} lines)`,
                    sf.relativePath
                )
            );
        }
    }

    return result;
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = {
    emit,
    createContinueDelegationStrategy,
};
