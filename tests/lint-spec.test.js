'use strict';

// Contract tests for scripts/lint-spec.mjs, the document-level check
// /awos:spec runs right after writing functional-spec.md. The command's
// process rigor cannot prove anything about the produced file; this script
// does: unresolved [NEEDS CLARIFICATION] markers, criteria without a
// when/then sentence and numbered requirements without criteria are errors
// (exit 1); weak words from the Step 6 self-review list are warnings only.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const script = path.join(repoRoot, 'scripts', 'lint-spec.mjs');

// A spec in the shape templates/functional-spec-template.md asks for:
// numbered ### 2.N requirements, each a one-sentence statement with
// when/then criteria, quoted on-screen text, a table-backed criterion.
const CLEAN_MD = `# Functional Specification: Password Reset

- **Topic:** Let users reset a forgotten password
- **Status:** Draft
- **Author:** Test Author

---

## 1. Overview and Rationale (The "Why")

Locked-out users should have an easy, fast way back in. Some of them give up today.

---

## 2. Functional Requirements (The "What")

### 2.1 Request a password reset

When a signed-out user submits the "Forgot password" form with the email address of an existing account, they receive an email containing a reset link that stays valid for 60 minutes.

- **Acceptance Criteria:**
  - [ ] Given the user is signed out, when they click "Forgot password?" on the sign-in page, then they see a page with a single email field and a "Send reset link" button.
  - [x] When the user submits the email address of an existing account, then they see: "If an account exists for this address, we've sent a reset link." and receive the email within 2 minutes.
  - [ ] When the user submits the form with the email field empty, then they
        see: "Enter your email address." and no email is sent.

### 2.2 Choose a new password

When the user opens a valid reset link, they can set a new password that meets the rules in the table below.

| Password entered         | Outcome                                  |
| ------------------------ | ---------------------------------------- |
| Fewer than 12 characters | Not saved; "Use at least 12 characters." |

- **Acceptance Criteria:**
  - [ ] When the user submits a password from any row of the table above, then they see the outcome in that row.

---

## 3. Scope and Boundaries

### In-Scope

- Email-based reset

### Out-of-Scope

- SMS reset — **deferred**: a later spec covers phone numbers

---

## 4. Assumptions

_Open questions stay inline as a \`[NEEDS CLARIFICATION: …]\` marker next to the sentence they affect._

- Every account has a verified email address — if wrong: 2.1 needs a fallback channel
`;

// 1-based line of the first line containing `needle` — tests compute the
// expected line from the fixture instead of hardcoding a number.
function lineOf(md, needle) {
  const idx = md.split('\n').findIndex((l) => l.includes(needle));
  assert.notStrictEqual(idx, -1, `fixture must contain "${needle}"`);
  return idx + 1;
}

function runLint(md, { json = false, asFile = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-spec-'));
  const file = path.join(dir, 'functional-spec.md');
  fs.writeFileSync(file, md);
  const args = [script, asFile ? file : dir];
  if (json) args.push('--json');
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return {
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    result: json ? JSON.parse(run.stdout) : null,
  };
}

test('a spec in the template shape passes with zero errors and exit 0', () => {
  const { status, stdout, result } = runLint(CLEAN_MD, { json: true });
  assert.strictEqual(
    status,
    0,
    `a compliant spec must exit 0 — the linter must not reject the shape the template asks for; stdout: ${stdout}`
  );
  assert.deepStrictEqual(
    result.errors,
    [],
    'a compliant spec must report no errors — every criterion carries when/then and every requirement has a criterion'
  );
  assert.strictEqual(
    result.counts.requirements,
    2,
    'both ### 2.N subsections must be counted as requirements'
  );
  assert.strictEqual(
    result.counts.criteria,
    4,
    'every checkbox criterion must be counted, including the one wrapped over two lines'
  );
});

test('a backticked marker mention is a convention reference, not an unresolved marker', () => {
  // CLEAN_MD's Assumptions guidance quotes `[NEEDS CLARIFICATION: …]` in
  // inline code — the template does the same — and must not count.
  const { result } = runLint(CLEAN_MD, { json: true });
  assert.strictEqual(
    result.counts.markers,
    0,
    'a marker inside inline code must not be reported as unresolved — the template itself mentions the convention that way'
  );
});

test('the installed template passes the lint when it carries numbered requirements', (t) => {
  // The template's example criteria are compliant by design. The check is
  // meaningful only once the template numbers its requirements (### 2.N);
  // the flat legacy shape predates the when/then rule and is skipped here.
  const template = fs.readFileSync(
    path.join(repoRoot, 'templates', 'functional-spec-template.md'),
    'utf8'
  );
  if (!/^### 2\.\d+/m.test(template)) {
    t.skip(
      'templates/functional-spec-template.md has no ### 2.N requirements yet — lint check deferred to the numbered template'
    );
    return;
  }
  const { status, stdout } = runLint(template, { json: true });
  assert.strictEqual(
    status,
    0,
    `templates/functional-spec-template.md must pass lint-spec with zero errors — its example criteria are the model every spec copies; stdout: ${stdout}`
  );
});

test('raw [NEEDS CLARIFICATION] markers are errors with a count and line numbers', () => {
  const md = CLEAN_MD.replace(
    'stays valid for 60 minutes.',
    'stays valid for 60 minutes. [NEEDS CLARIFICATION: assumed 60 minutes; confirm.]'
  ).replace(
    '- SMS reset — **deferred**',
    '- SMS reset [NEEDS CLARIFICATION: assumed out of scope; confirm or pull it in.] — **deferred**'
  );
  const { status, result, stdout } = runLint(md, { json: true });
  assert.strictEqual(
    status,
    1,
    'an unresolved marker must fail the lint — building over an open question is the bug this check exists to catch'
  );
  const markers = result.errors.filter((e) => e.code === 'unresolved-marker');
  assert.strictEqual(
    markers.length,
    2,
    'every raw marker must be reported, one error each'
  );
  assert.strictEqual(
    result.counts.markers,
    2,
    'counts.markers must equal the number of raw markers in the file'
  );
  assert.deepStrictEqual(
    markers.map((m) => m.line),
    [lineOf(md, 'assumed 60 minutes'), lineOf(md, 'SMS reset')],
    'each marker error must carry the 1-based line number of the marker'
  );
  assert.ok(
    stdout.includes('unresolved-marker'),
    'the JSON report must name the error code so a caller can branch on it'
  );
});

test('a criterion without when and then in one sentence is an error', () => {
  const md = CLEAN_MD.replace(
    '  - [ ] When the user submits a password from any row of the table above, then they see the outcome in that row.',
    [
      '  - [ ] The user submits a password from the table. They see the outcome in that row.',
      '  - [ ] When the user submits a password from the table. Then they see the outcome in that row.',
      '  - [ ] Given the user is signed out, the sign-in dialog appears.',
      '  - [ ] Then the user sees the outcome, when they submit a password.',
    ].join('\n')
  );
  const { status, result } = runLint(md, { json: true });
  assert.strictEqual(status, 1, 'a malformed criterion must fail the lint');
  const shape = result.errors.filter((e) => e.code === 'criterion-shape');
  assert.strictEqual(
    shape.length,
    4,
    'a declarative retelling, a when/then split across two sentences, a Given with no pair, and then-before-when must each be reported'
  );
  const first = lineOf(md, 'The user submits a password from the table.');
  assert.ok(
    shape.every((e) => e.line >= first && e.line <= first + 3),
    `criterion-shape errors must point at the offending checkbox lines; got ${shape.map((e) => e.line).join(', ')}`
  );
});

test('when/then matching is case-insensitive and ignores periods inside quoted on-screen text', () => {
  const md = CLEAN_MD.replace(
    '  - [ ] When the user submits a password from any row of the table above, then they see the outcome in that row.',
    [
      '  - [ ] WHEN the user submits the form, THEN they see "Saved." on screen.',
      "  - [ ] When the user saves, then they see: 'Done. Your password is set.' and the dialog closes.",
      '  - [ ] When the user uploads 5.5 MB, then they see: "File too large. Maximum size is 5 MB."',
    ].join('\n')
  );
  const { status, result } = runLint(md, { json: true });
  assert.strictEqual(
    status,
    0,
    `uppercase keywords, a period inside quotes and a decimal must not break a compliant criterion; errors: ${JSON.stringify(result.errors)}`
  );
});

test('a ### 2.N requirement with zero criteria is an error', () => {
  const md = CLEAN_MD.replace(
    /- \*\*Acceptance Criteria:\*\*\n  - \[ \] When the user submits a password from any row[^\n]*\n/,
    ''
  );
  const { status, result } = runLint(md, { json: true });
  assert.strictEqual(
    status,
    1,
    'a requirement without any acceptance criterion must fail the lint'
  );
  const missing = result.errors.filter(
    (e) => e.code === 'requirement-without-criteria'
  );
  assert.strictEqual(
    missing.length,
    1,
    'only the requirement that lost its criteria must be reported'
  );
  assert.ok(
    missing[0].message.includes('2.2'),
    'the error must name the requirement by its number'
  );
  assert.strictEqual(
    missing[0].line,
    lineOf(md, '### 2.2'),
    'the error must point at the ### 2.N heading line'
  );
});

test('weak words in Functional Requirements are warnings with line numbers, never errors', () => {
  const md = CLEAN_MD.replace(
    'they receive an email containing a reset link that stays valid for 60 minutes.',
    'the system handles the request quickly and sends several emails, notifications, etc. and/or a text message as appropriate.'
  );
  const { status, result, stdout } = runLint(md, { json: true });
  assert.strictEqual(
    status,
    0,
    'weak words are warnings — they must not fail the lint, the self-review decides whether each one needs a number or a marker'
  );
  assert.deepStrictEqual(result.errors, [], 'weak words must never be errors');
  const labels = result.warnings.map((w) => w.message.match(/"([^"]+)"/)[1]);
  for (const expected of [
    'handle',
    'quickly',
    'several',
    'etc.',
    'and/or',
    'as appropriate',
  ]) {
    assert.ok(
      labels.includes(expected),
      `the weak-word list from commands/spec.md Step 6 must flag "${expected}"; flagged: ${labels.join(', ')}`
    );
  }
  const line = lineOf(md, 'handles the request quickly');
  assert.ok(
    result.warnings.every((w) => w.line === line),
    `every weak-word warning must carry the line number of the sentence; got ${result.warnings.map((w) => w.line).join(', ')}`
  );
  assert.ok(
    stdout.includes('"code": "weak-word"'),
    'warnings must carry the weak-word code in the JSON report'
  );
});

test('weak words outside Functional Requirements and inside quoted text are not reported, and "should" is not a weak word', () => {
  // CLEAN_MD's Overview says "easy, fast" and "Some of them" and "should":
  // the narrative section may stay qualitative (spec.md Step 6).
  const { result } = runLint(CLEAN_MD, { json: true });
  assert.deepStrictEqual(
    result.warnings,
    [],
    'weak words in the Overview must not warn — only Functional Requirements are scanned'
  );
  const quoted = CLEAN_MD.replace(
    'then they see the outcome in that row.',
    'then they see: "Easy! Several items were processed." and the dialog closes. The form should close.'
  );
  const { result: quotedResult } = runLint(quoted, { json: true });
  assert.deepStrictEqual(
    quotedResult.warnings,
    [],
    'words inside quoted on-screen text are a verbatim contract and must not warn, and "should" is excluded from the list'
  );
});

test('a legacy flat spec with no ## 2 section is still linted end to end', () => {
  const md = `# Functional Specification: Legacy

## Requirements

- As a user, I want to export.
  - **Acceptance Criteria:**
    - [ ] When the user taps Export, then a file downloads.
    - [ ] The export handles many rows.
`;
  const { status, result } = runLint(md, { json: true });
  assert.strictEqual(
    status,
    1,
    'the flat shape has no ### 2.N headings but its criteria are still checked'
  );
  assert.strictEqual(
    result.counts.requirements,
    0,
    'no numbered requirements must be counted in the flat shape'
  );
  assert.strictEqual(
    result.errors.filter((e) => e.code === 'criterion-shape').length,
    1,
    'the declarative criterion must be the single error'
  );
  assert.ok(
    result.warnings.some((w) => w.message.includes('"handle"')) &&
      result.warnings.some((w) => w.message.includes('"many"')),
    'without a ## 2 section the whole file is scanned for weak words'
  );
});

test('human-readable report names the file, line, code and a summary line; a file path works as the target too', () => {
  const md = CLEAN_MD.replace(
    'then they see the outcome in that row.',
    'they see the outcome in that row. [NEEDS CLARIFICATION: which row?]'
  );
  const { status, stdout } = runLint(md, { asFile: true });
  assert.strictEqual(status, 1, 'errors must exit 1 in the text mode too');
  const line = lineOf(md, 'which row?');
  assert.match(
    stdout,
    new RegExp(
      `^error: .*functional-spec\\.md:${line}: \\[unresolved-marker\\] `,
      'm'
    ),
    'the text report must print error: <file>:<line>: [<code>] so an editor can jump to it'
  );
  assert.match(
    stdout,
    new RegExp(
      `^error: .*functional-spec\\.md:${line}: \\[criterion-shape\\] `,
      'm'
    ),
    'the same criterion losing its when/then must be reported as a shape error'
  );
  assert.match(
    stdout,
    /^failed: 2 error\(s\), 0 warning\(s\)/m,
    'the last line must summarize the counts so a caller sees the verdict without parsing'
  );
});

test('a missing target or unreadable spec exits 2 with a usage or read error', () => {
  const noArgs = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.strictEqual(noArgs.status, 2, 'no target must be a usage error');
  assert.match(noArgs.stderr, /Usage:/, 'usage must be printed on stderr');
  const missing = spawnSync(
    process.execPath,
    [script, path.join(os.tmpdir(), 'lint-spec-does-not-exist')],
    { encoding: 'utf8' }
  );
  assert.strictEqual(
    missing.status,
    2,
    'an unreadable spec must exit 2, distinct from lint failures (1)'
  );
  assert.match(
    missing.stderr,
    /cannot read spec/,
    'the read failure must be explained on stderr'
  );
});

test('lint-spec.mjs imports only node: built-ins — it ships into .awos/scripts/ with no dependencies', () => {
  const src = fs.readFileSync(script, 'utf8');
  assert.ok(
    !/from ['"](?!node:)/.test(src),
    'lint-spec.mjs must import only node: built-ins — users run it from .awos/scripts/ without an install step'
  );
});
