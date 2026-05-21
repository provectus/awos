/**
 * Minimal YAML frontmatter parser for AWOS prompt files.
 *
 * Only supports what AWOS prompts actually use:
 *   key: value                     -> string
 *   key: [a, b, c]                 -> array (inline, on one line)
 *   key:                           -> array (multi-line bracketed list)
 *     [
 *       a,
 *       b,
 *     ]
 *
 * Anything else is left as a raw string. No npm dependencies.
 */

'use strict';

/**
 * Extract the raw frontmatter block plus the body.
 * @param {string} text - File contents
 * @returns {{ frontmatter: string|null, body: string }}
 */
function splitFrontmatter(text) {
  if (!text.startsWith('---')) {
    return { frontmatter: null, body: text };
  }
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') {
    return { frontmatter: null, body: text };
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { frontmatter: null, body: text };
  }
  const frontmatter = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatter, body };
}

/**
 * Parse an inline list like `[a, b, c]` (no nested structures).
 * @param {string} inner - The contents between [ and ]
 * @returns {string[]}
 */
function parseInlineList(inner) {
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(stripQuotes);
}

function stripQuotes(s) {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Parse the frontmatter block into key/value pairs.
 * @param {string} block - Frontmatter text (between the --- fences, exclusive)
 * @returns {Object}
 */
function parseFrontmatterBlock(block) {
  const result = {};
  const lines = block.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Skip blank lines
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Match `key: value` at column 0 (top-level keys only)
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];

    if (rest === '') {
      // Could be an empty string or the start of a multi-line bracketed list.
      // Look ahead — collect indented lines until we hit a non-indented one.
      const collected = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (next.trim() === '') {
          j++;
          continue;
        }
        // A non-indented line ends the multi-line value.
        if (!/^\s/.test(next)) break;
        collected.push(next);
        j++;
      }
      const joined = collected.join(' ').trim();
      if (joined.startsWith('[') && joined.endsWith(']')) {
        result[key] = parseInlineList(joined.slice(1, -1));
      } else {
        result[key] = joined;
      }
      i = j;
      continue;
    }

    // Inline list on same line
    if (rest.startsWith('[') && rest.endsWith(']')) {
      result[key] = parseInlineList(rest.slice(1, -1));
      i++;
      continue;
    }

    // If value starts with [ but doesn't end on this line, accumulate.
    if (rest.startsWith('[') && !rest.endsWith(']')) {
      const acc = [rest];
      let j = i + 1;
      while (j < lines.length) {
        acc.push(lines[j]);
        if (lines[j].includes(']')) break;
        j++;
      }
      const joined = acc.join(' ').trim();
      const open = joined.indexOf('[');
      const close = joined.lastIndexOf(']');
      if (open !== -1 && close !== -1 && close > open) {
        result[key] = parseInlineList(joined.slice(open + 1, close));
      } else {
        result[key] = joined;
      }
      i = j + 1;
      continue;
    }

    // Plain scalar
    result[key] = stripQuotes(rest.trim());
    i++;
  }
  return result;
}

/**
 * Parse a markdown file's frontmatter (if any) and return the body.
 * @param {string} text - File contents
 * @returns {{ data: Object, body: string, hasFrontmatter: boolean }}
 */
function parse(text) {
  const { frontmatter, body } = splitFrontmatter(text);
  if (frontmatter === null) {
    return { data: {}, body, hasFrontmatter: false };
  }
  return {
    data: parseFrontmatterBlock(frontmatter),
    body,
    hasFrontmatter: true,
  };
}

module.exports = { parse, splitFrontmatter };
