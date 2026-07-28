'use strict';

/**
 * Cursor Emitter for the multi-IDE adapter layer.
 *
 * Translates CommandIR into Cursor-native rule files (.md) and a master
 * `.cursor/rules/awos.mdc` file. Uses the sequential delegation strategy
 * since Cursor lacks native subagent spawning.
 *
 * @module lib/emitters/cursor
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

const RULES_DIR = 'rules';
const MASTER_RULE_PATH = 'rules/awos.mdc';
const MAX_LINES = 500;

// ---------------------------------------------------------------------
// Tool Translation
// ---------------------------------------------------------------------

/**
 * Translate a Read tool reference to Cursor @-file syntax.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateRead(ref) {
    const p = ref.parameters._positional || ref.parameters.path || '';
    return p ? `@${normalizeContextPath(p)}` : '@<file-path>';
}

/**
 * Translate a Glob tool reference to Cursor @folder syntax.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateGlob(ref) {
    const pattern =
        ref.parameters._positional || ref.parameters.pattern || '';
    if (pattern) {
        const folder = pattern.replace(/\/\*.*$/, '').replace(/\*.*$/, '');
        if (folder) return `@${normalizeContextPath(folder)}`;
    }
    return '@<folder>';
}

/**
 * Translate an Agent delegation call into sequential Composer prompt
 * instructions with explicit context reloading.
 * @param {ToolReference} ref
 * @returns {string}
 */
function translateAgent(ref) {
    const agentType =
        ref.parameters.subagent_type ||
        ref.parameters._positional ||
        'general-task-execution';
    return (
        `Open a **new Composer session** for delegated task ` +
        `(agent: ${agentType}) with explicit context reloading.`
    );
}

/**
 * Translate a single tool reference to Cursor-native syntax.
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
            const q = ref.parameters._positional ||
                ref.parameters.question || '';
            return q
                ? `Ask in Composer: "${q}"`
                : 'Ask the user in Composer for clarification.';
        }
        case 'Explore': {
            const t = ref.parameters._positional ||
                ref.parameters.target || '';
            return t
                ? `In Composer, explore: "${t}"`
                : 'In Composer, explore the relevant codebase areas.';
        }
        case 'Plan': {
            const g = ref.parameters._positional ||
                ref.parameters.goal || '';
            return g
                ? `In Composer, plan: "${g}"`
                : 'In Composer, create a plan for the next steps.';
        }
        default:
            return ref.context;
    }
}

// ---------------------------------------------------------------------
// Delegation Section Builder
// ---------------------------------------------------------------------

/**
 * Build the delegation strategy section for Cursor (sequential).
 * @param {DelegationCall[]} delegations
 * @param {string[]} contextFiles
 * @returns {string}
 */
function buildDelegationSection(delegations, contextFiles) {
    const lines = [
        '### Task Delegation',
        '',
        'For each delegated task, open a new Composer session ' +
        'with the following context:',
        '',
    ];

    if (contextFiles.length > 0) {
        for (const cf of contextFiles) {
            lines.push(`1. Load @${normalizeContextPath(cf)}`);
        }
    } else {
        lines.push('1. Load @context/spec/[spec-name]/tasks.md');
    }

    lines.push('2. Provide the task description');
    lines.push(
        '3. After completion, return to this session and mark ' +
        'the checkbox in tasks.md'
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
        '> **Task Completion:** After each delegated task ' +
        'completes, mark its checkbox in `tasks.md` to track progress.'
    );
    lines.push('');
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Rule File Generation
// ---------------------------------------------------------------------

/**
 * Build the content of a single Cursor rule file for a command.
 * @param {CommandIR} ir
 * @returns {string}
 */
function buildRuleContent(ir) {
    const lines = [];

    lines.push(`# ${ir.name}`);
    lines.push('');

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

    // Context injection
    const contextFiles = ir.io.contextFiles || [];
    if (contextFiles.length > 0) {
        lines.push('## Context');
        lines.push('');
        lines.push(
            'Load the following context documents into your session:'
        );
        lines.push('');
        for (const cf of contextFiles) {
            lines.push(`- @${normalizeContextPath(cf)}`);
        }
        lines.push('');
    }

    // Process steps
    if (ir.process.steps.length > 0) {
        lines.push('## Process');
        lines.push('');
        for (const step of ir.process.steps) {
            lines.push(`### Step ${step.stepNumber}: ${step.title}`);
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

    return lines.join('\n');
}

/**
 * Translate the body of a process step, replacing raw Claude Code tool
 * references with Cursor-native equivalents.
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
 * Translate interaction notes, replacing tool names with Cursor
 * equivalents.
 * @param {InteractionSection} interaction
 * @returns {string}
 */
function translateInteractionNotes(interaction) {
    let notes = interaction.notes;
    if (interaction.tools.includes('AskUserQuestion')) {
        notes = notes.replace(/AskUserQuestion/g, 'Composer question');
    }
    if (interaction.tools.includes('Explore')) {
        notes = notes.replace(/Explore/g, 'Composer "explore" prompt');
    }
    if (interaction.tools.includes('Plan')) {
        notes = notes.replace(/Plan/g, 'Composer planning prompt');
    }
    return notes;
}

// ---------------------------------------------------------------------
// Master Rule File (.mdc)
// ---------------------------------------------------------------------

/**
 * Build the master `.cursor/rules/awos.mdc` file content.
 * @param {string[]} ruleFiles - Relative paths to generated rule files
 * @returns {string}
 */
function buildMasterRule(ruleFiles) {
    const lines = [
        '---',
        'description: AWOS workflow rules for Cursor',
        'globs: **/*',
        '---',
        '',
        '# AWOS Workflow Rules',
        '',
        'This rule file references all generated AWOS workflow rules.',
        'Each rule corresponds to an AWOS command and provides ' +
        'Cursor-native instructions.',
        '',
        '## Available Commands',
        '',
    ];

    for (const file of ruleFiles) {
        const name = file.replace(/^rules\//, '').replace(/\.md$/, '');
        lines.push(`- **${name}**: See @${file}`);
    }
    lines.push('');

    lines.push('## Context Directory');
    lines.push('');
    lines.push(
        'All AWOS workflows use the `context/` directory as shared state.'
    );
    lines.push(
        'Reference context files using workspace-relative paths:'
    );
    lines.push('');
    lines.push('- @context/spec/ — Specification documents');
    lines.push('- @context/ — All shared workflow state');
    lines.push('');

    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Delegation Strategy
// ---------------------------------------------------------------------

/**
 * Create the Cursor delegation strategy (sequential).
 * @returns {DelegationStrategy}
 */
function createCursorDelegationStrategy() {
    return createDelegationStrategy(
        DELEGATION_TYPES.SEQUENTIAL,
        (delegation) => {
            const agent = delegation.agentType || 'general-task-execution';
            const prompt = delegation.promptTemplate || '';
            const lines = [`**Delegated Task** (agent: ${agent})`];
            if (prompt) lines.push(`Prompt: ${prompt}`);
            lines.push('');
            lines.push('Steps:');
            lines.push('1. Open a new Composer session');
            lines.push('2. Load relevant @context/ documents');
            lines.push('3. Provide the task description above');
            lines.push(
                '4. After completion, return and mark the checkbox in tasks.md'
            );
            return lines.join('\n');
        }
    );
}

// ---------------------------------------------------------------------
// Main Emit Function
// ---------------------------------------------------------------------

/**
 * Emit Cursor adapter files from a CommandIR.
 * @param {CommandIR} ir - Parsed command intermediate representation
 * @param {Object} [options] - Emitter options
 * @param {number} [options.maxLines=500] - Max lines per output file
 * @returns {EmitResult}
 */
function emit(ir, options = {}) {
    const maxLines = options.maxLines || MAX_LINES;
    const result = createEmitResult();

    const ruleContent = buildRuleContent(ir);
    const withHeader = prependHeader(ruleContent, 'md');
    const relativePath = `${RULES_DIR}/${ir.name}.md`;
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

    // Build master .mdc rule file
    const masterContent = buildMasterRule(
        result.files.map((f) => f.relativePath)
    );
    const masterWithHeader = prependHeader(masterContent, 'md');
    const masterFile = createGeneratedFile(
        MASTER_RULE_PATH,
        masterWithHeader
    );
    result.files.push(masterFile);

    return result;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = {
    emit,
    createCursorDelegationStrategy,
};
