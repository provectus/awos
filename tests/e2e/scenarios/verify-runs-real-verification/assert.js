/**
 * Scenario assertion: /awos:verify enforces F5 — real verification,
 * not textual reasoning.
 *
 * The contract (commands/verify.md, Step 3 + CLAUDE.md F5):
 *   - Load the acceptance criteria from functional-spec.md.
 *   - Run a real check appropriate to each criterion (Bash command,
 *     curl, query, Playwright MCP, or Read on the artifact when the
 *     criterion is "file/function exists and looks like X").
 *   - Only mark Status: Completed when criteria observably pass.
 *
 * Tolerance note: verify.md allows many verification mechanisms. We
 * UNION over the strongest signals — Bash with a real command, a Read
 * on the implementation artifact, or any Playwright MCP call — and
 * fail only when none fired. That mirrors the prompt's "pick the
 * check that fits the criterion type" wording without locking the
 * test to one specific mechanism.
 *
 * Each `check` is one independently-narratable assertion.
 */

'use strict';

const { expectFileExists } = require('../../expect');

const FSPEC_PATH_RE = /context\/spec\/001-test-feature\/functional-spec\.md$/;
const HEALTH_ARTIFACT_RE = /(^|\/)src\/health\.py$/;

// Real verification commands the prompt explicitly suggests (Step 3,
// "Correctness verifiable by tests/lint/typecheck", plus the curl /
// API path). We match the executable token at the start of the
// command so noise like `echo "pytest"` doesn't count.
const REAL_BASH_RE =
  /(^|[;&|\s])(pytest|python3?|node|npm|bun|curl|psql|redis-cli|sqlite3)\b/;

function isRealBashRun(call) {
  if (call.name !== 'Bash') return false;
  const cmd = String(call.input?.command || '');
  return REAL_BASH_RE.test(cmd);
}

function isArtifactRead(call) {
  return (
    call.name === 'Read' &&
    HEALTH_ARTIFACT_RE.test(String(call.input?.file_path || ''))
  );
}

function isPlaywrightCall(call) {
  return /^mcp__playwright__/.test(call.name);
}

module.exports = async function run({ check, toolCalls, workdir }) {
  const fspecPath = 'context/spec/001-test-feature/functional-spec.md';

  await check(
    'Claude read functional-spec.md to load acceptance criteria',
    () => {
      const hit = toolCalls.find(
        (c) =>
          c.name === 'Read' &&
          FSPEC_PATH_RE.test(String(c.input?.file_path || ''))
      );
      if (!hit) {
        throw new Error(
          'no Read on context/spec/001-test-feature/functional-spec.md — ' +
            'verify must load the acceptance criteria from the spec'
        );
      }
    }
  );

  await check(
    'Claude exercised at least one concrete verification mechanism',
    () => {
      // Tolerant union over the verification mechanisms verify.md
      // suggests. The point is to confirm Claude touched the real
      // artifact instead of just reasoning about the spec.
      const mechanisms = toolCalls.filter(
        (c) => isRealBashRun(c) || isArtifactRead(c) || isPlaywrightCall(c)
      );
      if (mechanisms.length === 0) {
        const tail = toolCalls
          .slice(-15)
          .map((c) => c.name)
          .join(' → ');
        throw new Error(
          'no Bash run of pytest/python/node/curl/etc., no Read on ' +
            'src/health.py, and no Playwright MCP call — verify did ' +
            'not exercise any real check against the implementation.\n' +
            `  Trace tail: ${tail}`
        );
      }
    }
  );

  await check('Claude updated Status to Completed in the spec', () => {
    // commands/verify.md Step 4 explicitly writes "Status to
    // `Completed`" on functional-spec.md and technical-
    // considerations.md. We assert the literal line on the
    // functional spec since that's the one the prompt promises.
    expectFileExists(workdir, fspecPath, /Status:\s*Completed/);
  });
};
