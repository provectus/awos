/**
 * Scenario assertion: /awos:architecture builds an honest coverage
 * table.
 *
 * The contract (from commands/architecture.md, Step 4):
 *   - Read product-definition.md and roadmap.md as inputs.
 *   - Scan .claude/agents/ to discover specialist subagents.
 *   - Write context/product/architecture.md.
 *   - Append a coverage table mapping each architecture technology to a
 *     registered specialist, marked ✅ Exists or ⚠️ Missing.
 *
 * The fixture deliberately seeds python-expert and withholds react-expert.
 * A correctly-following Claude must produce a table where at least one
 * row is ✅ Exists (Python) and at least one is ⚠️ Missing (React).
 *
 * Each `check` is one independently-narratable assertion.
 */

'use strict';

const { expectFileExists } = require('../../expect');

const AGENTS_PATH_RE = /\.claude\/agents/;

/**
 * Tolerant discovery union — same shape as
 * tasks-enumerates-agents/assert.js. Accepts any of:
 *   Glob/Read/LS/Grep targeting .claude/agents/
 *   Agent/Task delegation whose prompt mentions the path
 *   Explore-typed delegation regardless of prompt
 */
function discoveryHits(toolCalls) {
  return toolCalls.filter((call) => {
    const input = call.input || {};
    if (call.name === 'Glob')
      return AGENTS_PATH_RE.test(String(input.pattern || ''));
    if (call.name === 'Read')
      return AGENTS_PATH_RE.test(String(input.file_path || ''));
    if (call.name === 'LS')
      return AGENTS_PATH_RE.test(String(input.path || ''));
    if (call.name === 'Grep') {
      return AGENTS_PATH_RE.test(String(input.path || input.glob || ''));
    }
    if (call.name === 'Agent' || call.name === 'Task') {
      return (
        AGENTS_PATH_RE.test(String(input.prompt || '')) ||
        AGENTS_PATH_RE.test(String(input.description || '')) ||
        /Explore/i.test(String(input.subagent_type || ''))
      );
    }
    return false;
  });
}

function readCallOn(toolCalls, relPathRe) {
  return toolCalls.find(
    (c) => c.name === 'Read' && relPathRe.test(String(c.input?.file_path || ''))
  );
}

module.exports = async function run({ check, toolCalls, workdir }) {
  const archPath = 'context/product/architecture.md';

  await check('Claude scanned .claude/agents/ for specialist subagents', () => {
    const hits = discoveryHits(toolCalls);
    if (hits.length === 0) {
      throw new Error(
        'no Glob/Read/LS/Grep against .claude/agents/, and no Agent ' +
          'delegation mentioning it — coverage table would be guesswork'
      );
    }
  });

  await check('Claude read product-definition.md', () => {
    if (!readCallOn(toolCalls, /context\/product\/product-definition\.md$/)) {
      throw new Error(
        'no Read on context/product/product-definition.md — the ' +
          'architecture command must read its prerequisites'
      );
    }
  });

  await check('Claude read roadmap.md', () => {
    if (!readCallOn(toolCalls, /context\/product\/roadmap\.md$/)) {
      throw new Error(
        'no Read on context/product/roadmap.md — the architecture ' +
          'command must read its prerequisites'
      );
    }
  });

  await check(`architecture.md was written at ${archPath}`, () => {
    expectFileExists(workdir, archPath);
  });

  await check('architecture.md contains a coverage table', () => {
    // Tolerant header match: prompt template uses
    //   | Technology | Recommended Subagent Role | Status |
    // but we accept any markdown table whose header row mentions
    // "Technology" and a status-ish column. Authors sometimes
    // restyle these slightly.
    expectFileExists(
      workdir,
      archPath,
      /\|[^\n]*Technology[^\n]*\|[^\n]*\|[^\n]*\|/i
    );
  });

  await check(
    'architecture.md marks at least one technology as ✅ Exists',
    () => {
      // python-expert is in the fixture so the Python row should
      // resolve. The prompt's example uses the exact emoji ✅; some
      // models also emit the ASCII "Exists" word — accept either as
      // the positive signal.
      expectFileExists(workdir, archPath, /✅\s*Exists|Exists\s*✅/);
    }
  );

  await check(
    'architecture.md marks at least one technology as ⚠️ Missing',
    () => {
      // react-expert is intentionally absent so the React/frontend
      // row should come out as missing. Accept both the prompt's
      // exact ⚠️ Missing form and a plain "Missing" cell with the
      // emoji nearby.
      expectFileExists(workdir, archPath, /⚠️?\s*Missing|Missing\s*⚠️?/);
    }
  );
};
