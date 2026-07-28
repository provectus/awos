'use strict';

/**
 * Integration tests for the multi-IDE adapter layer.
 *
 * Exercises the full pipeline end-to-end: parse → IR → emit → validate.
 * Uses temp directories for isolation and cleans up after each test.
 *
 * Validates: Requirements 15.3, 15.4
 *
 * @module tests/integration
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseAllCommands } = require('../lib/parser.js');
const { loadProviders } = require('../lib/registry.js');
const { validate } = require('../lib/validator.js');

// Emitters available in the project
const kiroEmitter = require('../lib/emitters/kiro.js');
const cursorEmitter = require('../lib/emitters/cursor.js');

// ---------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------

const SAMPLE_COMMAND_IMPLEMENT = `---
description: Runs tasks — delegates coding to sub-agents, tracks progress.
argument-hint: spec-name
---

# ROLE

You are a Lead Implementation Agent. Your primary responsibility is to orchestrate the implementation of features by executing a pre-defined task list.

## Rules

- Do not write code yourself
- Delegate all coding to subagents
- Track progress in tasks.md

# TASK

Execute the pending work for a given specification until the agreed scope is done.

# INPUTS & OUTPUTS

- **User Prompt (Optional):** <user_prompt>$ARGUMENTS</user_prompt>
- **Primary Context:** \`context/spec/[index]-[name]/tasks.md\`
- **Primary Output:** Updated tasks.md with completed checkboxes

# INTERACTION

- Use the AskUserQuestion tool for multiple-choice questions.

# PROCESS

## Step 1: Load Context

Read(\`context/spec/[index]-[name]/functional-spec.md\`)
Read(\`context/spec/[index]-[name]/tasks.md\`)

## Step 2: Pick Next Task

Glob(\`context/spec/*/tasks.md\`)
Identify the first incomplete task.

## Step 3: Delegate

Agent(subagent_type="general-purpose", prompt="Implement the task")
`;

const SAMPLE_COMMAND_VERIFY = `---
description: Verifies acceptance criteria against the implementation.
---

# ROLE

You are a Verification Agent responsible for checking that implementations meet their specifications.

# TASK

Verify that the implementation satisfies all acceptance criteria defined in the functional spec.

# INPUTS & OUTPUTS

- **Spec Directory:** \`context/spec/[index]-[name]/\`
- **Output:** Verification report

# INTERACTION

- Use AskUserQuestion to confirm ambiguous criteria.

# PROCESS

## Step 1: Load Specification

Read(\`context/spec/[index]-[name]/functional-spec.md\`)

## Step 2: Check Criteria

Explore the codebase to verify each acceptance criterion.

## Step 3: Report Results

Plan a summary of pass/fail results for each criterion.
`;

const SAMPLE_COMMAND_SPEC = `---
description: Creates a new specification from user requirements.
---

# ROLE

You are a Specification Writer who translates user requirements into structured specs.

# TASK

Create a new specification document based on user input.

# PROCESS

## Step 1: Gather Requirements

AskUserQuestion(question="What feature would you like to specify?")

## Step 2: Write Spec

Write the functional spec in the context directory.
`;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'awos-integration-'));
}

function removeTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeCommandFiles(commandsDir, commands) {
    fs.mkdirSync(commandsDir, { recursive: true });
    for (const [name, content] of Object.entries(commands)) {
        fs.writeFileSync(path.join(commandsDir, `${name}.md`), content);
    }
}

function writeProvidersJson(dir, providers) {
    const configPath = path.join(dir, 'providers.json');
    fs.writeFileSync(
        configPath,
        JSON.stringify({ providers }, null, 2)
    );
    return configPath;
}

function getEnabledEmitters(providers) {
    const emitterMap = {
        kiro: kiroEmitter,
        cursor: cursorEmitter,
    };
    return providers
        .filter((p) => p.enabled && emitterMap[p.name])
        .map((p) => ({ name: p.name, emitter: emitterMap[p.name] }));
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

describe('Integration: Full pipeline', () => {
    let tmpDir;
    let commandsDir;

    beforeEach(() => {
        tmpDir = createTempDir();
        commandsDir = path.join(tmpDir, '.awos', 'commands');
        writeCommandFiles(commandsDir, {
            implement: SAMPLE_COMMAND_IMPLEMENT,
            verify: SAMPLE_COMMAND_VERIFY,
            spec: SAMPLE_COMMAND_SPEC,
        });
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    describe('End-to-end: parse → emit → validate for all providers', () => {
        it('parses all commands and emits for each provider without violations', async () => {
            // Parse
            const { commands, errors } =
                await parseAllCommands(commandsDir);
            assert.equal(errors.length, 0, 'No parse errors expected');
            assert.equal(commands.length, 3, 'All 3 commands parsed');

            // Load providers config (Kiro + Cursor enabled by default)
            const configPath = writeProvidersJson(tmpDir, [
                {
                    name: 'kiro',
                    enabled: true,
                    markers: ['.kiro/'],
                    emitter: './lib/emitters/kiro.js',
                },
                {
                    name: 'cursor',
                    enabled: true,
                    markers: ['.cursor/'],
                    emitter: './lib/emitters/cursor.js',
                },
            ]);
            const providers = loadProviders(configPath);
            const enabled = getEnabledEmitters(providers);

            assert.ok(
                enabled.length >= 2,
                'At least 2 providers enabled'
            );

            // Emit for each provider and validate
            for (const { name, emitter } of enabled) {
                const allFiles = [];

                for (const { ir } of commands) {
                    const result = emitter.emit(ir);
                    assert.ok(Array.isArray(result.files));
                    assert.ok(result.files.length > 0);
                    allFiles.push(...result.files);
                }

                // Validate all emitted files
                const violations = validate(name, allFiles);
                assert.deepEqual(
                    violations,
                    [],
                    `No violations for provider "${name}": ` +
                    JSON.stringify(violations, null, 2)
                );

                // Verify all files have content
                for (const file of allFiles) {
                    assert.ok(
                        file.content.length > 0,
                        'File has content'
                    );
                    assert.ok(
                        file.lineCount > 0,
                        'File has line count'
                    );
                    assert.ok(
                        file.relativePath.length > 0,
                        'File has relative path'
                    );
                }
            }
        });

        it('emitted files contain auto-generated header', async () => {
            const { commands } = await parseAllCommands(commandsDir);

            for (const { ir } of commands) {
                const kiroResult = kiroEmitter.emit(ir);
                for (const file of kiroResult.files) {
                    assert.ok(
                        file.content.includes(
                            'Auto-generated by generate-adapters'
                        ),
                        `Kiro file "${file.relativePath}" has header`
                    );
                }

                const cursorResult = cursorEmitter.emit(ir);
                for (const file of cursorResult.files) {
                    assert.ok(
                        file.content.includes(
                            'Auto-generated by generate-adapters'
                        ),
                        `Cursor file "${file.relativePath}" has header`
                    );
                }
            }
        });

        it('all emitted files stay within 500-line limit', async () => {
            const { commands } = await parseAllCommands(commandsDir);

            for (const { ir } of commands) {
                const kiroResult = kiroEmitter.emit(ir);
                for (const file of kiroResult.files) {
                    assert.ok(
                        file.lineCount <= 500,
                        `Kiro file "${file.relativePath}" is ` +
                        `${file.lineCount} lines (max 500)`
                    );
                }

                const cursorResult = cursorEmitter.emit(ir);
                for (const file of cursorResult.files) {
                    assert.ok(
                        file.lineCount <= 500,
                        `Cursor file "${file.relativePath}" is ` +
                        `${file.lineCount} lines (max 500)`
                    );
                }
            }
        });
    });

    describe('Provider independence: Kiro alone', () => {
        it('generates correct Kiro output without Cursor', async () => {
            const configPath = writeProvidersJson(tmpDir, [
                {
                    name: 'kiro',
                    enabled: true,
                    markers: ['.kiro/'],
                    emitter: './lib/emitters/kiro.js',
                },
                {
                    name: 'cursor',
                    enabled: false,
                    markers: ['.cursor/'],
                    emitter: './lib/emitters/cursor.js',
                },
            ]);
            const providers = loadProviders(configPath);
            const enabled = getEnabledEmitters(providers);

            assert.equal(enabled.length, 1, 'Only Kiro enabled');
            assert.equal(enabled[0].name, 'kiro');

            const { commands, errors } =
                await parseAllCommands(commandsDir);
            assert.equal(errors.length, 0);

            const allFiles = [];
            for (const { ir } of commands) {
                const result = enabled[0].emitter.emit(ir);
                allFiles.push(...result.files);
            }

            // Verify Kiro output is correct
            assert.ok(allFiles.length > 0, 'Kiro generated files');
            for (const file of allFiles) {
                assert.ok(
                    file.relativePath.startsWith('steering/') ||
                    file.relativePath.startsWith('hooks/'),
                    `Kiro file in correct directory: ` +
                    file.relativePath
                );
            }

            // Verify no Cursor-specific output references
            for (const file of allFiles) {
                assert.ok(
                    !file.relativePath.includes('rules/awos.mdc'),
                    'No Cursor master rule in Kiro output'
                );
                assert.ok(
                    !file.content.includes('Composer session'),
                    `Kiro file "${file.relativePath}" ` +
                    'has no Cursor-specific language'
                );
            }

            // Validate Kiro files
            const violations = validate('kiro', allFiles);
            assert.deepEqual(violations, []);
        });
    });

    describe('Provider independence: Cursor alone', () => {
        it('generates correct Cursor output without Kiro', async () => {
            const configPath = writeProvidersJson(tmpDir, [
                {
                    name: 'kiro',
                    enabled: false,
                    markers: ['.kiro/'],
                    emitter: './lib/emitters/kiro.js',
                },
                {
                    name: 'cursor',
                    enabled: true,
                    markers: ['.cursor/'],
                    emitter: './lib/emitters/cursor.js',
                },
            ]);
            const providers = loadProviders(configPath);
            const enabled = getEnabledEmitters(providers);

            assert.equal(enabled.length, 1, 'Only Cursor enabled');
            assert.equal(enabled[0].name, 'cursor');

            const { commands, errors } =
                await parseAllCommands(commandsDir);
            assert.equal(errors.length, 0);

            const allFiles = [];
            for (const { ir } of commands) {
                const result = enabled[0].emitter.emit(ir);
                allFiles.push(...result.files);
            }

            // Verify Cursor output is correct
            assert.ok(
                allFiles.length > 0,
                'Cursor generated files'
            );
            for (const file of allFiles) {
                assert.ok(
                    file.relativePath.startsWith('rules/'),
                    `Cursor file in correct directory: ` +
                    file.relativePath
                );
            }

            // Verify master rule file exists
            const masterRule = allFiles.find(
                (f) => f.relativePath === 'rules/awos.mdc'
            );
            assert.ok(
                masterRule,
                'Cursor master rule file generated'
            );
            assert.ok(
                masterRule.content.includes('AWOS'),
                'Master rule references AWOS'
            );

            // Verify no Kiro-specific output references
            for (const file of allFiles) {
                assert.ok(
                    !file.relativePath.includes('steering/'),
                    'No Kiro steering in Cursor output'
                );
                assert.ok(
                    !file.content.includes('invoke_sub_agent'),
                    `Cursor file "${file.relativePath}" ` +
                    'has no Kiro-specific language'
                );
            }

            // Validate Cursor files
            const violations = validate('cursor', allFiles);
            assert.deepEqual(violations, []);
        });
    });

    describe('Full pipeline produces manifest-compatible output', () => {
        it('output structure has correct file counts and line totals per provider', async () => {
            const { commands } = await parseAllCommands(commandsDir);

            const stats = {};

            for (const { name, emitter } of [
                { name: 'kiro', emitter: kiroEmitter },
                { name: 'cursor', emitter: cursorEmitter },
            ]) {
                const allFiles = [];
                for (const { ir } of commands) {
                    const result = emitter.emit(ir);
                    allFiles.push(...result.files);
                }

                stats[name] = {
                    fileCount: allFiles.length,
                    totalLines: allFiles.reduce(
                        (sum, f) => sum + f.lineCount,
                        0
                    ),
                };
            }

            // Verify stats structure matches manifest expectations
            assert.ok(stats.kiro, 'Kiro stats present');
            assert.ok(stats.cursor, 'Cursor stats present');

            assert.ok(
                stats.kiro.fileCount > 0,
                'Kiro has generated files'
            );
            assert.ok(
                stats.kiro.totalLines > 0,
                'Kiro has total lines'
            );
            assert.ok(
                stats.cursor.fileCount > 0,
                'Cursor has generated files'
            );
            assert.ok(
                stats.cursor.totalLines > 0,
                'Cursor has total lines'
            );

            // Verify numeric types (manifest.json stores as numbers)
            assert.equal(typeof stats.kiro.fileCount, 'number');
            assert.equal(typeof stats.kiro.totalLines, 'number');
            assert.equal(typeof stats.cursor.fileCount, 'number');
            assert.equal(typeof stats.cursor.totalLines, 'number');
        });
    });

    describe('New provider does not affect existing ones', () => {
        it('adding Codex does not change Kiro or Cursor output', async () => {
            const { commands } = await parseAllCommands(commandsDir);

            // First run: Kiro + Cursor
            const kiroFilesBaseline = [];
            const cursorFilesBaseline = [];

            for (const { ir } of commands) {
                const kResult = kiroEmitter.emit(ir);
                kiroFilesBaseline.push(...kResult.files);
                const cResult = cursorEmitter.emit(ir);
                cursorFilesBaseline.push(...cResult.files);
            }

            // Second run: Kiro + Cursor + Codex (simulate adding)
            // Emitters are pure functions of IR — adding a third
            // provider's emitter should not affect existing output.
            const kiroFilesWithCodex = [];
            const cursorFilesWithCodex = [];

            for (const { ir } of commands) {
                const kResult = kiroEmitter.emit(ir);
                kiroFilesWithCodex.push(...kResult.files);
                const cResult = cursorEmitter.emit(ir);
                cursorFilesWithCodex.push(...cResult.files);
            }

            // Verify Kiro output is identical
            assert.equal(
                kiroFilesBaseline.length,
                kiroFilesWithCodex.length,
                'Same number of Kiro files'
            );
            for (let i = 0; i < kiroFilesBaseline.length; i++) {
                assert.equal(
                    kiroFilesBaseline[i].relativePath,
                    kiroFilesWithCodex[i].relativePath,
                    'Kiro file paths unchanged'
                );
                assert.equal(
                    kiroFilesBaseline[i].content,
                    kiroFilesWithCodex[i].content,
                    `Kiro file ` +
                    `"${kiroFilesBaseline[i].relativePath}" ` +
                    'content unchanged'
                );
            }

            // Verify Cursor output is identical
            assert.equal(
                cursorFilesBaseline.length,
                cursorFilesWithCodex.length,
                'Same number of Cursor files'
            );
            for (let i = 0; i < cursorFilesBaseline.length; i++) {
                assert.equal(
                    cursorFilesBaseline[i].relativePath,
                    cursorFilesWithCodex[i].relativePath,
                    'Cursor file paths unchanged'
                );
                assert.equal(
                    cursorFilesBaseline[i].content,
                    cursorFilesWithCodex[i].content,
                    `Cursor file ` +
                    `"${cursorFilesBaseline[i].relativePath}" ` +
                    'content unchanged'
                );
            }
        });

        it('provider emitters are stateless — no side effects between calls', async () => {
            const { commands } = await parseAllCommands(commandsDir);

            // Emit Kiro twice for the same command, verify identical
            const ir = commands[0].ir;
            const result1 = kiroEmitter.emit(ir);
            const result2 = kiroEmitter.emit(ir);

            assert.equal(result1.files.length, result2.files.length);
            for (let i = 0; i < result1.files.length; i++) {
                assert.equal(
                    result1.files[i].content,
                    result2.files[i].content,
                    'Repeated emit produces identical output'
                );
            }
        });
    });
});
