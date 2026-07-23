/**
 * Interactive overwrite prompt utility.
 *
 * Builds the async function the file-copier calls before clobbering files
 * an operation marked `preserveOnUpdate`. Stdlib-only (readline) — no
 * external dependencies.
 *
 * Signature of the returned callback:
 *   async ({ operation, files }) => boolean
 *     operation: the copyOperations entry that hit conflicts
 *     files:     array of absolute destination paths that would be overwritten
 *     returns:   true to overwrite, false to preserve user's files
 */

'use strict';

const readline = require('node:readline');
const path = require('node:path');
const { style } = require('../config/constants');

/**
 * Construct the overwrite-prompt callback based on environment/flags.
 *
 * @param {Object} options
 * @param {boolean} [options.forceOverwrite] - Treat every conflict as
 *   "overwrite" without prompting. Set by `--overwrite` for CI or
 *   scripted reinstalls.
 * @param {boolean} [options.forcePreserve]  - Treat every conflict as
 *   "preserve" without prompting. Set by `--no-overwrite`. Same as the
 *   safe non-TTY default, but explicit.
 * @param {boolean} [options.isTTY]    - Whether stdin is attached to a
 *   terminal. When false (CI, piped runs, tests) and neither force flag
 *   is set, we default to preserving — losing data silently is worse
 *   than asking the user to rerun with `--overwrite`.
 * @param {NodeJS.ReadableStream} [options.input]  - For tests. Defaults to process.stdin.
 * @param {NodeJS.WritableStream} [options.output] - For tests. Defaults to process.stdout.
 * @returns {(info: {operation: Object, files: string[]}) => Promise<boolean>}
 */
function createDefaultOverwritePrompt({
  forceOverwrite = false,
  forcePreserve = false,
  isTTY = false,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (forceOverwrite) return async () => true;
  if (forcePreserve) return async () => false;
  if (!isTTY) return async () => false;

  return async ({ operation, files }) => {
    output.write('\n');
    output.write(
      style.warn(
        '  ! ' +
          style.bold(operation.destination) +
          ' already contains files that would be overwritten.\n'
      )
    );
    output.write('\n');
    output.write(
      '  Starting with this version, AWOS preserves the wrappers under\n'
    );
    output.write(
      '  ' +
        style.bold(operation.destination) +
        ' as your customization layer. They are the place to\n'
    );
    output.write(
      '  customize Claude Code commands, and the installer no longer\n'
    );
    output.write(
      '  clobbers them on update (the framework now targets Claude Code\n'
    );
    output.write(
      '  exclusively, so the wrappers can be hand-edited safely).\n'
    );
    output.write('\n');
    output.write('  The following file(s) would be overwritten:\n');
    for (const f of files) {
      output.write('    ' + style.dim('•') + ' ' + path.basename(f) + '\n');
    }
    if (operation.manualUpdateUrl) {
      output.write('\n');
      output.write(
        '  If you skip, you can review the latest canonical wrappers at:\n'
      );
      output.write('    ' + style.info(operation.manualUpdateUrl) + '\n');
    }
    output.write('\n');

    const rl = readline.createInterface({ input, output, terminal: false });
    try {
      const answer = await new Promise((resolve) => {
        rl.question(
          '  Overwrite these files now? [y/N]: ',
          (a) => resolve(a)
          // Some readline versions ignore the third arg; harmless either way.
        );
      });
      return /^(y|yes)$/i.test((answer || '').trim());
    } finally {
      rl.close();
    }
  };
}

/**
 * Construct the callback that resolves whether to arm the awos-containment
 * guard. Mirrors createDefaultOverwritePrompt's flag/TTY shape, but the safe
 * default is the OPPOSITE direction: this is a security lever, so
 * secure-by-default means default-ENABLE. In particular the non-TTY default is
 * ENABLE — the overwrite prompt's non-TTY default is PRESERVE, because there the
 * risk is silent data loss, whereas here the risk is a silently-DISABLED
 * containment guard. Pick per mutation; do not copy the direction.
 *
 *   --containment    → always enable (no prompt)
 *   --no-containment → always decline (no prompt)
 *   TTY, no flag     → ask [Y/n], default-YES (empty Enter → enable)
 *   non-TTY, no flag → enable (secure-by-default)
 *
 * @param {Object} options
 * @param {boolean} [options.forceEnable]  - Set by `--containment`.
 * @param {boolean} [options.forceDisable] - Set by `--no-containment`.
 * @param {boolean} [options.isTTY]        - Whether stdin is a terminal.
 * @param {NodeJS.ReadableStream} [options.input]  - For tests. Defaults to process.stdin.
 * @param {NodeJS.WritableStream} [options.output] - For tests. Defaults to process.stdout.
 * @returns {() => Promise<boolean>} resolves true to enable, false to decline.
 */
function createContainmentConsentPrompt({
  forceEnable = false,
  forceDisable = false,
  isTTY = false,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (forceEnable) return async () => true;
  if (forceDisable) return async () => false;
  // Secure-by-default: a non-interactive run ENABLES the guard. This is the
  // deliberate OPPOSITE of the overwrite prompt's non-TTY default (preserve).
  if (!isTTY) return async () => true;

  return async () => {
    output.write('\n');
    const rl = readline.createInterface({ input, output, terminal: false });
    try {
      const answer = await new Promise((resolve) => {
        rl.question(
          '  Enable the awos-containment guard? It blocks out-of-tree writes, ' +
            'network egress and secret reads in Claude Code sessions. [Y/n]: ',
          (a) => resolve(a)
        );
      });
      // Default-YES: only an explicit n/no declines; empty Enter enables.
      return !/^(n|no)$/i.test((answer || '').trim());
    } finally {
      rl.close();
    }
  };
}

module.exports = {
  createDefaultOverwritePrompt,
  createContainmentConsentPrompt,
};
