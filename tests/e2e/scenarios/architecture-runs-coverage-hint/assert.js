/**
 * Scenario assertion: /awos:architecture saves the architecture and
 * runs a verbal coverage hint, deferring the durable coverage report
 * to /awos:hire.
 *
 * The contract (from commands/architecture.md, Steps 3 and 4):
 *   - Read product-definition.md and roadmap.md as inputs.
 *   - Take a light look at .claude/agents/ to see what specialists
 *     are registered.
 *   - Write context/product/architecture.md.
 *   - Recommend /awos:hire next — that command owns the durable
 *     coverage report at context/product/agents.md, not this one.
 *
 * The architecture file itself MUST NOT contain a coverage table:
 * the durable report belongs to /awos:hire. Asserting absence keeps
 * the boundary intact across prompt edits.
 *
 * Each `check` is one independently-narratable assertion.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

  await check('Claude looked at .claude/agents/ for the coverage hint', () => {
    const hits = discoveryHits(toolCalls);
    if (hits.length === 0) {
      throw new Error(
        'no Glob/Read/LS/Grep against .claude/agents/, and no Agent ' +
          'delegation mentioning it — coverage hint would be guesswork'
      );
    }
  });

  await check(`architecture.md was written at ${archPath}`, () => {
    expectFileExists(workdir, archPath);
  });

  await check(
    'architecture.md does not contain a coverage table (that belongs to /awos:hire)',
    () => {
      // The new contract: architecture.md is the technology decisions
      // only. The durable Technology × Specialist × Status coverage
      // report is owned by /awos:hire and written to
      // context/product/agents.md. Asserting absence here keeps the
      // boundary honest across prompt edits.
      const text = fs.readFileSync(path.join(workdir, archPath), 'utf8');
      // A markdown table whose header row mentions both "Technology"
      // and "Status" is the coverage-table shape. If we find that in
      // architecture.md, the boundary has been crossed.
      const coverageHeader =
        /\|[^\n]*Technology[^\n]*\|[^\n]*\|[^\n]*Status[^\n]*\|/i;
      if (coverageHeader.test(text)) {
        throw new Error(
          'architecture.md contains a Technology/Status table — that ' +
            'report now lives in context/product/agents.md, owned by ' +
            '/awos:hire (commands/architecture.md Step 4 explicitly ' +
            'defers it)'
        );
      }
    }
  );
};
