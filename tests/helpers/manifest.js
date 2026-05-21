/**
 * Fixture manifest loader and asserter.
 *
 * A manifest is a JSON object mapping relative-from-temp-dir paths to a set
 * of expected properties:
 *
 *   {
 *     ".awos/commands/architecture.md": { "exists": true },
 *     ".claude/commands/awos/spec.md":  { "contains": "spec.md" },
 *     "context/spec/001-test/tasks.md": { "unchanged": true },
 *     ".awos/.migration-version":       { "exists": true, "contains": "2" }
 *   }
 *
 * Recognised keys per entry:
 *   - exists      (boolean) — file must exist (true) or must not exist (false)
 *   - contains    (string)  — file body must include this substring
 *   - notContains (string)  — file body must NOT include this substring
 *   - unchanged   (boolean) — file body must equal the byte-for-byte content
 *                              recorded in the fixture's `before/` tree
 *   - sha256      (string)  — file body must hash to this hex digest
 *
 * Files NOT listed in the manifest are not asserted. This keeps fixtures
 * selective and short.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256OfFile(p) {
  const buf = fs.readFileSync(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function loadManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/**
 * Assert that the working directory matches the manifest's expectations.
 * Throws an Error with a clear message on the first mismatch.
 *
 * @param {Object} args
 * @param {Object} args.manifest    - Parsed manifest object
 * @param {string} args.workingDir  - Absolute path to the temp project root
 * @param {string} [args.beforeDir] - Absolute path to fixtures/<name>/before/
 *                                    (needed only when entries use `unchanged`)
 */
function assertManifest({ manifest, workingDir, beforeDir }) {
  for (const [relPath, spec] of Object.entries(manifest)) {
    if (relPath.startsWith('_')) continue; // comment keys
    const fullPath = path.join(workingDir, relPath);
    const fileExists = fs.existsSync(fullPath);

    if (Object.prototype.hasOwnProperty.call(spec, 'exists')) {
      if (Boolean(spec.exists) !== fileExists) {
        throw new Error(
          `manifest mismatch for ${relPath}: expected exists=${spec.exists}, got exists=${fileExists}`
        );
      }
      // If the manifest says the file should not exist, no further checks apply.
      if (spec.exists === false) continue;
    } else if (!fileExists) {
      throw new Error(
        `manifest mismatch for ${relPath}: expected file but it is missing`
      );
    }

    if (Object.prototype.hasOwnProperty.call(spec, 'contains')) {
      const body = fs.readFileSync(fullPath, 'utf8');
      if (!body.includes(spec.contains)) {
        throw new Error(
          `manifest mismatch for ${relPath}: expected body to include ${JSON.stringify(spec.contains)}`
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(spec, 'notContains')) {
      const body = fs.readFileSync(fullPath, 'utf8');
      if (body.includes(spec.notContains)) {
        throw new Error(
          `manifest mismatch for ${relPath}: body must NOT include ${JSON.stringify(spec.notContains)}`
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(spec, 'sha256')) {
      const actual = sha256OfFile(fullPath);
      if (actual !== spec.sha256) {
        throw new Error(
          `manifest mismatch for ${relPath}: sha256 expected ${spec.sha256}, got ${actual}`
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(spec, 'unchanged')) {
      if (spec.unchanged === true) {
        if (!beforeDir) {
          throw new Error(
            `manifest entry ${relPath} uses "unchanged: true" but no beforeDir was provided`
          );
        }
        const beforePath = path.join(beforeDir, relPath);
        if (!fs.existsSync(beforePath)) {
          throw new Error(
            `manifest entry ${relPath} expected "unchanged: true" but the file is not in the fixture's before/ tree`
          );
        }
        const beforeBytes = fs.readFileSync(beforePath);
        const afterBytes = fs.readFileSync(fullPath);
        if (!beforeBytes.equals(afterBytes)) {
          throw new Error(
            `manifest mismatch for ${relPath}: file was modified (expected unchanged)`
          );
        }
      }
    }
  }
}

module.exports = { loadManifest, assertManifest, sha256OfFile };
