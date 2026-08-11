#!/usr/bin/env node
// CLI edge: parse argv, dispatch on the verb, run the pure domain op, persist,
// and print. All I/O and process concerns live here; src/todo.js stays pure.
import { load, save, resolveFile } from '../src/store.js';
import {
  addTask,
  completeTask,
  removeTask,
  formatList,
  ValidationError,
  NotFoundError,
} from '../src/todo.js';

const USAGE = `todo — a tiny terminal todo list

Usage:
  todo add "<text>"   Add a task
  todo list           List all tasks
  todo done <id>      Mark a task complete
  todo remove <id>    Remove a task

The list is saved to $TODO_FILE (default: ./.todo.json).`;

function parseId(raw) {
  // Non-integer / missing ids fall through to the standard "no task #<id>" path.
  return Number.isInteger(Number(raw)) ? Number(raw) : NaN;
}

function main(argv) {
  const [verb, ...rest] = argv;
  const file = resolveFile();
  const tasks = load(file);

  switch (verb) {
    case 'add': {
      const { tasks: next, task } = addTask(tasks, rest.join(' '));
      save(file, next);
      console.log(`Added #${task.id}: ${task.text}`);
      return;
    }
    case 'list': {
      console.log(formatList(tasks));
      return;
    }
    case 'done': {
      const { tasks: next, task } = completeTask(tasks, parseId(rest[0]));
      save(file, next);
      console.log(`Completed #${task.id}: ${task.text}`);
      return;
    }
    case 'remove': {
      const { tasks: next, task } = removeTask(tasks, parseId(rest[0]));
      save(file, next);
      console.log(`Removed #${task.id}: ${task.text}`);
      return;
    }
    default:
      // No verb or an unknown verb: usage to stderr, non-zero exit.
      throw new UsageError();
  }
}

class UsageError extends Error {}

try {
  main(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    console.error(USAGE);
  } else if (err instanceof ValidationError || err instanceof NotFoundError) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exitCode = 1;
}
