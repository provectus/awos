'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand, ParseError } = require('../lib/parser.js');

describe('lib/parser.js', () => {
    describe('parseCommand — valid inputs', () => {
        it('parses a minimal valid command with all 5 sections', () => {
            const content = [
                '---',
                'description: Test command',
                'argument-hint: <file>',
                '---',
                '# ROLE',
                'You are a Test Agent that does testing.',
                '# TASK',
                'Run the tests for the project.',
                '# INPUTS & OUTPUTS',
                '- **TestFile**: The input file',
                '# INTERACTION',
                'Use AskUserQuestion for confirmations.',
                '# PROCESS',
                '## Step 1: Load files',
                'Read the relevant context.',
            ].join('\n');

            const { ir, warnings } = parseCommand('test-cmd.md', content);
            assert.equal(ir.name, 'test-cmd');
            assert.ok(ir.role.title.length > 0);
            assert.ok(ir.task.goal.length > 0);
            assert.ok(ir.process.steps.length >= 1);
            assert.ok(Array.isArray(warnings));
        });

        it('extracts YAML frontmatter correctly (description, argument-hint)', () => {
            const content = [
                '---',
                'description: Runs implementation tasks',
                "argument-hint: '<spec-name>'",
                '---',
                '# ROLE',
                'You are a Lead Agent.',
                '# TASK',
                'Execute pending work.',
                '# PROCESS',
                '## Step 1: Begin',
                'Start working.',
            ].join('\n');

            const { ir } = parseCommand('implement.md', content);
            assert.equal(ir.frontmatter.description, 'Runs implementation tasks');
            assert.equal(ir.frontmatter.argumentHint, '<spec-name>');
        });

        it('identifies tool references within PROCESS steps', () => {
            const content = [
                '# ROLE',
                'You are a coding agent.',
                '# TASK',
                'Implement features.',
                '# PROCESS',
                '## Step 1: Read context',
                'Use Read(context/tasks.md) to load the task list.',
                '## Step 2: Delegate work',
                'Use Agent(subagent_type=coder) to implement.',
            ].join('\n');

            const { ir } = parseCommand('impl.md', content);
            assert.ok(ir.process.steps.length >= 2);

            const step1Refs = ir.process.steps[0].toolReferences;
            assert.ok(step1Refs.length >= 1);
            assert.equal(step1Refs[0].tool, 'Read');

            const step2Refs = ir.process.steps[1].toolReferences;
            assert.ok(step2Refs.length >= 1);
            assert.equal(step2Refs[0].tool, 'Agent');
        });

        it('handles empty process section gracefully', () => {
            const content = [
                '# ROLE',
                'You are a test agent.',
                '# TASK',
                'Do something.',
                '# PROCESS',
                '',
            ].join('\n');

            const { ir } = parseCommand('empty-proc.md', content);
            assert.deepEqual(ir.process.steps, []);
        });

        it('handles missing frontmatter (defaults to null values)', () => {
            const content = [
                '# ROLE',
                'You are an agent.',
                '# TASK',
                'Execute tasks.',
                '# PROCESS',
                '## Step 1: Go',
                'Do things.',
            ].join('\n');

            const { ir } = parseCommand('no-fm.md', content);
            assert.equal(ir.frontmatter.description, null);
            assert.equal(ir.frontmatter.argumentHint, null);
        });

        it('derives command name from filename', () => {
            const content = [
                '# ROLE',
                'You are a planner.',
                '# TASK',
                'Create a plan.',
                '# PROCESS',
                '## Step 1: Plan',
                'Think about it.',
            ].join('\n');

            const { ir } = parseCommand('/path/to/my-command.md', content);
            assert.equal(ir.name, 'my-command');
        });
    });

    describe('parseCommand — error cases', () => {
        it('reports errors for files without ROLE or TASK sections', () => {
            const content = [
                '# SOMETHING ELSE',
                'This is not a valid AWOS command.',
                '',
                'No ROLE, TASK, or PROCESS here.',
            ].join('\n');

            assert.throws(
                () => parseCommand('bad.md', content),
                (err) => {
                    assert.ok(err instanceof ParseError);
                    assert.ok(err.message.includes('Missing required sections'));
                    return true;
                }
            );
        });

        it('throws ParseError for empty file', () => {
            assert.throws(
                () => parseCommand('empty.md', ''),
                (err) => {
                    assert.ok(err instanceof ParseError);
                    assert.ok(err.message.includes('empty'));
                    return true;
                }
            );
        });

        it('throws ParseError for whitespace-only file', () => {
            assert.throws(
                () => parseCommand('blank.md', '   \n\n  '),
                (err) => {
                    assert.ok(err instanceof ParseError);
                    return true;
                }
            );
        });
    });

    describe('parseCommand — section extraction edge cases', () => {
        it('handles content with only ROLE and TASK (no PROCESS)', () => {
            const content = [
                '# ROLE',
                'You are a helper.',
                '# TASK',
                'Help the user.',
            ].join('\n');

            const { ir } = parseCommand('minimal.md', content);
            assert.equal(ir.role.description.length > 0, true);
            assert.equal(ir.task.body.length > 0, true);
        });

        it('extracts role rules from sub-headings', () => {
            const content = [
                '# ROLE',
                'You are a strict agent.',
                '## Rules',
                '- Never modify upstream files',
                '- Always validate output',
                '# TASK',
                'Do the work.',
                '# PROCESS',
                '## Step 1: Start',
                'Begin.',
            ].join('\n');

            const { ir } = parseCommand('rules.md', content);
            assert.ok(ir.role.rules.length >= 2);
            assert.ok(ir.role.rules[0].includes('Never modify'));
        });

        it('parses IO section with inputs and outputs', () => {
            const content = [
                '# ROLE',
                'You are an agent.',
                '# TASK',
                'Process data.',
                '# INPUTS & OUTPUTS',
                '- **User Prompt**: The user input',
                '- **Output Report**: Summary of results',
                '# PROCESS',
                '## Step 1: Process',
                'Do processing.',
            ].join('\n');

            const { ir } = parseCommand('io.md', content);
            assert.ok(ir.io.inputs.length >= 1 || ir.io.outputs.length >= 1);
        });

        it('handles code blocks within sections without extracting tools', () => {
            const content = [
                '# ROLE',
                'You are a coder.',
                '# TASK',
                'Write code.',
                '# PROCESS',
                '## Step 1: Example',
                'Here is an example:',
                '```',
                'Agent(subagent_type=fake)',
                'Read(something)',
                '```',
                'The real tool: Read(tasks.md)',
            ].join('\n');

            const { ir } = parseCommand('code-block.md', content);
            const step = ir.process.steps[0];
            // Tool refs from inside code blocks should be excluded
            const readRefs = step.toolReferences.filter((r) => r.tool === 'Read');
            // Only the Read outside the code block should be captured
            assert.equal(readRefs.length, 1);
        });
    });
});
