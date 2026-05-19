/**
 * Scenario assertion: /awos:tech reads inputs in parallel and uses
 * the built-in Explore agent for codebase analysis.
 *
 * The contract (commands/tech.md, Step 2):
 *   - Read functional-spec.md and architecture.md, "issue both reads
 *     in parallel".
 *   - Discover specialist subagents by scanning .claude/agents/.
 *   - "Delegate the read-only exploration to the built-in `Explore`
 *     agent to keep the orchestrator context lean."
 *
 * Parallel-tool-call detection: the session log gives every tool call
 * an `assistantUuid` (the id of the assistant turn that issued it).
 * Calls that share an assistantUuid were emitted in a single turn —
 * which is the in-API definition of "parallel tool calls". We group
 * reads by assistantUuid and assert that one batch contains both
 * target paths.
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
    'Reads of functional-spec and architecture were issued in parallel',
    () => {
      // Group reads by the assistantUuid that emitted them. A call
      // batch sharing one uuid was emitted in one assistant turn —
      // that's the parallel-tool-call pattern the prompt asks for.
      // Tolerance note: if either read lacks an assistantUuid (older
      // session-log shape), we can't prove parallelism — the check
      // fails closed with a clear message so the human knows why.
      const fspecUuids = new Set(
        fspecReads.map((c) => c.assistantUuid).filter(Boolean)
      );
      const archUuids = new Set(
        archReads.map((c) => c.assistantUuid).filter(Boolean)
      );
      const intersection = [...fspecUuids].filter((u) => archUuids.has(u));
      if (intersection.length === 0) {
        throw new Error(
          'functional-spec.md and architecture.md were not Read in the ' +
            'same assistant turn — commands/tech.md Step 2 requires ' +
            '"issue both reads in parallel"'
        );
      }
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

  await check('Claude delegated to the Explore agent', () => {
    // commands/tech.md Step 2: "delegate the read-only exploration
    // to the built-in `Explore` agent to keep the orchestrator
    // context lean." We accept any Agent/Task call whose
    // subagent_type matches Explore (case-insensitive).
    const exploreCalls = toolCalls.filter((c) => {
      if (c.name !== 'Agent' && c.name !== 'Task') return false;
      return /Explore/i.test(String(c.input?.subagent_type || ''));
    });
    if (exploreCalls.length === 0) {
      throw new Error(
        'no Agent/Task call with subagent_type matching /Explore/i — ' +
          'tech.md Step 2 requires delegating codebase analysis to Explore'
      );
    }
  });

  await check(`technical-considerations.md was written at ${techPath}`, () => {
    expectFileExists(workdir, techPath);
  });
};
