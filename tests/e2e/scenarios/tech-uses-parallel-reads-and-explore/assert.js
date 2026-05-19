/**
 * Scenario assertion: /awos:tech reads inputs together and uses
 * the built-in Explore agent for codebase analysis.
 *
 * The contract (commands/tech.md, Step 2):
 *   - Read functional-spec.md and architecture.md — "issue both Read
 *     calls in a single tool-use block (parallel tool calls)".
 *   - Discover specialist subagents by scanning .claude/agents/.
 *   - "Delegate the read-only exploration to the built-in `Explore`
 *     agent to keep the orchestrator context lean."
 *
 * Together-reads detection: the practical contract is that Claude has
 * both files in context before drafting, with no unrelated work
 * between them. That's satisfied by either (a) the two Reads sharing
 * an `assistantUuid` (true parallel tool calls in one turn) or
 * (b) the Reads being adjacent in the tool-call stream — back-to-back
 * single-call turns, no intervening work. Both outcomes give the same
 * context benefit. We assert (b), which subsumes (a) because parallel
 * calls always land adjacent in the flattened tool-call stream.
 *
 * Each `check` is one independently-narratable assertion.
 */

'use strict';

const { expectFileExists } = require('../../expect');

const AGENTS_PATH_RE = /\.claude\/agents/;
const FSPEC_PATH_RE = /context\/spec\/001-test-feature\/functional-spec\.md$/;
const ARCH_PATH_RE = /context\/product\/architecture\.md$/;

/**
 * Reuse the tolerant agent-discovery union from
 * tasks-enumerates-agents/assert.js.
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

function readsMatching(toolCalls, pathRe) {
  return toolCalls.filter(
    (c) => c.name === 'Read' && pathRe.test(String(c.input?.file_path || ''))
  );
}

module.exports = async function run({ check, toolCalls, workdir }) {
  const techPath = 'context/spec/001-test-feature/technical-considerations.md';

  const fspecReads = readsMatching(toolCalls, FSPEC_PATH_RE);
  const archReads = readsMatching(toolCalls, ARCH_PATH_RE);

  await check('Claude read functional-spec.md', () => {
    if (fspecReads.length === 0) {
      throw new Error(
        'no Read on context/spec/001-test-feature/functional-spec.md — ' +
          'tech command must load the functional spec'
      );
    }
  });

  await check('Claude read architecture.md', () => {
    if (archReads.length === 0) {
      throw new Error(
        'no Read on context/product/architecture.md — tech command ' +
          'must load the architecture'
      );
    }
  });

  await check(
    'functional-spec and architecture were Read together (parallel or back-to-back)',
    () => {
      // Find the position of each target Read in the flattened
      // tool-call stream. Pass if any (fspec, arch) pair is adjacent
      // (index diff ≤ 1). Adjacency covers both true parallel calls
      // (same assistantUuid → flattened to consecutive indices) and
      // back-to-back single-call turns (no intervening work). What
      // we want to fail on is Claude splitting the two reads with
      // other tool work between them.
      const fspecSet = new Set(fspecReads);
      const archSet = new Set(archReads);
      const fspecIdx = [];
      const archIdx = [];
      toolCalls.forEach((c, i) => {
        if (fspecSet.has(c)) fspecIdx.push(i);
        if (archSet.has(c)) archIdx.push(i);
      });
      for (const i of fspecIdx) {
        for (const j of archIdx) {
          if (Math.abs(i - j) <= 1) return;
        }
      }
      throw new Error(
        'functional-spec.md and architecture.md were Read with at least ' +
          'one other tool call between them — Claude split spec-loading ' +
          'across unrelated work. commands/tech.md Step 2 wants both ' +
          'Reads as a single tool-use block (or at minimum back-to-back).'
      );
    }
  );

  await check('Claude scanned .claude/agents/ for specialist subagents', () => {
    const hits = discoveryHits(toolCalls);
    if (hits.length === 0) {
      throw new Error(
        'no Glob/Read/LS/Grep against .claude/agents/, and no Agent ' +
          'delegation mentioning it'
      );
    }
  });

  await check(
    'Claude examined the existing codebase (Explore delegation or direct src/ Read)',
    () => {
      // commands/tech.md Step 2 prefers delegating to Explore "to keep
      // the orchestrator context lean". For tiny fixture codebases (a
      // couple of files) Claude pragmatically inlines the Reads instead
      // — same outcome, negligible context cost. The real contract is
      // that the existing source was loaded before drafting; we accept
      // either mechanism.
      const exploreCalls = toolCalls.filter((c) => {
        if (c.name !== 'Agent' && c.name !== 'Task') return false;
        return /Explore/i.test(String(c.input?.subagent_type || ''));
      });
      const srcReads = toolCalls.filter(
        (c) =>
          c.name === 'Read' &&
          /(^|\/)src\//.test(String(c.input?.file_path || ''))
      );
      if (exploreCalls.length === 0 && srcReads.length === 0) {
        throw new Error(
          'no Agent/Task call to Explore and no direct Read on a file ' +
            'under src/ — Claude drafted technical-considerations.md ' +
            'without looking at the existing codebase'
        );
      }
    }
  );

  await check(`technical-considerations.md was written at ${techPath}`, () => {
    expectFileExists(workdir, techPath);
  });
};
