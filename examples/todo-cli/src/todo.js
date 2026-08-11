// Pure domain logic for the todo list. No I/O lives here — every function
// takes the current task array and returns a result, so it is trivially
// unit-testable. The CLI edge (bin/todo.js) handles persistence and printing.

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

// Next id is derived from the max existing id (not the array length) so that
// ids are never reused after a task is removed.
export function nextId(tasks) {
  return tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

export function addTask(tasks, text, now = new Date().toISOString()) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    throw new ValidationError('task text required');
  }
  const task = {
    id: nextId(tasks),
    text: trimmed,
    done: false,
    createdAt: now,
  };
  return { tasks: [...tasks, task], task };
}

function findIndexById(tasks, id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new NotFoundError(`no task #${id}`);
  }
  return index;
}

export function completeTask(tasks, id) {
  const index = findIndexById(tasks, id);
  const task = { ...tasks[index], done: true };
  const next = tasks.slice();
  next[index] = task;
  return { tasks: next, task };
}

export function removeTask(tasks, id) {
  const index = findIndexById(tasks, id);
  const task = tasks[index];
  const next = tasks.slice();
  next.splice(index, 1);
  return { tasks: next, task };
}

export function formatTask(task) {
  return `#${task.id} [${task.done ? 'x' : ' '}] ${task.text}`;
}

export function formatList(tasks) {
  if (tasks.length === 0) {
    return 'No tasks yet.';
  }
  return tasks.map(formatTask).join('\n');
}
