#!/usr/bin/env node
/**
 * lint-spec.mjs — document-level checks for a functional-spec.md.
 *
 * Usage:
 *   node lint-spec.mjs <spec-dir-or-file> [--json]
 *
 * /awos:spec runs it right after writing the spec, and anyone can run it by
 * hand. It reads one functional-spec.md (given directly, or found inside the
 * spec directory) and reports what the process rigor of the command cannot
 * prove about the produced document.
 *
 * Errors (exit 1 when any is present):
 *   unresolved-marker            a raw `[NEEDS CLARIFICATION` marker is still
 *                                in the file — right after the write this is
 *                                expected (the final review resolves them);
 *                                downstream it means an open question was
 *                                built over.
 *   criterion-shape              a `- [ ]` / `- [x]` criterion has no single
 *                                sentence carrying both `when` and `then`, in
 *                                that order (case-insensitive).
 *   requirement-without-criteria a `### 2.N` requirement subsection holds no
 *                                checkbox criterion at all.
 *
 * Warnings (reported, never fatal):
 *   no-numbered-requirements     the Functional Requirements section has
 *                                criteria but no `### 2.N` subsection, so the
 *                                requirement-without-criteria check did not
 *                                run (a spec in the pre-2026-11 flat shape).
 *   weak-word                    a word from the self-review list of
 *                                commands/spec.md — vague qualities, escape
 *                                clauses, open-ended lists, indefinite
 *                                quantities, verbs that hide the behavior,
 *                                "and/or" — inside the Functional Requirements
 *                                section. Quoted on-screen text is skipped:
 *                                it is a verbatim contract, not the author's
 *                                wording. Headings are skipped too.
 *
 * Parsing is syntax-driven: a criterion is a checkbox list item plus its
 * indented continuation lines; a requirement is a `### 2.N` heading up to the
 * next heading; the Functional Requirements section is the `## 2.` heading
 * (or the one whose title says so) up to the next `## ` heading. When no such
 * section exists (a legacy flat spec), weak words are scanned in the whole
 * file. The script never edits the spec.
 *
 * --json prints { file, ok, errors, warnings, counts } on stdout instead of
 * the human-readable report. Exit codes: 0 clean (warnings allowed), 1 errors
 * found, 2 usage or unreadable input.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Word lists (mirrors the self-review in commands/spec.md Step 6; "should"
// is deliberately absent — it is the spec's modal verb, not a weasel word)
// ---------------------------------------------------------------------------

export const WEAK_WORDS = [
  // vague qualities
  { pattern: /\bfast\b/i, label: 'fast', group: 'vague quality' },
  {
    pattern: /\buser[- ]friendly\b/i,
    label: 'user-friendly',
    group: 'vague quality',
  },
  { pattern: /\beasy\b/i, label: 'easy', group: 'vague quality' },
  { pattern: /\bintuitive\b/i, label: 'intuitive', group: 'vague quality' },
  { pattern: /\brobust\b/i, label: 'robust', group: 'vague quality' },
  // escape clauses
  {
    pattern: /\bas appropriate\b/i,
    label: 'as appropriate',
    group: 'escape clause',
  },
  {
    pattern: /\bif necessary\b/i,
    label: 'if necessary',
    group: 'escape clause',
  },
  {
    pattern: /\bwhere possible\b/i,
    label: 'where possible',
    group: 'escape clause',
  },
  { pattern: /\busually\b/i, label: 'usually', group: 'escape clause' },
  // open-ended lists
  { pattern: /\betc\b\.?/i, label: 'etc.', group: 'open-ended list' },
  { pattern: /\band so on\b/i, label: 'and so on', group: 'open-ended list' },
  {
    pattern: /\bincluding but not limited to\b/i,
    label: 'including but not limited to',
    group: 'open-ended list',
  },
  // indefinite quantities
  { pattern: /\bseveral\b/i, label: 'several', group: 'indefinite quantity' },
  { pattern: /\bsome\b/i, label: 'some', group: 'indefinite quantity' },
  { pattern: /\bmany\b/i, label: 'many', group: 'indefinite quantity' },
  { pattern: /\bquickly\b/i, label: 'quickly', group: 'indefinite quantity' },
  { pattern: /\bsoon\b/i, label: 'soon', group: 'indefinite quantity' },
  // verbs that hide the behavior
  {
    pattern: /\bsupport(s|ed|ing)?\b/i,
    label: 'support',
    group: 'hidden behavior',
  },
  {
    pattern: /\bhandle[sd]?\b|\bhandling\b/i,
    label: 'handle',
    group: 'hidden behavior',
  },
  {
    pattern: /\bmanage[sd]?\b|\bmanaging\b/i,
    label: 'manage',
    group: 'hidden behavior',
  },
  {
    pattern: /\bprocess(es|ed|ing)?\b/i,
    label: 'process',
    group: 'hidden behavior',
  },
  // and/or
  { pattern: /\band\/or\b/i, label: 'and/or', group: 'and/or' },
];

const MARKER = '[NEEDS CLARIFICATION';
const CHECKBOX = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const HEADING = /^#{1,6}\s/;
const TABLE_ROW = /^\s*\|/;
const REQUIREMENT_HEADING = /^###\s+2\.(\d+)\b/;
const H2 = /^##\s+(.*)$/;

// ---------------------------------------------------------------------------
// Sentence shape
// ---------------------------------------------------------------------------

// Quoted on-screen text is a verbatim contract: it may carry its own period
// ("Name is required.") without ending the author's sentence, and it may
// carry words the author did not choose. Strip it before either check.
function stripQuoted(text) {
  return text
    .replace(/"[^"\n]*"/g, ' " ')
    .replace(/“[^”\n]*”/g, ' " ')
    .replace(/‘[^’\n]*’/g, ' " ')
    .replace(/(^|[\s(:])'[^'\n]*'(?=[\s).,;:!?]|$)/g, '$1 " ');
}

// Abbreviations and decimals must not end a sentence.
function protectPeriods(text) {
  return text
    .replace(/\b(e\.g|i\.e|etc|vs|approx)\./gi, '$1\u0000')
    .replace(/(\d)\.(\d)/g, '$1\u0000$2');
}

export function splitSentences(text) {
  const prepared = protectPeriods(stripQuoted(text));
  return prepared
    .split(/(?<=[.!?])\s+|(?<=[.!?])$/)
    .map((s) => s.replace(/\u0000/g, '.').trim())
    .filter(Boolean);
}

// A criterion passes when at least one of its sentences carries `when`
// before `then`. `Given …, when …, then …` passes; `When … . Then …` (two
// sentences) and a declarative retelling do not.
export function hasWhenThenSentence(text) {
  return splitSentences(text).some((sentence) => {
    const when = sentence.search(/\bwhen\b/i);
    const then = sentence.search(/\bthen\b/i);
    return when !== -1 && then !== -1 && when < then;
  });
}

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

function isFunctionalRequirementsTitle(title) {
  return /^2\b/.test(title) || /functional requirements/i.test(title);
}

export function parseSpec(md) {
  const lines = md.split('\n');
  const criteria = []; // { line, text }
  const requirements = []; // { line, number, title, criteria: number }
  const markers = []; // { line, text }
  const section2 = { start: -1, end: lines.length }; // 0-based, end exclusive

  let requirement = null;
  let inSection2 = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A marker quoted in inline code (`[NEEDS CLARIFICATION: …]`) is a
    // mention of the convention, not an open question.
    const outsideCode = line.replace(/`[^`]*`/g, '');
    let idx = outsideCode.indexOf(MARKER);
    while (idx !== -1) {
      const close = outsideCode.indexOf(']', idx);
      markers.push({
        line: i + 1,
        text:
          close === -1
            ? outsideCode.slice(idx)
            : outsideCode.slice(idx, close + 1),
      });
      idx = outsideCode.indexOf(MARKER, idx + MARKER.length);
    }

    const h2 = line.match(H2);
    if (h2) {
      if (inSection2) {
        section2.end = i;
        inSection2 = false;
      } else if (
        section2.start === -1 &&
        isFunctionalRequirementsTitle(h2[1].trim())
      ) {
        section2.start = i;
        inSection2 = true;
      }
    }

    if (HEADING.test(line)) {
      requirement = null;
      const req = line.match(REQUIREMENT_HEADING);
      if (req) {
        requirement = {
          line: i + 1,
          number: `2.${req[1]}`,
          title: line.replace(/^###\s+/, '').trim(),
          criteria: 0,
        };
        requirements.push(requirement);
      }
      continue;
    }

    const box = line.match(CHECKBOX);
    if (box) {
      const indent = box[1].length;
      let text = box[3].trim();
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        const nextIndent = next.match(/^\s*/)[0].length;
        const continues =
          next.trim() !== '' &&
          nextIndent > indent &&
          !LIST_ITEM.test(next) &&
          !HEADING.test(next) &&
          !TABLE_ROW.test(next);
        if (!continues) break;
        text += ' ' + next.trim();
        j++;
      }
      criteria.push({ line: i + 1, text });
      if (requirement) requirement.criteria += 1;
      i = j - 1;
    }
  }

  return { lines, criteria, requirements, markers, section2 };
}

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

export function lintSpec(md) {
  const { lines, criteria, requirements, markers, section2 } = parseSpec(md);
  const errors = [];
  const warnings = [];

  for (const m of markers) {
    errors.push({
      code: 'unresolved-marker',
      line: m.line,
      message: `unresolved marker: ${m.text}`,
    });
  }

  for (const c of criteria) {
    if (!hasWhenThenSentence(c.text)) {
      errors.push({
        code: 'criterion-shape',
        line: c.line,
        message: `criterion has no single sentence carrying "when" before "then": ${c.text}`,
      });
    }
  }

  for (const r of requirements) {
    if (r.criteria === 0) {
      errors.push({
        code: 'requirement-without-criteria',
        line: r.line,
        message: `requirement ${r.number} has no acceptance criterion: ${r.title}`,
      });
    }
  }

  if (
    section2.start !== -1 &&
    criteria.length > 0 &&
    requirements.length === 0
  ) {
    warnings.push({
      code: 'no-numbered-requirements',
      line: section2.start + 1,
      message:
        'no `### 2.N` requirement subsections found; the requirement-without-criteria check did not run (pre-2026-11 template shape?)',
    });
  }

  const scanStart = section2.start === -1 ? 0 : section2.start;
  const scanEnd = section2.start === -1 ? lines.length : section2.end;
  for (let i = scanStart; i < scanEnd; i++) {
    const line = lines[i];
    if (HEADING.test(line) || /^\s*\|[\s|:-]*$/.test(line)) continue;
    const text = stripQuoted(line);
    for (const word of WEAK_WORDS) {
      if (word.pattern.test(text)) {
        warnings.push({
          code: 'weak-word',
          line: i + 1,
          message: `weak word "${word.label}" (${word.group}): ${line.trim()}`,
        });
      }
    }
  }

  errors.sort((a, b) => a.line - b.line);
  warnings.sort((a, b) => a.line - b.line);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: {
      markers: markers.length,
      criteria: criteria.length,
      requirements: requirements.length,
      errors: errors.length,
      warnings: warnings.length,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function resolveSpecFile(target) {
  const resolved = path.resolve(target);
  const stat = fs.statSync(resolved);
  return stat.isDirectory()
    ? path.join(resolved, 'functional-spec.md')
    : resolved;
}

function formatReport(file, result) {
  const out = [];
  for (const e of result.errors) {
    out.push(`error: ${file}:${e.line}: [${e.code}] ${e.message}`);
  }
  for (const w of result.warnings) {
    out.push(`warning: ${file}:${w.line}: [${w.code}] ${w.message}`);
  }
  const c = result.counts;
  out.push(
    `${result.ok ? 'ok' : 'failed'}: ${c.errors} error(s), ${c.warnings} warning(s) — ` +
      `${c.requirements} numbered requirement(s), ${c.criteria} criteria, ${c.markers} unresolved marker(s)`
  );
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('Usage: node lint-spec.mjs <spec-dir-or-file> [--json]');
    process.exit(2);
  }

  let file;
  let md;
  try {
    file = resolveSpecFile(target);
    md = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`cannot read spec: ${err.message}`);
    process.exit(2);
  }

  const result = lintSpec(md);
  if (json) {
    console.log(JSON.stringify({ file, ...result }, null, 2));
  } else {
    console.log(formatReport(file, result));
  }
  process.exit(result.ok ? 0 : 1);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
