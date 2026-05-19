/**
 * Scenario assertion: /awos:tasks must enumerate .claude/agents/, not guess.
 *
 * Each `check` is one independently-narratable assertion. The verify
 * harness streams a pass/fail line per check, so the human running this
 * sees exactly what was verified — not just "tests passed".
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { expectToolCall, expectFileExists } = require('../../expect');

const AGENTS_PATH_RE = /\.claude\/agents/;

/**
 * Return the tool calls that prove Claude looked at `.claude/agents/`,
 * either directly (Glob/Read/LS/Grep on the path) or indirectly (an
 * Agent/Explore delegation whose prompt mentions the path).
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

function readAgentCallFor(toolCalls, name) {
  return toolCalls.find(
    (c) =>
      (c.name === 'Read' &&
        new RegExp(`\\.claude/agents/${name}\\.md$`).test(
          String(c.input?.file_path || '')
        )) ||
      ((c.name === 'Agent' || c.name === 'Task') &&
        new RegExp(`${name}`).test(String(c.input?.prompt || '')) &&
        AGENTS_PATH_RE.test(String(c.input?.prompt || '')))
  );
}

module.exports = async function run({ check, toolCalls, workdir }) {
  const tasksPath = 'context/spec/001-test-feature/tasks.md';
  const absTasksPath = path.join(workdir, tasksPath);

  await check('Claude scanned .claude/agents/ for specialist subagents', () => {
    const hits = discoveryHits(toolCalls);
    if (hits.length === 0) {
      throw new Error(
        'no Glob/Read/LS/Grep against .claude/agents/, and no Agent ' +
          'delegation mentioning it — Claude likely guessed the agent list'
      );
    }
  });

  await check(
    'python-expert was read from .claude/agents/ (directly or via Explore)',
    () => {
      if (!readAgentCallFor(toolCalls, 'python-expert')) {
        throw new Error(
          'no Read on .claude/agents/python-expert.md and no Agent ' +
            'delegation referencing it'
        );
      }
    }
  );

  await check(
    'react-expert was read from .claude/agents/ (directly or via Explore)',
    () => {
      if (!readAgentCallFor(toolCalls, 'react-expert')) {
        throw new Error(
          'no Read on .claude/agents/react-expert.md and no Agent ' +
            'delegation referencing it'
        );
      }
    }
  );

  await check(`tasks.md was written at ${tasksPath}`, () => {
    expectFileExists(workdir, tasksPath);
  });

  await check('tasks.md contains **[Agent: python-expert]** marker', () => {
    expectFileExists(workdir, tasksPath, /\*\*\[Agent: python-expert\]\*\*/);
  });

  await check('tasks.md contains **[Agent: react-expert]** marker', () => {
    expectFileExists(workdir, tasksPath, /\*\*\[Agent: react-expert\]\*\*/);
  });

  await check(
    'every **[Agent: ...]** marker in tasks.md resolves to a real agent (no hallucinations)',
    () => {
      const tasksText = fs.readFileSync(absTasksPath, 'utf8');
      const markerNames = new Set();
      for (const m of tasksText.matchAll(
        /\*\*\[Agent: ([a-zA-Z0-9_.-]+)\]\*\*/g
      )) {
        markerNames.add(m[1]);
      }
      const ALLOWED_BUILTINS = new Set(['general-purpose']);
      const unresolved = [];
      for (const name of markerNames) {
        if (ALLOWED_BUILTINS.has(name)) continue;
        const agentFile = path.join(workdir, '.claude', 'agents', `${name}.md`);
        if (!fs.existsSync(agentFile)) unresolved.push(name);
      }
      if (unresolved.length) {
        throw new Error(
          `tasks.md references ${unresolved
            .map((n) => `**[Agent: ${n}]**`)
            .join(', ')} but no matching .claude/agents/<name>.md exists`
        );
      }
    }
  );
};
