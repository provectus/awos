'use strict';

/**
 * Codex Emitter for the multi-IDE adapter layer.
 *
 * Translates CommandIR into Codex-native task files (.md) that can be
 * executed via `codex --auto`. Uses the sequential delegation strategy
 * with `--context-file` references for context loading.
 *
 * Output: `.awos-adapters/codex/tasks/{command}.md`
 *
 * @module lib/emitters/codex
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

const TASKS_DIR = 'tasks';
const MAX_LINES = 500;

// ---------------------------------------------------------------------
// Tool Translation
// ---------------------------------------------------------------------

/**
 * Translate a Read tool reference to a context file argument.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateRead(ref) {
    const p = ref.parameters._positional || ref.parameters.path || '';
    if (p) {
        return `--context-file ${normalizeContextPath(p)}`;
    }
    return '--context-file <file-path>';
}

/**
 * Translate a Glob tool reference to a glob in the task description.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateGlob(ref) {
    const pattern =
        ref.parameters._positional || ref.parameters.pattern || '';
    if (pattern) {
        return `Find files matching: \`${pattern}\``;
    }
    return 'Find files matching the specified pattern';
}

/**
 * Translate an Agent delegation into sequential codex --auto invocation.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateAgent(ref) {
    const agentType =
        ref.parameters.subagent_type ||
        ref.parameters._positional ||
        'general-task-execution';
    return (
        `Run \`codex --auto\` for delegated task ` +
        `(agent: ${agentType}) with appropriate --context-file arguments.`
    );
}

/**
 * Translate a single tool reference to Codex-native syntax.
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
                ref.parameters._positional ||
                ref.parameters.question ||
                '';
            return q
                ? `Interactive prompt: "${q}"`
                : 'Interactive prompt: ask the user for input.';
        }
        case 'Explore': {
            const t =
                ref.parameters._positional ||
                ref.parameters.target ||
                '';
            return t
                ? `List and review context files related to: ${t}`
                : 'List and review relevant context files.';
        }
        case 'Plan': {
            const g =
                ref.parameters._positional ||
                ref.parameters.goal ||
                '';
            return g
                ? `Plan the task: ${g}`
                : 'Plan the next steps for this task.';
        }
        default:
            return ref.context;
    }
}

// ---------------------------------------------------------------------
// Delegation Section Builder
// ---------------------------------------------------------------------

/**
 * Build the delegation section for sequential codex --auto invocations.
 * @param {DelegationCall[]} delegations
 * @param {string[]} contextFiles
 * @returns {string}
 */
function buildDelegationSection(delegations, contextFiles) {
    const lines = [
        '### Task Delegation',
        '',
        'For each delegated task, run a separate `codex --auto` invocation',
        'with the following context file references:',
        '',
    ];

    lines.push('```bash');
    if (contextFiles.length > 0) {
        for (const cf of contextFiles) {
            lines.push(
                `codex --auto --context-file ${normalizeContextPath(cf)} \\`
            );
        }
    } else {
        lines.push(
            'codex --auto --context-file context/spec/[spec-name]/tasks.md \\'
        );
    }
    lines.push('  "<task-description>"');
    lines.push('```');
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
        '> **Task Completion:** After each delegated task completes, ' +
        'mark its checkbox in `tasks.md` to track progress.'
    );
    lines.push('');
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Task File Generation
// ---------------------------------------------------------------------

/**
 * Build the content of a Codex task file for a command.
 * Each process step is encoded as an individually-executable task.
 * @param {CommandIR} ir
 * @returns {string}
 */
function buildTaskContent(ir) {
    const lines = [];

    lines.push(`# ${ir.name}`);
    lines.push('');

    if (ir.frontmatter.description) {
        lines.push(`> ${ir.frontmatter.description}`);
        lines.push('');
    }

    // Role
    if (ir.role.title || ir.role.description) {
        lines.push('## Role');
        lines.push('');
        if (ir.role.title) {
            lines.push(`**${ir.role.title}**`);
            lines.push('');
        }
        if (ir.role.description) {
            lines.push(ir.role.description);
            lines.push('');
        }
        if (ir.role.rules.length > 0) {
            for (const rule of ir.role.rules) {
                lines.push(`- ${rule}`);
            }
            lines.push('');
        }
    }

    // Task goal
    if (ir.task.goal) {
        lines.push('## Task');
        lines.push('');
        lines.push(ir.task.goal);
        lines.push('');
    }

    // Context files (as --context-file arguments)
    const contextFiles = ir.io.contextFiles || [];
    if (contextFiles.length > 0) {
        lines.push('## Context');
        lines.push('');
        lines.push(
            'Load the following documents as context file arguments:'
        );
        lines.push('');
        lines.push('```bash');
        for (const cf of contextFiles) {
            lines.push(
                `--context-file ${normalizeContextPath(cf)}`
            );
        }
        lines.push('```');
        lines.push('');
    }

    // Process steps — each as an individually-executable task
    if (ir.process.steps.length > 0) {
        lines.push('## Tasks');
        lines.push('');
        for (const step of ir.process.steps) {
            lines.push(
                `### Task ${step.stepNumber}: ${step.title}`
            );
            lines.push('');
            lines.push(translateStepBody(step, contextFiles));
            lines.push('');
            if (step.delegations.length > 0) {
                lines.push(
                    buildDelegationSection(
                        step.delegations,
                        contextFiles
                    )
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
        lines.push('After each delegated task completes:');
        lines.push('');
        lines.push(
            '1. Open `tasks.md` from the spec directory'
        );
        lines.push(
            '2. Find the completed task and change `[ ]` to `[x]`'
        );
        lines.push('3. Save the modified file');
        lines.push(
            '4. Proceed to the next task or report completion'
        );
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Translate the body of a process step, replacing raw Claude Code tool
 * references with Codex-native equivalents.
 * @param {ProcessStep} step
 * @param {string[]} contextFiles
 * @returns {string}
 */
function translateStepBody(step, contextFiles) {
    const lines = [];

    // Translate body text with tool replacements
    let body = step.body;
    for (const ref of step.toolReferences) {
        const translation = translateToolReference(ref);
        const escaped = escapeRegex(ref.context);
        const re = new RegExp(escaped, 'g');
        if (re.test(body)) {
            body = body.replace(re, translation);
        }
    }
    if (body) {
        lines.push(body);
    }

    // Context file arguments for Read references in this step
    const readRefs = step.toolReferences.filter(
        (r) => r.tool === 'Read'
    );
    if (readRefs.length > 0) {
        lines.push('');
        lines.push('**Context file arguments for this step:**');
        lines.push('');
        for (const ref of readRefs) {
            lines.push(`- ${translateRead(ref)}`);
        }
    }

    // Codex execution instruction (only for non-delegation steps)
    if (contextFiles.length > 0 && step.delegations.length === 0) {
        lines.push('');
        lines.push('**Codex invocation:**');
        lines.push('```bash');
        const ctxArgs = contextFiles
            .map(
                (cf) =>
                    `--context-file ${normalizeContextPath(cf)}`
            )
            .join(' \\\n  ');
        lines.push(`codex --auto ${ctxArgs} \\`);
        lines.push(`  "Execute: ${step.title}"`);
        lines.push('```');
    }

    return lines.join('\n');
}

/**
 * Translate interaction notes, replacing tool names with Codex
 * equivalents.
 * @param {Object} interaction
 * @returns {string}
 */
function translateInteractionNotes(interaction) {
    let notes = interaction.notes;
    if (interaction.tools.includes('AskUserQuestion')) {
        notes = notes.replace(
            /AskUserQuestion/g,
            'interactive prompt'
        );
    }
    if (interaction.tools.includes('Explore')) {
        notes = notes.replace(/Explore/g, 'context file listing');
    }
    if (interaction.tools.includes('Plan')) {
        notes = notes.replace(
            /Plan/g,
            'task planning instruction'
        );
    }
    return notes;
}

// ---------------------------------------------------------------------
// Delegation Strategy
// ---------------------------------------------------------------------

/**
 * Create the Codex delegation strategy (sequential codex --auto).
 * @returns {DelegationStrategy}
 */
function createCodexDelegationStrategy() {
    return createDelegationStrategy(
        DELEGATION_TYPES.SEQUENTIAL,
        (delegation) => {
            const agent =
                delegation.agentType || 'general-task-execution';
            const prompt = delegation.promptTemplate || '';
            const lines = [
                `**Delegated Task** (agent: ${agent})`,
            ];
            if (prompt) lines.push(`Prompt: ${prompt}`);
            lines.push('');
            lines.push('Execution:');
            lines.push('```bash');
            lines.push(
                'codex --auto ' +
                '--context-file context/spec/[spec-name]/tasks.md \\'
            );
            lines.push(
                `  "${prompt || 'Execute the delegated task'}"`
            );
            lines.push('```');
            lines.push('');
            lines.push(
                'After completion, mark the checkbox in tasks.md.'
            );
            return lines.join('\n');
        }
    );
}

// ---------------------------------------------------------------------
// Main Emit Function
// ---------------------------------------------------------------------

/**
 * Emit Codex adapter files from a CommandIR.
 * @param {CommandIR} ir - Parsed command intermediate representation
 * @param {Object} [options] - Emitter options
 * @param {number} [options.maxLines=500] - Max lines per output file
 * @returns {EmitResult}
 */
function emit(ir, options = {}) {
    const maxLines = options.maxLines || MAX_LINES;
    const result = createEmitResult();

    const taskContent = buildTaskContent(ir);
    const withHeader = prependHeader(taskContent, 'md');
    const relativePath = `${TASKS_DIR}/${ir.name}.md`;
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
                    `File approaching 500-line limit: ` +
                    `${sf.relativePath} (${sf.lineCount} lines)`,
                    sf.relativePath
                )
            );
        }
    }

    return result;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function hasDelegations(ir) {
    return ir.process.steps.some(
        (s) => s.delegations.length > 0
    );
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = {
    emit,
    createCodexDelegationStrategy,
};
