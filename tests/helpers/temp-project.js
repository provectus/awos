/**
 * Temp-project helpers for installer/fixture tests.
 *
 * Uses fs.mkdtemp under os.tmpdir() so each test gets an isolated working
 * directory. Bun and Node both implement these built-ins.
 */

'use strict';

const fs = require('node:fs');
const fsPromises = fs.promises;
const os = require('node:os');
const path = require('node:path');

/**
 * Create a fresh, empty temporary directory.
 * @returns {Promise<string>} Absolute path to the temp directory.
 */
async function makeTempDir() {
  const prefix = path.join(os.tmpdir(), 'awos-test-');
  return await fsPromises.mkdtemp(prefix);
}

/**
 * Recursively remove a directory. Always recursive + force.
 * @param {string} dir
 */
async function removeTempDir(dir) {
  if (!dir) return;
  try {
    await fsPromises.rm(dir, { recursive: true, force: true });
  } catch {
    // Cleanup is best-effort.
  }
}

/**
 * Copy a directory tree from `src` to `dst`. Both Node 22 and Bun support
 * fs.cp; using promises form for consistency.
 * @param {string} src - Source directory
 * @param {string} dst - Destination directory (created if missing)
 */
async function copyTree(src, dst) {
  await fsPromises.mkdir(dst, { recursive: true });
  await fsPromises.cp(src, dst, { recursive: true });
}

/**
 * Convenience wrapper around fs.existsSync (kept synchronous so callers
 * can use it inline in assertions without await ceremony).
 * @param {string} p
 * @returns {boolean}
 */
function exists(p) {
  return fs.existsSync(p);
}

/**
 * Suppress stdout/stderr while running an async function. The installer
 * services log progress to console.log; tests don't want that noise.
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
async function silenced(fn) {
  const origLog = console.log;
  const origErr = console.error;
  const origInfo = console.info;
  const origGroup = console.group;
  const origGroupEnd = console.groupEnd;
  const noop = () => {};
  console.log = noop;
  console.error = noop;
  console.info = noop;
  console.group = noop;
  console.groupEnd = noop;
  // process.stdout.write is used by clearLine; muzzle it too.
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
    console.info = origInfo;
    console.group = origGroup;
    console.groupEnd = origGroupEnd;
    process.stdout.write = origWrite;
  }
}

module.exports = {
  makeTempDir,
  removeTempDir,
  copyTree,
  exists,
  silenced,
};
