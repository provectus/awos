// Persistence edge: the only place that touches the filesystem. Resolves the
// task file from the TODO_FILE env var, falling back to .todo.json in the
// current working directory.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveFile(env = process.env) {
  return resolve(env.TODO_FILE ?? '.todo.json');
}

// Returns the stored task array, or an empty array when the file does not yet
// exist (first run needs no setup). A corrupt file surfaces a clear error
// rather than a raw JSON stack trace.
export function load(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    throw new Error(`could not read task file: ${file}`);
  }
}

export function save(file, tasks) {
  writeFileSync(file, `${JSON.stringify(tasks, null, 2)}\n`, 'utf8');
}
