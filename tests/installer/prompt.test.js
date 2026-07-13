/**
 * Unit tests for src/utils/prompt.js.
 *
 * Exercises the four shapes of overwrite prompt the installer can hand
 * the file-copier: --overwrite (force overwrite), --no-overwrite (force
 * preserve), non-TTY (silent preserve), and interactive TTY (real
 * readline prompt driven by an injected input/output pair).
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');

const {
  createDefaultOverwritePrompt,
  createContainmentConsentPrompt,
} = require('../../src/utils/prompt');

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

test('--overwrite forces overwrite without touching stdin', async () => {
  const prompt = createDefaultOverwritePrompt({ forceOverwrite: true });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(decision, true, '--overwrite must short-circuit to overwrite');
});

test('--no-overwrite forces preserve without touching stdin', async () => {
  const prompt = createDefaultOverwritePrompt({ forcePreserve: true });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(
    decision,
    false,
    '--no-overwrite must short-circuit to preserve'
  );
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

test('forceOverwrite wins over forcePreserve when both are set', async () => {
  // Defensive: if a caller accidentally passes both flags, the explicit
  // overwrite request takes precedence. Document this here so any future
  // change to the precedence has to update an assertion.
  const prompt = createDefaultOverwritePrompt({
    forceOverwrite: true,
    forcePreserve: true,
  });
  const decision = await prompt({
    operation: sampleOperation,
    files: sampleFiles,
  });
  assert.equal(
    decision,
    true,
    'forceOverwrite must take precedence over forcePreserve'
  );
});

// ── createContainmentConsentPrompt — the four shapes of the consent decision ──
// Mirrors the overwrite prompt's four forms, but the safe default flips: this is
// a security lever, so a non-TTY run ENABLES (secure-by-default), the opposite
// of the overwrite prompt's non-TTY PRESERVE.

test('--containment forces enable without touching stdin', async () => {
  const prompt = createContainmentConsentPrompt({ forceEnable: true });
  assert.equal(await prompt(), true, '--containment must resolve to enable');
});

test('--no-containment forces decline without touching stdin', async () => {
  const prompt = createContainmentConsentPrompt({ forceDisable: true });
  assert.equal(
    await prompt(),
    false,
    '--no-containment must resolve to decline'
  );
});

test('non-TTY defaults to ENABLE (secure-by-default, opposite of overwrite)', async () => {
  const prompt = createContainmentConsentPrompt({ isTTY: false });
  assert.equal(
    await prompt(),
    true,
    'non-TTY containment default must be ENABLE — a silently-disabled guard is the risk this prevents'
  );
});

test('TTY consent prompt treats empty Enter as ENABLE (capital-Y default)', async () => {
  const { stream: out, text } = captureStream();
  const prompt = createContainmentConsentPrompt({
    isTTY: true,
    input: inputFrom('\n'),
    output: out,
  });
  assert.equal(
    await prompt(),
    true,
    'pressing Enter on the [Y/n] consent prompt must default to enable'
  );
  assert.match(
    text(),
    /Enable the awos-containment guard\?/,
    'the consent prompt must disclose what it is asking'
  );
});

test('TTY consent prompt accepts "y" as enable', async () => {
  const { stream: out } = captureStream();
  const prompt = createContainmentConsentPrompt({
    isTTY: true,
    input: inputFrom('y\n'),
    output: out,
  });
  assert.equal(await prompt(), true, '"y" must mean enable');
});

test('TTY consent prompt treats "n" as decline', async () => {
  const { stream: out } = captureStream();
  const prompt = createContainmentConsentPrompt({
    isTTY: true,
    input: inputFrom('n\n'),
    output: out,
  });
  assert.equal(await prompt(), false, '"n" must mean decline');
});
