'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const base = require('../lib/emitters/base-emitter.js');

describe('lib/emitters/base-emitter.js', () => {
    describe('DELEGATION_TYPES', () => {
        it('exposes subagent, sequential, manual types', () => {
            assert.equal(base.DELEGATION_TYPES.SUBAGENT, 'subagent');
            assert.equal(base.DELEGATION_TYPES.SEQUENTIAL, 'sequential');
            assert.equal(base.DELEGATION_TYPES.MANUAL, 'manual');
        });

        it('is frozen', () => {
            assert.throws(() => {
                base.DELEGATION_TYPES.NEW_TYPE = 'new';
            });
        });
    });

    describe('ADAPTERS_ROOT', () => {
        it('equals .awos-adapters', () => {
            assert.equal(base.ADAPTERS_ROOT, '.awos-adapters');
        });
    });

    describe('createEmitResult()', () => {
        it('returns object with empty files and warnings arrays', () => {
            const result = base.createEmitResult();
            assert.deepEqual(result, { files: [], warnings: [] });
        });

        it('returns independent instances on each call', () => {
            const a = base.createEmitResult();
            const b = base.createEmitResult();
            a.files.push({ relativePath: 'x', content: '', lineCount: 0 });
            assert.equal(b.files.length, 0);
        });
    });

    describe('createEmitWarning()', () => {
        it('creates warning with message only', () => {
            const warn = base.createEmitWarning('something went wrong');
            assert.equal(warn.message, 'something went wrong');
            assert.equal(warn.file, undefined);
            assert.equal(warn.source, undefined);
        });

        it('creates warning with message, file, and source', () => {
            const warn = base.createEmitWarning('oops', 'test.md', 'kiro');
            assert.equal(warn.message, 'oops');
            assert.equal(warn.file, 'test.md');
            assert.equal(warn.source, 'kiro');
        });

        it('throws on empty message', () => {
            assert.throws(
                () => base.createEmitWarning(''),
                /message must be a non-empty string/
            );
        });

        it('throws on non-string message', () => {
            assert.throws(
                () => base.createEmitWarning(42),
                /message must be a non-empty string/
            );
        });
    });

    describe('createGeneratedFile()', () => {
        it('creates file with computed lineCount', () => {
            const file = base.createGeneratedFile(
                'steering/implement.md',
                'line1\nline2\nline3'
            );
            assert.equal(file.relativePath, 'steering/implement.md');
            assert.equal(file.content, 'line1\nline2\nline3');
            assert.equal(file.lineCount, 3);
        });

        it('handles single-line content', () => {
            const file = base.createGeneratedFile('f.md', 'hello');
            assert.equal(file.lineCount, 1);
        });

        it('handles empty content', () => {
            const file = base.createGeneratedFile('f.md', '');
            assert.equal(file.lineCount, 0);
        });

        it('throws on empty relativePath', () => {
            assert.throws(
                () => base.createGeneratedFile('', 'content'),
                /relativePath must be a non-empty string/
            );
        });

        it('throws on non-string content', () => {
            assert.throws(
                () => base.createGeneratedFile('f.md', null),
                /content must be a string/
            );
        });
    });

    describe('prependHeader()', () => {
        it('prepends markdown header by default', () => {
            const result = base.prependHeader('# Title');
            assert.ok(result.startsWith('<!-- Auto-generated'));
            assert.ok(result.includes('\n\n# Title'));
        });

        it('prepends js-style header', () => {
            const result = base.prependHeader('const x = 1;', 'js');
            assert.ok(result.startsWith('// Auto-generated'));
            assert.ok(result.includes('\n\nconst x = 1;'));
        });

        it('prepends yaml-style header', () => {
            const result = base.prependHeader('key: value', 'yaml');
            assert.ok(result.startsWith('# Auto-generated'));
            assert.ok(result.includes('\n\nkey: value'));
        });

        it('returns content unchanged for json format', () => {
            const content = '{"key": "value"}';
            const result = base.prependHeader(content, 'json');
            assert.equal(result, content);
        });
    });

    describe('normalizeContextPath()', () => {
        it('strips leading ./', () => {
            assert.equal(
                base.normalizeContextPath('./context/spec/1/tasks.md'),
                'context/spec/1/tasks.md'
            );
        });

        it('strips leading /', () => {
            assert.equal(
                base.normalizeContextPath('/context/spec/1/tasks.md'),
                'context/spec/1/tasks.md'
            );
        });

        it('strips .awos-adapters/ prefix', () => {
            assert.equal(
                base.normalizeContextPath('.awos-adapters/kiro/steering/test.md'),
                'kiro/steering/test.md'
            );
        });

        it('leaves already-normalized paths unchanged', () => {
            assert.equal(
                base.normalizeContextPath('context/spec/file.md'),
                'context/spec/file.md'
            );
        });

        it('throws on empty string', () => {
            assert.throws(
                () => base.normalizeContextPath(''),
                /inputPath must be a non-empty string/
            );
        });
    });

    describe('resolveOutputPath()', () => {
        it('produces .awos-adapters/{provider}/{relativePath}', () => {
            assert.equal(
                base.resolveOutputPath('kiro', 'steering/implement.md'),
                '.awos-adapters/kiro/steering/implement.md'
            );
        });

        it('strips leading ./ from relativePath', () => {
            assert.equal(
                base.resolveOutputPath('cursor', './rules/spec.md'),
                '.awos-adapters/cursor/rules/spec.md'
            );
        });

        it('strips leading / from relativePath', () => {
            assert.equal(
                base.resolveOutputPath('codex', '/tasks/run.md'),
                '.awos-adapters/codex/tasks/run.md'
            );
        });

        it('throws on empty provider', () => {
            assert.throws(
                () => base.resolveOutputPath('', 'file.md'),
                /provider must be a non-empty string/
            );
        });

        it('throws on empty relativePath', () => {
            assert.throws(
                () => base.resolveOutputPath('kiro', ''),
                /relativePath must be a non-empty string/
            );
        });
    });

    describe('createDelegationStrategy()', () => {
        it('creates strategy with valid type and translate fn', () => {
            const fn = (del) => `sub: ${del.agentType}`;
            const strategy = base.createDelegationStrategy('subagent', fn);
            assert.equal(strategy.type, 'subagent');
            assert.equal(strategy.translate, fn);
        });

        it('accepts all valid types', () => {
            const fn = () => '';
            assert.doesNotThrow(() =>
                base.createDelegationStrategy('subagent', fn)
            );
            assert.doesNotThrow(() =>
                base.createDelegationStrategy('sequential', fn)
            );
            assert.doesNotThrow(() =>
                base.createDelegationStrategy('manual', fn)
            );
        });

        it('throws on invalid type', () => {
            assert.throws(
                () => base.createDelegationStrategy('parallel', () => ''),
                /type must be one of/
            );
        });

        it('throws when translate is not a function', () => {
            assert.throws(
                () => base.createDelegationStrategy('subagent', 'not-a-fn'),
                /translate must be a function/
            );
        });
    });

    describe('baseTranslate()', () => {
        it('produces generic delegation instruction', () => {
            const result = base.baseTranslate({
                agentType: 'general-task-execution',
                promptTemplate: 'implement task 3',
            });
            assert.ok(result.includes('general-task-execution'));
            assert.ok(result.includes('implement task 3'));
        });

        it('defaults agentType when missing', () => {
            const result = base.baseTranslate({ promptTemplate: 'do it' });
            assert.ok(result.includes('general-task-execution'));
        });

        it('handles empty promptTemplate', () => {
            const result = base.baseTranslate({
                agentType: 'my-agent',
                promptTemplate: '',
            });
            assert.ok(result.includes('my-agent'));
        });

        it('throws on null input', () => {
            assert.throws(
                () => base.baseTranslate(null),
                /delegation must be a non-null object/
            );
        });
    });

    describe('countLines()', () => {
        it('returns 0 for empty string', () => {
            assert.equal(base.countLines(''), 0);
        });

        it('returns 0 for null/undefined', () => {
            assert.equal(base.countLines(null), 0);
            assert.equal(base.countLines(undefined), 0);
        });

        it('returns 1 for single line without newline', () => {
            assert.equal(base.countLines('hello'), 1);
        });

        it('counts newlines correctly', () => {
            assert.equal(base.countLines('a\nb'), 2);
            assert.equal(base.countLines('a\nb\nc'), 3);
        });

        it('counts trailing newline as extra line', () => {
            assert.equal(base.countLines('a\n'), 2);
        });
    });
});
