// Feature Testing & Regression for spec 001-manage-todos.
// @spec: 001-manage-todos
// @regression
//
// Two layers:
//   - unit tests over the pure domain in src/todo.js
//   - acceptance tests that drive bin/todo.js as a child process against a
//     temp TODO_FILE, one per acceptance criterion in functional-spec.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addTask,
  completeTask,
  removeTask,
  nextId,
  formatList,
  ValidationError,
  NotFoundError,
} from '../src/todo.js';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'todo.js');

// Run the CLI against an isolated temp file. Returns { stdout, status }.
function runCli(args, todoFile) {
  try {
    const stdout = execFileSync('node', [BIN, ...args], {
      env: { ...process.env, TODO_FILE: todoFile },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'], // capture stderr instead of inheriting it
    });
    return { stdout, status: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      status: err.status,
    };
  }
}

function withTempFile(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'todo-cli-'));
  const file = join(dir, 'tasks.json');
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- Unit: pure domain ----------

test('addTask assigns sequential ids and trims text', () => {
  let tasks = [];
  ({ tasks } = addTask(tasks, '  buy milk  ', '2020-01-01T00:00:00.000Z'));
  ({ tasks } = addTask(tasks, 'walk dog', '2020-01-01T00:00:00.000Z'));
  assert.equal(tasks[0].id, 1);
  assert.equal(tasks[0].text, 'buy milk');
  assert.equal(tasks[1].id, 2);
  assert.equal(tasks[0].done, false);
});

test('addTask rejects empty text', () => {
  assert.throws(() => addTask([], '   '), ValidationError);
});

test('completeTask sets done and throws on missing id', () => {
  let { tasks } = addTask([], 'buy milk');
  ({ tasks } = completeTask(tasks, 1));
  assert.equal(tasks[0].done, true);
  assert.throws(() => completeTask(tasks, 999), NotFoundError);
});

test('removeTask deletes; next id stays unique after a middle removal', () => {
  let { tasks } = addTask([], 'a');
  ({ tasks } = addTask(tasks, 'b'));
  ({ tasks } = addTask(tasks, 'c')); // ids 1, 2, 3
  ({ tasks } = removeTask(tasks, 2)); // leaves 1, 3
  assert.equal(tasks.length, 2);
  // max+1 = 4 avoids colliding with the still-present #3 (length-based would give 3)
  assert.equal(nextId(tasks), 4);
  assert.throws(() => removeTask(tasks, 999), NotFoundError);
});

test('formatList renders markers and empty state', () => {
  assert.equal(formatList([]), 'No tasks yet.');
  const { tasks } = addTask([], 'buy milk');
  assert.equal(formatList(tasks), '#1 [ ] buy milk');
});

// ---------- Acceptance: CLI end-to-end ----------

test('add records a task and confirms with id and text', () => {
  withTempFile((file) => {
    const r = runCli(['add', 'buy milk'], file);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Added #1: buy milk/);
  });
});

test('add with no text fails with a non-zero exit', () => {
  withTempFile((file) => {
    const r = runCli(['add'], file);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /task text required/);
  });
});

test('list shows tasks with id, marker, and text; empty state when none', () => {
  withTempFile((file) => {
    assert.match(runCli(['list'], file).stdout, /No tasks yet\./);
    runCli(['add', 'buy milk'], file);
    const r = runCli(['list'], file);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /#1 \[ \] buy milk/);
  });
});

test('done marks a task complete and list reflects it', () => {
  withTempFile((file) => {
    runCli(['add', 'buy milk'], file);
    const r = runCli(['done', '1'], file);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Completed #1: buy milk/);
    assert.match(runCli(['list'], file).stdout, /#1 \[x\] buy milk/);
  });
});

test('done with a bad id fails and changes nothing', () => {
  withTempFile((file) => {
    runCli(['add', 'buy milk'], file);
    const r = runCli(['done', '999'], file);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no task #999/);
    assert.match(runCli(['list'], file).stdout, /#1 \[ \] buy milk/);
  });
});

test('remove deletes a task; next id stays unique after a middle removal', () => {
  withTempFile((file) => {
    runCli(['add', 'a'], file);
    runCli(['add', 'b'], file);
    runCli(['add', 'c'], file); // #1 #2 #3
    const r = runCli(['remove', '2'], file);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Removed #2: b/);
    // a new task takes #4 (max+1), not #3 which is still present
    runCli(['add', 'd'], file);
    const list = runCli(['list'], file).stdout;
    assert.match(list, /#4 \[ \] d/);
    assert.doesNotMatch(list, /#3 \[ \] d/);
  });
});

test('remove with a bad id fails with a non-zero exit', () => {
  withTempFile((file) => {
    const r = runCli(['remove', '999'], file);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no task #999/);
  });
});

test('persistence: tasks added in one command survive into the next', () => {
  withTempFile((file) => {
    runCli(['add', 'buy milk'], file);
    runCli(['add', 'walk dog'], file);
    const r = runCli(['list'], file);
    assert.match(r.stdout, /#1 \[ \] buy milk/);
    assert.match(r.stdout, /#2 \[ \] walk dog/);
  });
});

test('first run needs no file to exist', () => {
  withTempFile((file) => {
    assert.equal(existsSync(file), false);
    const r = runCli(['list'], file);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No tasks yet\./);
  });
});

test('no args or unknown command prints usage and exits non-zero', () => {
  withTempFile((file) => {
    const none = runCli([], file);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /Usage:/);
    const bogus = runCli(['bogus'], file);
    assert.equal(bogus.status, 1);
    assert.match(bogus.stderr, /Usage:/);
  });
});
