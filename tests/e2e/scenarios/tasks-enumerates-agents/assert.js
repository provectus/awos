/**
 * Scenario assertion: /awos:tasks must enumerate .claude/agents/, not guess.
 *
 * Tolerant union — Claude can prove discovery happened in several
 * shapes, any of which is valid:
 *
 *   a) Glob with a pattern that targets `.claude/agents/`
 *   b) Read against an actual `.claude/agents/<name>.md` file
 *   c) Agent delegation (e.g. Explore) whose prompt mentions `.claude/agents`
 *
 * Plus the tasks.md output must wire both seeded agents into the
 * `**[Agent: <name>]**` markers.
 */

'use strict';

const { expectFileExists } = require('../../expect');

const AGENTS_PATH_RE = /\.claude\/agents/;

function provesAgentDiscovery(call) {
  const input = call.input || {};
  if (call.name === 'Glob') {
    const pattern = String(input.pattern || '');
    if (AGENTS_PATH_RE.test(pattern)) return true;
  }
  if (call.name === 'Read') {
    const filePath = String(input.file_path || '');
    if (AGENTS_PATH_RE.test(filePath)) return true;
  }
  if (call.name === 'LS') {
    const target = String(input.path || '');
    if (AGENTS_PATH_RE.test(target)) return true;
  }
  if (call.name === 'Grep') {
    const where = String(input.path || input.glob || '');
    if (AGENTS_PATH_RE.test(where)) return true;
  }
  // Agent delegation — prompt and/or description must mention the path.
  if (call.name === 'Agent' || call.name === 'Task') {
    const prompt = String(input.prompt || '');
    const description = String(input.description || '');
    if (
      AGENTS_PATH_RE.test(prompt) ||
      AGENTS_PATH_RE.test(description) ||
      /Explore/i.test(String(input.subagent_type || ''))
    ) {
      return true;
    }
  }
  return false;
}

module.exports = async function run({ toolCalls, workdir }) {
  // 1) Discovery contract — at least one tool call proves Claude looked
  //    at `.claude/agents/` (or delegated to a subagent that did).
  const discoveryHits = toolCalls.filter(provesAgentDiscovery);
  if (discoveryHits.length === 0) {
    const trace = toolCalls
      .slice(-15)
      .map((c) => c.name)
      .join(' → ');
    throw new Error(
      'discovery contract: no tool call provides evidence that ' +
        '`.claude/agents/` was scanned (looked for Glob/Read/LS/Grep ' +
        'against the path, or an Agent/Explore delegation mentioning it).\n' +
        `  Recent tool calls: ${trace}`
    );
  }

  // 2) Output contract — tasks.md exists with both seeded agents named.
  const tasksPath = 'context/spec/001-test-feature/tasks.md';
  expectFileExists(workdir, tasksPath, /\*\*\[Agent: python-expert\]\*\*/);
  expectFileExists(workdir, tasksPath, /\*\*\[Agent: react-expert\]\*\*/);

  // 3) Sanity — every `**[Agent: <name>]**` marker resolves to an
  //    agent file that exists in the fixture. Catches typos and
  //    hallucinated specialists.
  const fs = require('node:fs');
  const path = require('node:path');
  const tasksText = fs.readFileSync(path.join(workdir, tasksPath), 'utf8');
  const markerNames = new Set();
  for (const m of tasksText.matchAll(/\*\*\[Agent: ([a-zA-Z0-9_.-]+)\]\*\*/g)) {
    markerNames.add(m[1]);
  }
  // The orchestrator allows `general-purpose` as a fallback; everything
  // else must map to a real .claude/agents/<name>.md.
  const ALLOWED_BUILTINS = new Set(['general-purpose']);
  for (const name of markerNames) {
    if (ALLOWED_BUILTINS.has(name)) continue;
    const agentFile = path.join(workdir, '.claude', 'agents', `${name}.md`);
    if (!fs.existsSync(agentFile)) {
      throw new Error(
        `agent marker resolution: tasks.md references ` +
          `**[Agent: ${name}]** but no .claude/agents/${name}.md exists ` +
          `in the workdir. Claude may have invented this specialist.`
      );
    }
  }
};
