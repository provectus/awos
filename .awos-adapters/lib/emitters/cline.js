'use strict';

/**
 * Cline Emitter for the multi-IDE adapter layer.
 *
 * Translates CommandIR into Cline-native rule files and memory bank
 * templates. Uses sequential delegation with memory bank state tracking.
 *
 * Output:
 *   .awos-adapters/cline/rules/{command}.md
 *   .awos-adapters/cline/memory-bank/{command}-state.md
 *
 * @module lib/emitters/cline
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
const MEMORY_BANK_DIR = 'memory-bank';
const MAX_LINES = 500;

// ---------------------------------------------------------------------
// Tool Translation
// ---------------------------------------------------------------------

/** @param {ToolReference} ref */
function translateRead(ref) {
    const target =
        ref.parameters._positional || ref.parameters.path || '';
    return target
        ? `Read the file: \`${normalizeContextPath(target)}\``
        : 'Read the specified file';
}

/** @param {ToolReference} ref */
function translateGlob(ref) {
    const pattern =
        ref.parameters._positional || ref.parameters.pattern || '';
    return pattern
        ? `List files matching: \`${pattern}\``
        : 'List the matching files in the workspace';
}

/** @param {ToolReference} ref */
function translateAgent(ref) {
    const agentType =
        ref.parameters.subagent_type ||
        ref.parameters._positional ||
        'general-task-execution';
    return (
        `Execute delegated task sequentially (agent: ${agentType}). ` +
        'Update memory bank state after completion.'
    );
}

/** @param {ToolReference} ref */
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
                ? `Ask the user in chat: "${q}"`
                : 'Ask the user in chat for clarification.';
        }
        case 'Explore': {
            const t =
                ref.parameters._positional || ref.parameters.target || '';
            return t
                ? `Switch to Plan mode and investigate: "${t}"`
                : 'Switch to Plan mode and investigate the relevant areas.';
        }
        case 'Plan': {
            const g =
                ref.parameters._positional || ref.parameters.goal || '';
            return g
                ? `Switch to Plan mode and create a plan: "${g}"`
                : 'Switch to Plan mode and plan the next steps.';
        }
        default:
            return ref.context;
    }
}

// ---------------------------------------------------------------------
// System Prompt (ROLE) Mapping
// ---------------------------------------------------------------------

/** Map ROLE section into Cline system prompt format. */
function buildSystemPromptSection(role) {
    const lines = ['## System Prompt', ''];
    if (role.title) {
        lines.push(`You are: **${role.title}**`, '');
    }
    if (role.description) {
        lines.push(role.description, '');
    }
    if (role.rules.length > 0) {
        lines.push('### Constraints', '');
        for (const rule of role.rules) lines.push(`- ${rule}`);
        lines.push('');
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Auto-Approve Patterns
// ---------------------------------------------------------------------

/** Encode auto-approve patterns for context/ file operations. */
function buildAutoApproveSection(contextFiles) {
    const lines = [
        '## Auto-Approve Patterns',
        '',
        'The following file operations within `context/` are pre-approved:',
        '',
        '- **Read**: `context/**/*`',
        '- **Write**: `context/spec/**/*.md`',
        '- **Write**: `context/spec/**/tasks.md`',
        '',
    ];
    if (contextFiles.length > 0) {
        lines.push('### Command-Specific Context Paths', '');
        for (const cf of contextFiles) {
            lines.push(`- \`${normalizeContextPath(cf)}\``);
        }
        lines.push('');
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Delegation Section
// ---------------------------------------------------------------------

function buildDelegationSection(delegations, contextFiles) {
    const lines = [
        '### Task Delegation (Sequential)',
        '',
        'Execute each delegated task sequentially. After each task:',
        '',
        '1. Complete the task as described',
        '2. Update the memory bank state file with results',
        '3. Mark the task checkbox in `tasks.md`: `[ ]` → `[x]`',
        '4. Load context for the next task before proceeding',
        '',
    ];
    if (contextFiles.length > 0) {
        lines.push('**Context to load per task:**', '');
        for (const cf of contextFiles) {
            lines.push(`- \`${normalizeContextPath(cf)}\``);
        }
        lines.push('');
    }
    if (delegations.length > 0) {
        lines.push('#### Delegated Tasks', '');
        for (const del of delegations) {
            const agent = del.agentType || 'general-task-execution';
            const prompt = del.promptTemplate
                ? `: ${del.promptTemplate}`
                : '';
            lines.push(`- **${agent}**${prompt}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Rule File Generation
// ---------------------------------------------------------------------

function buildRuleContent(ir) {
    const lines = [`# ${ir.name}`, ''];
    if (ir.frontmatter.description) {
        lines.push(`> ${ir.frontmatter.description}`, '');
    }
    // System prompt (ROLE → Cline system prompt format)
    if (ir.role.title || ir.role.description) {
        lines.push(buildSystemPromptSection(ir.role));
    }
    // Task
    if (ir.task.goal) {
        lines.push('## Task', '', ir.task.goal, '');
    }
    // Context references (workspace-relative paths)
    const contextFiles = ir.io.contextFiles || [];
    if (contextFiles.length > 0) {
        lines.push(
            '## Context',
            '',
            'Load the following workspace-relative context documents:',
            ''
        );
        for (const cf of contextFiles) {
            lines.push(`- \`${normalizeContextPath(cf)}\``);
        }
        lines.push('');
    }
    // Auto-approve patterns for context/ operations
    lines.push(buildAutoApproveSection(contextFiles));
    // Process steps (each individually addressable)
    if (ir.process.steps.length > 0) {
        lines.push('## Process', '');
        for (const step of ir.process.steps) {
            lines.push(`### Step ${step.stepNumber}: ${step.title}`, '');
            lines.push(translateStepBody(step), '');
            if (step.delegations.length > 0) {
                lines.push(
                    buildDelegationSection(step.delegations, contextFiles)
                );
            }
        }
    }
    // Task completion tracking (Requirement 9.4)
    if (hasDelegations(ir)) {
        lines.push(
            '## Task Completion Tracking',
            '',
            'After each delegated task completes:',
            '',
            '1. Open `tasks.md` from the spec directory',
            '2. Find the completed task and change `[ ]` to `[x]`',
            '3. Update the memory bank state with completion status',
            '4. If all tasks under a slice are done, mark the slice header',
            ''
        );
    }
    // Interaction
    if (ir.interaction.notes) {
        lines.push(
            '## Interaction',
            '',
            translateInteractionNotes(ir.interaction),
            ''
        );
    }
    return lines.join('\n');
}

/** Translate step body replacing tool refs with Cline instructions. */
function translateStepBody(step) {
    const lines = [];
    if (step.body) lines.push(step.body);
    if (step.toolReferences.length > 0) {
        lines.push('', '**Cline Instructions:**');
        const seen = new Set();
        for (const ref of step.toolReferences) {
            const translated = translateToolReference(ref);
            if (!seen.has(translated)) {
                seen.add(translated);
                lines.push('', `- ${translated}`);
            }
        }
    }
    return lines.join('\n');
}

/** Translate interaction notes to Cline equivalents. */
function translateInteractionNotes(interaction) {
    let notes = interaction.notes;
    if (interaction.tools.includes('AskUserQuestion')) {
        notes = notes.replace(/AskUserQuestion/g, 'Chat question');
    }
    if (interaction.tools.includes('Explore')) {
        notes = notes.replace(/Explore/g, 'Plan mode investigation');
    }
    if (interaction.tools.includes('Plan')) {
        notes = notes.replace(/\bPlan\b/g, 'Plan mode prompt');
    }
    return notes;
}

// ---------------------------------------------------------------------
// Memory Bank Template
// ---------------------------------------------------------------------

function buildMemoryBankTemplate(ir) {
    const lines = [
        `# Memory Bank: ${ir.name}`,
        '',
        '## Current State',
        '',
        '- **Status:** pending',
        '- **Current Step:** 1',
        `- **Total Steps:** ${ir.process.steps.length}`,
        '- **Last Updated:** (auto-updated on each task)',
        '',
    ];
    const contextFiles = ir.io.contextFiles || [];
    if (contextFiles.length > 0) {
        lines.push('## Active Context', '');
        for (const cf of contextFiles) {
            lines.push(`- \`${normalizeContextPath(cf)}\``);
        }
        lines.push('');
    }
    if (ir.process.steps.length > 0) {
        lines.push('## Step Progress', '');
        for (const step of ir.process.steps) {
            lines.push(`- [ ] Step ${step.stepNumber}: ${step.title}`);
        }
        lines.push('');
    }
    const delegations = collectDelegations(ir);
    if (delegations.length > 0) {
        lines.push('## Delegated Tasks', '');
        for (const del of delegations) {
            const agent = del.agentType || 'general-task-execution';
            lines.push(`- [ ] ${agent}`);
        }
        lines.push('');
    }
    if (ir.io.outputs.length > 0) {
        lines.push('## Expected Outputs', '');
        for (const output of ir.io.outputs) {
            lines.push(`- [ ] ${output.name}: ${output.description}`);
        }
        lines.push('');
    }
    lines.push(
        '## Notes',
        '',
        'Update this file after each task step to maintain state ' +
        'continuity between sequential executions.',
        ''
    );
    return lines.join('\n');
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function collectDelegations(ir) {
    const delegations = [];
    for (const step of ir.process.steps) {
        delegations.push(...step.delegations);
    }
    return delegations;
}

function hasDelegations(ir) {
    return ir.process.steps.some((s) => s.delegations.length > 0);
}

// ---------------------------------------------------------------------
// Delegation Strategy
// ---------------------------------------------------------------------

/**
 * Create the Cline delegation strategy (sequential + memory bank).
 * @returns {DelegationStrategy}
 */
function createClineDelegationStrategy() {
    return createDelegationStrategy(
        DELEGATION_TYPES.SEQUENTIAL,
        (delegation) => {
            const agent = delegation.agentType || 'general-task-execution';
            const prompt = delegation.promptTemplate || '';
            const lines = [`**Delegated Task** (agent: ${agent})`];
            if (prompt) lines.push(`Prompt: ${prompt}`);
            lines.push(
                '',
                'Steps:',
                '1. Execute the task as described',
                '2. Update memory bank state with results',
                '3. Mark the task checkbox in tasks.md: `[ ]` → `[x]`',
                '4. Load context for next task before proceeding'
            );
            return lines.join('\n');
        }
    );
}

// ---------------------------------------------------------------------
// Main Emit Function
// ---------------------------------------------------------------------

/**
 * Emit Cline adapter files from a CommandIR.
 * @param {CommandIR} ir - Parsed command intermediate representation
 * @param {Object} [options] - Emitter options
 * @param {number} [options.maxLines=500] - Max lines per output file
 * @returns {EmitResult}
 */
function emit(ir, options = {}) {
    const maxLines = options.maxLines || MAX_LINES;
    const result = createEmitResult();

    // --- Rule file ---
    const ruleContent = buildRuleContent(ir);
    const ruleWithHeader = prependHeader(ruleContent, 'md');
    const ruleFile = createGeneratedFile(
        `${RULES_DIR}/${ir.name}.md`,
        ruleWithHeader
    );
    const ruleFiles = splitIfNeeded(ruleFile, maxLines);
    result.files.push(...ruleFiles);

    // --- Memory bank template ---
    const memoryContent = buildMemoryBankTemplate(ir);
    const memoryWithHeader = prependHeader(memoryContent, 'md');
    const memoryFile = createGeneratedFile(
        `${MEMORY_BANK_DIR}/${ir.name}-state.md`,
        memoryWithHeader
    );
    const memoryFiles = splitIfNeeded(memoryFile, maxLines);
    result.files.push(...memoryFiles);

    // Emit warnings for files approaching the limit
    for (const f of result.files) {
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

    return result;
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = {
    emit,
    createClineDelegationStrategy,
};
