/**
 * Unit tests for src/utils/prompt.js.
 *
 * Exercises the four shapes of overwrite prompt the installer can hand
 * the file-copier: --yes (force overwrite), --no (force preserve),
 * non-TTY (silent preserve), and interactive TTY (real readline prompt
 * driven by an injected input/output pair).
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');

const { createDefaultOverwritePrompt } = require('../../src/utils/prompt');

function captureStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString('utf8'));
      cb();
    },
  });
  return { stream, text: () => chunks.join('') };
}

function inputFrom(s) {
  return Readable.from([s]);
}

const sampleOperation = {
  source: 'claude/commands',
  destination: '.claude/commands/awos',
  manualUpdateUrl: 'https://example.invalid/wrappers',
};
const sampleFiles = [
  '/tmp/.claude/commands/awos/architecture.md',
  '/tmp/.claude/commands/awos/spec.md',
];

test('--yes forces overwrite without touching stdin', async () => {
  const prompt = createDefaultOverwritePrompt({ forceYes: true });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(decision, true, '--yes must short-circuit to overwrite');
});

test('--no forces preserve without touching stdin', async () => {
  const prompt = createDefaultOverwritePrompt({ forceNo: true });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(decision, false, '--no must short-circuit to preserve');
});

test('non-TTY defaults to preserve (safe for CI / piped runs)', async () => {
  const prompt = createDefaultOverwritePrompt({ isTTY: false });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(
    decision,
    false,
    'non-TTY default must be preserve — silent overwrite is the bug this skill prevents'
  );
});

test('TTY prompt accepts "y" as overwrite confirmation', async () => {
  const { stream: out, text } = captureStream();
  const prompt = createDefaultOverwritePrompt({
    isTTY: true,
    input: inputFrom('y\n'),
    output: out,
  });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(decision, true, '"y" must mean overwrite');
  const rendered = text();
  assert.match(
    rendered,
    /already contains files that would be overwritten/,
    'prompt must explain why it is asking'
  );
  for (const f of sampleFiles) {
    assert.ok(
      rendered.includes(require('node:path').basename(f)),
      `prompt must list conflicting file ${f}`
    );
  }
  assert.match(
    rendered,
    /example\.invalid\/wrappers/,
    'prompt must include the manualUpdateUrl so users can update by hand if they skip'
  );
});

test('TTY prompt treats empty answer as preserve (capital-N default)', async () => {
  const { stream: out } = captureStream();
  const prompt = createDefaultOverwritePrompt({
    isTTY: true,
    input: inputFrom('\n'),
    output: out,
  });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(
    decision,
    false,
    'pressing Enter on the [y/N] prompt must default to preserve'
  );
});

test('TTY prompt treats anything other than y/yes as preserve', async () => {
  const { stream: out } = captureStream();
  const prompt = createDefaultOverwritePrompt({
    isTTY: true,
    input: inputFrom('maybe\n'),
    output: out,
  });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(decision, false, 'ambiguous answers must default to preserve');
});

test('forceYes wins over forceNo when both are set', async () => {
  // Defensive: if a caller accidentally passes both flags, the explicit
  // overwrite request takes precedence. Document this here so any future
  // change to the precedence has to update an assertion.
  const prompt = createDefaultOverwritePrompt({
    forceYes: true,
    forceNo: true,
  });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(decision, true, 'forceYes must take precedence over forceNo');
});
