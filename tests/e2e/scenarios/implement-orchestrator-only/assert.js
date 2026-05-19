/**
 * Scenario assertion: /awos:implement is an orchestrator only.
 *
 * The contract (from commands/implement.md and CLAUDE.md):
 *   - The orchestrator reads tasks.md, finds the **[Agent: name]** marker,
 *     and delegates the coding to that subagent via the Agent tool.
 *   - The orchestrator itself MUST NOT call Edit/Write/MultiEdit on
 *     source code. It may flip checkboxes in tasks.md — that's
 *     bookkeeping, not coding — so we allow Edit/Write targeting
 *     tasks.md specifically.
 *   - The delegation prompt must carry the F5 guards
 *     (<verification_commands>, <scope_discipline>,
 *     <investigate_before_answering>) the prompt promises.
 *
 * Each `check` is one independently-narratable assertion so the verify
 * harness streams a pass/fail line per check.
 */

'use strict';

const { expectFileExists } = require('../../expect');

const SOURCE_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const TASKS_PATH_RE = /(^|\/)tasks\.md$/;

/**
 * Return Agent/Task delegations whose subagent_type is set. These are
 * the calls that prove the orchestrator dispatched the work instead of
 * doing it inline.
 */
function delegationCalls(toolCalls) {
  return toolCalls.filter((call) => {
    if (call.name !== 'Agent' && call.name !== 'Task') return false;
    const input = call.input || {};
    return typeof input.subagent_type === 'string' && input.subagent_type;
  });
}

/**
 * Return source-edit calls (Edit/Write/MultiEdit) whose target is NOT
 * the tasks.md bookkeeping file. Editing tasks.md is a deliberate
 * exception — the orchestrator marks the checkbox after the subagent
 * reports success (commands/implement.md, Step 5), and that does not
 * violate the "don't write code" contract.
 */
function offendingSourceEdits(toolCalls) {
  return toolCalls.filter((call) => {
    if (!SOURCE_EDIT_TOOLS.has(call.name)) return false;
    const input = call.input || {};
    const target = String(input.file_path || input.path || '');
    if (!target) return true;
    return !TASKS_PATH_RE.test(target);
  });
}

module.exports = async function run({ check, toolCalls, workdir }) {
  const tasksPath = 'context/spec/001-test-feature/tasks.md';

  const delegations = delegationCalls(toolCalls);

  await check('Claude called the Agent tool to delegate the task', () => {
    if (delegations.length === 0) {
      throw new Error(
        'no Agent/Task tool call with a subagent_type was issued — ' +
          'the orchestrator did not delegate the coding work'
      );
    }
  });

  await check(
    'Claude did NOT directly call Edit/Write/MultiEdit on source files',
    () => {
      // Note: Edit/Write on tasks.md itself is allowed — flipping a
      // checkbox is bookkeeping, not coding, per commands/implement.md
      // Step 5. We only fail on edits to anything else (e.g. src/*.py).
      const offenders = offendingSourceEdits(toolCalls);
      if (offenders.length > 0) {
        const summary = offenders
          .slice(0, 3)
          .map((c) => {
            const target = c.input?.file_path || c.input?.path || '(no path)';
            return `${c.name}(${target})`;
          })
          .join(', ');
        throw new Error(
          `orchestrator edited source files directly: ${summary} — ` +
            'commands/implement.md forbids this; it must delegate instead'
        );
      }
    }
  );

  await check('Claude passed verification commands to the subagent', () => {
    if (delegations.length === 0) {
      throw new Error('no delegation call to inspect');
    }
    // Accept either the literal <verification_commands> XML tag (the
    // pattern the prompt names explicitly) OR a direct mention of the
    // concrete pytest command from tasks.md. Either form proves the
    // verification policy was carried through.
    const carriesVerification = delegations.some((call) => {
      const prompt = String(call.input?.prompt || '');
      return (
        /<verification_commands>/i.test(prompt) ||
        /pytest\s+tests\/test_health\.py/.test(prompt)
      );
    });
    if (!carriesVerification) {
      throw new Error(
        'no delegation prompt mentioned <verification_commands> or ' +
          'the concrete pytest command from tasks.md — the F5 ' +
          'verification policy was dropped'
      );
    }
  });

  await check(
    'Claude included scope-discipline / investigate-before-answering guards',
    () => {
      if (delegations.length === 0) {
        throw new Error('no delegation call to inspect');
      }
      const carriesGuards = delegations.some((call) => {
        const prompt = String(call.input?.prompt || '');
        return (
          /<scope_discipline>/i.test(prompt) &&
          /<investigate_before_answering>/i.test(prompt)
        );
      });
      if (!carriesGuards) {
        throw new Error(
          'no delegation prompt carried both <scope_discipline> and ' +
            '<investigate_before_answering> — F5 guards were dropped'
        );
      }
    }
  );

  await check(
    `tasks.md exists at ${tasksPath} with the original **[Agent: python-expert]** marker preserved`,
    () => {
      // The orchestrator is allowed to flip `[ ]` → `[x]` checkboxes,
      // but the **[Agent: python-expert]** marker on the task line
      // must survive — it's how /awos:implement re-resumes on a
      // future run.
      expectFileExists(workdir, tasksPath, /\*\*\[Agent: python-expert\]\*\*/);
    }
  );
};
