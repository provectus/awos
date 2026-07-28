'use strict';

/**
 * Markdown Parser for AWOS command prompts.
 *
 * Parses `.awos/commands/*.md` files into structured Intermediate
 * Representation (CommandIR) objects.
 *
 * @module lib/parser
 */

const { readdir, readFile } = require('node:fs/promises');
const { join, basename, extname } = require('node:path');
const { createCommandIR } = require('./ir.js');

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const KNOWN_SECTIONS = Object.freeze([
    'ROLE',
    'TASK',
    'INPUTS & OUTPUTS',
    'INTERACTION',
    'PROCESS',
]);

const TOOL_NAMES = Object.freeze([
    'Agent',
    'Read',
    'Glob',
    'AskUserQuestion',
    'Explore',
    'Plan',
]);

const TOOL_REGEX = new RegExp(
    `\\b(${TOOL_NAMES.join('|')})\\(([^)]*)\\)`,
    'g'
);

const TOOL_BARE_REGEX = new RegExp(
    `\\b(${TOOL_NAMES.join('|')})\\b`,
    'g'
);

// ---------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------

class ParseError extends Error {
    constructor(filePath, reason) {
        super(`ParseError [${filePath}]: ${reason}`);
        this.name = 'ParseError';
        this.filePath = filePath;
        this.reason = reason;
    }
}

// ---------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------

function extractFrontmatter(content) {
    const fm = { description: null, argumentHint: null };
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('---')) return { frontmatter: fm, body: content };

    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) return { frontmatter: fm, body: content };

    const yamlBlock = trimmed.slice(3, endIdx).trim();
    const body = trimmed.slice(endIdx + 3);

    for (const line of yamlBlock.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key === 'description') fm.description = val || null;
        else if (key === 'argument-hint') fm.argumentHint = val || null;
    }
    return { frontmatter: fm, body };
}

// ---------------------------------------------------------------------
// Section Extraction
// ---------------------------------------------------------------------

function matchSection(heading) {
    const upper = heading.toUpperCase().trim();
    return KNOWN_SECTIONS.find((s) => s === upper) || null;
}

function extractSections(body) {
    const sections = new Map();
    const lines = body.split('\n');
    let heading = null;
    let buf = [];
    let inProcess = false;
    let inCode = false;

    for (const line of lines) {
        if (line.trimStart().startsWith('```')) {
            inCode = !inCode;
            buf.push(line);
            continue;
        }
        if (inCode) { buf.push(line); continue; }

        const h1 = line.match(/^#\s+(.+)$/);
        if (h1) {
            if (heading) sections.set(heading, buf.join('\n').trim());
            heading = h1[1].trim();
            inProcess = matchSection(heading) === 'PROCESS';
            buf = [];
            continue;
        }

        const h2 = line.match(/^##\s+(.+)$/);
        if (h2 && !inProcess && matchSection(h2[1].trim())) {
            if (heading) sections.set(heading, buf.join('\n').trim());
            heading = h2[1].trim();
            inProcess = false;
            buf = [];
            continue;
        }

        buf.push(line);
    }
    if (heading) sections.set(heading, buf.join('\n').trim());
    return sections;
}

// ---------------------------------------------------------------------
// Tool Reference Extraction
// ---------------------------------------------------------------------

function extractToolReferences(text, baseLineNumber) {
    const refs = [];
    const lines = text.split('\n');
    const seen = new Set();
    let inCode = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('```')) { inCode = !inCode; continue; }
        if (inCode) continue;

        const ln = baseLineNumber + i;
        let m;

        TOOL_REGEX.lastIndex = 0;
        while ((m = TOOL_REGEX.exec(line)) !== null) {
            const key = `${ln}:${m.index}`;
            if (seen.has(key)) continue;
            seen.add(key);
            refs.push({
                tool: m[1],
                context: line.trim(),
                lineNumber: ln,
                parameters: parseToolParameters(m[2]),
            });
        }

        TOOL_BARE_REGEX.lastIndex = 0;
        while ((m = TOOL_BARE_REGEX.exec(line)) !== null) {
            const key = `${ln}:${m.index}`;
            if (seen.has(key)) continue;
            seen.add(key);
            refs.push({
                tool: m[1],
                context: line.trim(),
                lineNumber: ln,
                parameters: {},
            });
        }
    }
    return refs;
}

function parseToolParameters(str) {
    const params = {};
    if (!str || !str.trim()) return params;
    const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,)]+))/g;
    let m;
    while ((m = re.exec(str)) !== null) {
        params[m[1]] = m[2] ?? m[3] ?? m[4]?.trim() ?? '';
    }
    if (Object.keys(params).length === 0 && str.trim()) {
        params._positional = str.trim();
    }
    return params;
}

// ---------------------------------------------------------------------
// Process Step Parsing
// ---------------------------------------------------------------------

function parseProcessSteps(processBody, baseLineNumber) {
    const steps = [];
    const allToolRefs = [];
    const lines = processBody.split('\n');
    let cur = null;
    let buf = [];
    let startLine = baseLineNumber;
    let inCode = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('```')) {
            inCode = !inCode;
            buf.push(line);
            continue;
        }
        if (inCode) { buf.push(line); continue; }

        const sm = line.match(/^#{2,3}\s+(?:Step\s+)?(\d+\w?)[.:]\s*(.+)$/i);
        if (sm) {
            if (cur) {
                const body = buf.join('\n').trim();
                const toolRefs = extractToolReferences(body, startLine);
                steps.push({
                    stepNumber: cur.num,
                    title: cur.title,
                    body,
                    toolReferences: toolRefs,
                    delegations: extractDelegations(toolRefs),
                });
                allToolRefs.push(...toolRefs);
            }
            cur = { num: parseInt(sm[1], 10), title: sm[2].trim() };
            buf = [];
            startLine = baseLineNumber + i + 1;
        } else {
            buf.push(line);
        }
    }

    if (cur) {
        const body = buf.join('\n').trim();
        const toolRefs = extractToolReferences(body, startLine);
        steps.push({
            stepNumber: cur.num,
            title: cur.title,
            body,
            toolReferences: toolRefs,
            delegations: extractDelegations(toolRefs),
        });
        allToolRefs.push(...toolRefs);
    }

    return { steps, toolRefs: allToolRefs };
}

function extractDelegations(toolRefs) {
    return toolRefs
        .filter((r) => r.tool === 'Agent')
        .map((r) => ({
            agentType: r.parameters.subagent_type || r.parameters._positional || '',
            promptTemplate: r.parameters.prompt || '',
        }));
}

// ---------------------------------------------------------------------
// Section-Specific Parsers
// ---------------------------------------------------------------------

function parseRoleSection(body) {
    const lines = body.split('\n');
    const rules = [];
    const descLines = [];
    let inRules = false;

    for (const line of lines) {
        if (line.match(/^#{2,3}\s+/)) { inRules = true; continue; }
        if (inRules) {
            if (line.startsWith('- ')) rules.push(line.slice(2).trim());
            continue;
        }
        descLines.push(line);
    }

    const description = descLines.join('\n').trim();
    const first = description.split('\n')[0] || '';
    const tm = first.match(/^(?:You are (?:a |an )?)?(.+?)(?:[.,]|$)/i);
    const title = tm ? tm[1].trim() : first.trim();
    return { title, description, rules };
}

function parseIOSection(body) {
    const inputs = [];
    const outputs = [];
    const contextFiles = [];

    for (const line of body.split('\n')) {
        const bm = line.match(/^-\s+\*\*(.+?)\*\*[:\s]*(.*)$/);
        if (!bm) {
            const pm = line.match(/`(context\/[^`]+)`|`(\.[^`]+\/[^`]+)`/);
            if (pm) contextFiles.push(pm[1] || pm[2]);
            continue;
        }
        const label = bm[1].trim();
        const desc = bm[2].trim();
        const isOpt =
            label.toLowerCase().includes('optional') ||
            desc.toLowerCase().includes('optional');
        const lower = label.toLowerCase();

        if (lower.includes('output') || lower.includes('action')) {
            outputs.push({ name: label, description: desc });
        } else {
            const source = desc.match(/<[^>]+>\$ARGUMENTS<\/[^>]+>/)
                ? '$ARGUMENTS'
                : desc.match(/`([^`]+)`/)
                    ? desc.match(/`([^`]+)`/)[1]
                    : '';
            inputs.push({ name: label, optional: isOpt, source });
        }
        for (const pm of desc.matchAll(/`(context\/[^`]+)`/g)) {
            contextFiles.push(pm[1]);
        }
    }
    return { inputs, outputs, contextFiles };
}

function parseInteractionSection(body) {
    const tools = [];
    for (const line of body.split('\n')) {
        for (const tool of TOOL_NAMES) {
            if (line.includes(tool) && !tools.includes(tool)) tools.push(tool);
        }
    }
    return { tools, notes: body.trim() };
}

// ---------------------------------------------------------------------
// Main Parse Function
// ---------------------------------------------------------------------

function parseCommand(filePath, content) {
    const warnings = [];
    if (!content || !content.trim()) {
        throw new ParseError(filePath, 'File is empty');
    }

    const name = basename(filePath, extname(filePath));
    const ir = createCommandIR(name);
    const { frontmatter, body } = extractFrontmatter(content);
    ir.frontmatter = frontmatter;

    const sections = extractSections(body);
    let hasRequired = false;

    for (const [heading, sBody] of sections) {
        const norm = matchSection(heading);
        const offset = lineOffsetOf(content, heading);

        if (norm === 'ROLE') {
            hasRequired = true;
            ir.role = parseRoleSection(sBody);
            ir.toolReferences.push(...extractToolReferences(sBody, offset));
        } else if (norm === 'TASK') {
            hasRequired = true;
            ir.task = { goal: sBody.split('\n')[0] || '', body: sBody };
            ir.toolReferences.push(...extractToolReferences(sBody, offset));
        } else if (norm === 'INPUTS & OUTPUTS') {
            ir.io = parseIOSection(sBody);
            ir.toolReferences.push(...extractToolReferences(sBody, offset));
        } else if (norm === 'INTERACTION') {
            ir.interaction = parseInteractionSection(sBody);
            ir.toolReferences.push(...extractToolReferences(sBody, offset));
        } else if (norm === 'PROCESS') {
            hasRequired = true;
            const { steps, toolRefs } = parseProcessSteps(sBody, offset);
            ir.process = { steps };
            ir.toolReferences.push(...toolRefs);
        }
    }

    if (!hasRequired) {
        throw new ParseError(
            filePath,
            'Missing required sections (ROLE, TASK, or PROCESS)'
        );
    }

    return { ir, warnings };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function lineOffsetOf(content, heading) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^#{1,2}\s+/) && lines[i].includes(heading)) {
            return i + 2; // 1-indexed + skip heading line
        }
    }
    return 1;
}

// ---------------------------------------------------------------------
// Batch Processing
// ---------------------------------------------------------------------

async function parseAllCommands(commandsDir) {
    const commands = [];
    const errors = [];

    let entries;
    try {
        entries = await readdir(commandsDir);
    } catch (err) {
        errors.push(
            new ParseError(commandsDir, `Cannot read directory: ${err.message}`)
        );
        return { commands, errors };
    }

    const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();

    for (const file of mdFiles) {
        const filePath = join(commandsDir, file);
        try {
            const content = await readFile(filePath, 'utf-8');
            const result = parseCommand(filePath, content);
            commands.push(result);
        } catch (err) {
            if (err instanceof ParseError) {
                errors.push(err);
            } else {
                errors.push(new ParseError(filePath, err.message || 'Unknown error'));
            }
        }
    }

    return { commands, errors };
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = {
    parseCommand,
    parseAllCommands,
    ParseError,
};
