/**
 * evidence-phrasing.test.ts — regression guard for issue #156.
 *
 * Evidence strings must state what was measured — patterns/globs searched,
 * paths, counts, denominators — never a capability/consequence claim about
 * the audited project, never advice, never a risk/quality verdict. The
 * capability-level *definition* already lives in standards.toml's
 * `definition` field and surfaces in the report's hint column; evidence must
 * not repeat or assert it. Canonical bad example (fixed by this issue):
 *
 *   'no run mechanism found — no Makefile, docker-compose, package.json
 *    start/dev script, build-tool wrapper (mvnw/gradlew), manage.py, or
 *    Procfile; Claude Code cannot run the application without human
 *    involvement'
 *
 * The code only proved "none of these root files exist" — the trailing
 * clause is a capability claim that can be false.
 *
 * This test greps every non-test .ts source under detectors/ and metrics/
 * for banned conclusion phrasings, scoped to string/template literal content
 * only (comments legitimately discuss conclusions — e.g. a comment can say a
 * check "cannot be resolved" while explaining the code — so comments are
 * stripped before matching, never scanned).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['detectors', 'metrics'];

// ---------------------------------------------------------------------------
// Minimal source scanner: strips // and /* */ comments, and yields the text
// of every string/template literal (plus its source line) so banned-phrase
// regexes only ever see string-literal content. Not a full parser — it
// tracks just enough state (quote/backtick/comment/regex) to walk real TS
// source without misreading a `//` or `/*` sequence that appears inside a
// string. Adjacent literals joined only by `+` (and whitespace) are merged
// into one unit, so a clause split across a `'...' + '...'` concatenation
// (this codebase's usual style for long evidence strings) is still matched
// as a whole rather than being silently split at the seam.
// ---------------------------------------------------------------------------

interface StringLit {
  text: string;
  startLine: number;
  startIndex: number;
  endIndex: number;
}

interface ScanResult {
  literals: StringLit[];
  /** Line numbers carrying a `// evidence-phrasing:allow <reason>` marker. */
  allowLines: Set<number>;
}

function scanSource(src: string): ScanResult {
  const literals: StringLit[] = [];
  const allowLines = new Set<number>();
  let i = 0;
  let line = 1;
  const n = src.length;
  // Tracks whether the previous significant token was a "value" (identifier,
  // number, string, closing bracket) — distinguishes regex literals (which
  // aren't evidence text and must not be scanned) from division.
  let lastTokenWasValue = false;

  function adv(count = 1) {
    for (let k = 0; k < count; k++) {
      if (src[i] === '\n') line++;
      i++;
    }
  }

  function readLineComment() {
    const start = i;
    while (i < n && src[i] !== '\n') adv();
    if (/evidence-phrasing:allow/.test(src.slice(start, i))) {
      allowLines.add(line);
    }
  }

  function readBlockComment() {
    adv(2);
    while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv();
    adv(2);
  }

  function readQuoted(quote: string): StringLit {
    const startLine = line;
    const startIndex = i;
    adv(1);
    let buf = '';
    while (i < n && src[i] !== quote) {
      if (src[i] === '\\' && i + 1 < n) {
        buf += src[i + 1] === 'n' ? ' ' : src[i + 1];
        adv(2);
        continue;
      }
      buf += src[i];
      adv(1);
    }
    adv(1);
    return { text: buf, startLine, startIndex, endIndex: i };
  }

  function readTemplate(): StringLit[] {
    const segs: StringLit[] = [];
    let startLine = line;
    let startIndex = i;
    adv(1);
    let buf = '';
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\' && i + 1 < n) {
        buf += src[i + 1] === 'n' ? ' ' : src[i + 1];
        adv(2);
        continue;
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        segs.push({ text: buf, startLine, startIndex, endIndex: i });
        buf = '';
        adv(2);
        // Skip the interpolated expression, but keep tokenizing inside it —
        // it can itself contain strings, nested templates, or comments.
        let depth = 1;
        while (i < n && depth > 0) {
          const c = src[i];
          if (c === '{') {
            depth++;
            adv(1);
          } else if (c === '}') {
            depth--;
            adv(1);
          } else if (c === '"' || c === "'") {
            readQuoted(c);
          } else if (c === '`') {
            readTemplate();
          } else if (c === '/' && src[i + 1] === '/') {
            readLineComment();
          } else if (c === '/' && src[i + 1] === '*') {
            readBlockComment();
          } else {
            adv(1);
          }
        }
        startLine = line;
        startIndex = i;
        continue;
      }
      buf += src[i];
      adv(1);
    }
    segs.push({ text: buf, startLine, startIndex, endIndex: i });
    adv(1);
    return segs;
  }

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      readLineComment();
      lastTokenWasValue = false;
      continue;
    }
    if (c === '/' && c2 === '*') {
      readBlockComment();
      lastTokenWasValue = false;
      continue;
    }
    if (c === '"' || c === "'") {
      literals.push(readQuoted(c));
      lastTokenWasValue = true;
      continue;
    }
    if (c === '`') {
      literals.push(...readTemplate());
      lastTokenWasValue = true;
      continue;
    }
    if (c === '/' && !lastTokenWasValue) {
      // Regex literal — not evidence text, skip its body without scanning.
      adv(1);
      let inClass = false;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          adv(2);
          continue;
        }
        if (src[i] === '[') {
          inClass = true;
          adv(1);
          continue;
        }
        if (src[i] === ']') {
          inClass = false;
          adv(1);
          continue;
        }
        if (src[i] === '/' && !inClass) {
          adv(1);
          break;
        }
        if (src[i] === '\n') break; // malformed — bail rather than hang
        adv(1);
      }
      while (i < n && /[a-z]/i.test(src[i])) adv(1); // flags
      lastTokenWasValue = true;
      continue;
    }
    if (/[A-Za-z0-9_$)\]]/.test(c)) {
      lastTokenWasValue = true;
      adv(1);
      continue;
    }
    if (/\s/.test(c)) {
      adv(1);
      continue;
    }
    lastTokenWasValue = false;
    adv(1);
  }

  // A `// evidence-phrasing:allow` marker on a line inside a /* */ block
  // comment is not supported — only // line comments are, per the issue's
  // "one documented escape hatch" instruction. Nothing further to do here.

  return { literals, allowLines };
}

/**
 * Merge string literals that are joined only by `+` (and whitespace) between
 * them — e.g. `'a ' + 'b'` — into one unit, so a banned phrase split across a
 * concatenation seam is still caught as a whole clause.
 */
function mergeConcatenated(
  src: string,
  literals: StringLit[]
): Array<{ text: string; startLine: number }> {
  const merged: Array<{ text: string; startLine: number }> = [];
  let i = 0;
  while (i < literals.length) {
    let text = literals[i].text;
    const startLine = literals[i].startLine;
    let end = literals[i].endIndex;
    let j = i + 1;
    while (j < literals.length) {
      const gap = src.slice(end, literals[j].startIndex);
      if (!/^\s*\+\s*$/.test(gap)) break;
      text += literals[j].text;
      end = literals[j].endIndex;
      j++;
    }
    merged.push({ text, startLine });
    i = j;
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Banned-phrase families
// ---------------------------------------------------------------------------
// Each entry: `name` for failure messages, `re` matched against merged
// literal text. Carve-outs are encoded as negative lookaheads next to the
// pattern they narrow, not as a separate allowlist of strings — a lookahead
// stays correct as new detectors/metrics are added, a string allowlist rots.

interface BannedPattern {
  name: string;
  re: RegExp;
}

const BANNED_PATTERNS: BannedPattern[] = [
  // --- Capability / consequence claims about the audited project ---------
  {
    name: 'cannot (capability claim)',
    // "cannot compute ..." is the engine describing its OWN arithmetic
    // failing (ci_pass_rate.ts, pipeline_duration.ts) — carved out. Every
    // other "cannot" asserts what the project (or its agent) can't do.
    re: /\bcannot\b(?!\s+compute\b)/i,
  },
  { name: "can't", re: /\bcan't\b/i },
  { name: 'unable to', re: /\bunable to\b/i },
  { name: 'no way to', re: /\bno way to\b/i },
  { name: 'no entry point', re: /\bno entry point\b/i },
  { name: 'without human', re: /\bwithout human\b/i },
  { name: 'by hand', re: /\bby hand\b/i },
  {
    name: 'depends on a human/someone',
    re: /\bdepends on (?:a\s+)?(?:human|someone|somebody|a developer|a person)\b/i,
  },
  {
    name: 'nothing (mechanically) blocks/prevents',
    re: /\bnothing\s+(?:mechanically\s+)?(?:blocks|prevents)\b/i,
  },
  { name: 'not possible', re: /\bnot possible\b/i },
  { name: 'bypass code review', re: /\bbypass(?:es)? code review\b/i },
  { name: 'are/is not blocked', re: /\b(?:is|are) not blocked\b/i },
  { name: 'have no reference', re: /\bhave no reference\b/i },
  { name: 'would leak', re: /\bwould leak\b/i },

  // --- Advice / trailing imperative ---------------------------------------
  {
    name: 'advice-imperative clause',
    // An em dash or semicolon opening a clause with an imperative verb is
    // remediation advice, not an observation. `(?!\.\w)` excludes the verb
    // being part of a token like "audit.json" or "audit.total" (a filename
    // or property access, not the imperative "audit").
    re: /[—;]\s*\(?\s*(add|use|define|configure|enforce|restrict|review|prefer|consider|audit|prune|replace|switch|adopt|ensure|avoid|remove|migrate|install)\b(?!\.\w)/i,
  },

  // --- Verdict / speculation -----------------------------------------------
  {
    name: 'risk',
    // Symmetric with the "attack surface" carve-out below: a check's own
    // name can legitimately end in "risk" (e.g. a future "dependency-risk
    // automation check skipped" SKIP note) — that's the check's identity,
    // not a verdict. Only bare "risk" (e.g. "review for injection risk") is
    // banned.
    re: /\brisk\b(?!\s+(?:\w+\s+)?check\b)/i,
  },
  {
    name: 'attack surface (verdict)',
    // "dependency attack surface check" is a check's own name (SCS-08) cited
    // in its SKIP note — not a verdict about the project. Only bare
    // "attack surface" (e.g. "excessive attack surface") is banned.
    re: /\battack surface\b(?!\s+check\b)/i,
  },
  { name: 'excessive', re: /\bexcessive\b/i },
  { name: 'unsafe', re: /\bunsafe\b/i },
  { name: 'insecure', re: /\binsecure\b/i },
  { name: 'healthy', re: /\bhealthy\b/i },
  { name: 'clean dependency', re: /\bclean dependency\b/i },
  { name: 'appears', re: /\bappears\b/i },
  { name: 'seems', re: /\bseems\b/i },
  {
    name: 'may be stale (verdict)',
    // "...and may be stale relative to the current tree" (line_coverage.ts)
    // is the engine disclosing that a coverage REPORT is a point-in-time
    // artifact — a measurement limitation, not a verdict about the project.
    re: /\bmay be stale\b(?!\s+relative to)/i,
  },
  { name: 'properly', re: /\bproperly\b/i },
  { name: 'well-typed', re: /\bwell-typed\b/i },
  {
    name: 'mechanically <verdict>',
    re: /\bmechanically\s+(?:blocked|caught|managed|enforced)\b/i,
  },
  { name: 'pyramid verdict', re: /\b(?:inverted|top-heavy)\b/i },
  { name: 'potential attack', re: /\bpotential\s+[\w-]+\s+attack\b/i },
  { name: 'drives nothing', re: /\bdrives nothing\b/i },
  { name: 'suspicious', re: /\bsuspicious\b/i },
];

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

interface Hit {
  file: string;
  line: number;
  pattern: string;
  matched: string;
  full: string;
}

function scanDir(dirName: string): Hit[] {
  const dirPath = join(SKILL, dirName);
  const files = readdirSync(dirPath).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
  );
  const hits: Hit[] = [];
  for (const f of files) {
    const rel = `${dirName}/${f}`;
    const src = readFileSync(join(dirPath, f), 'utf8');
    const { literals, allowLines } = scanSource(src);
    for (const unit of mergeConcatenated(src, literals)) {
      for (const b of BANNED_PATTERNS) {
        const m = b.re.exec(unit.text);
        if (!m) continue;
        const allowed =
          allowLines.has(unit.startLine) || allowLines.has(unit.startLine - 1);
        if (allowed) continue;
        hits.push({
          file: rel,
          line: unit.startLine,
          pattern: b.name,
          matched: m[0],
          full: unit.text,
        });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('positive controls: every known pre-fix conclusion-style string is caught', () => {
  // Real strings this issue fixed (or strings shaped exactly like them) —
  // hardcoded here so a regression in the matcher itself is provably caught,
  // independent of whatever the tree currently contains.
  const POSITIVE_CONTROLS = [
    'no run mechanism found — no Makefile, docker-compose, package.json start/dev script, build-tool wrapper (mvnw/gradlew), manage.py, or Procfile; Claude Code cannot run the application without human involvement',
    'secret-scanner config present but no gate invokes it — scanning depends on someone running it',
    'possible string-built SQL pattern(s) found — review for injection risk',
    'total direct dependencies — excessive attack surface (> 200); audit and prune',
    'no README file found at repository root — a new developer has no entry point',
    'AI agent file(s) are not tracked in git — changes bypass code review',
    'no plain-HTTP (http://) service URLs found in config files — TLS appears enforced',
    'ignored by .gitignore but not .dockerignore — COPY . in Dockerfile would leak it into the image',
    // Second-pass gap (opus review): verdict adjectives/adverbs and
    // consequence phrases outside the first sweep's word list.
    'all N relevant sensitive file type(s) properly excluded',
    '(no mypy/pyright config, but well-typed)',
    'committed credentials are mechanically blocked',
    'style drift is mechanically blocked',
    'layering violations are not mechanically caught',
    'stale docs are not mechanically caught',
    'test pyramid is inverted — more integration than unit tests',
    'test pyramid top-heavy — more e2e than integration tests',
    'contain invisible Unicode characters — potential hidden-instruction attack',
    'bot config present but drives nothing (no package-ecosystem entries)',
    'hook script(s) contain suspicious patterns',
  ];
  const misses = POSITIVE_CONTROLS.filter(
    (s) => !BANNED_PATTERNS.some((b) => b.re.test(s))
  );
  assert.deepEqual(
    misses,
    [],
    `${misses.length} known conclusion-style string(s) were NOT caught by any banned pattern — the matcher has regressed:\n` +
      misses.map((s) => `  "${s}"`).join('\n')
  );
});

test('negative controls: engine-side / applicability / definitional strings are not flagged', () => {
  // Statements about the engine's OWN measurement (incomputability, SKIP
  // gates, scoring-rule names, threshold citations, measurement
  // limitations) — legitimate and must survive.
  const NEGATIVE_CONTROLS = [
    'ci.json is available but has no run records — cannot compute a pass rate',
    'CI runs present but no decided run carries duration_seconds — cannot compute pipeline duration',
    'check skipped — applies only to multi-service repos',
    'no feature branches found',
    '3/4 dominance under the all-or-nothing standard',
    'org-level config is not visible from the repo',
    'WARN evidence must cite the resolved pass_at: below 60%',
    'threshold: 70%',
    'no package manifests found — dependency attack surface check skipped',
    'measured from the coverage report(s) on disk — a report reflects the run that produced it and may be stale relative to the current tree',
    'CI runs fetched but none reached a pass/fail verdict (456 skipped) — widen the run fetch or exclude trigger-style workflows so decided runs land in the sample',
    // Symmetric with the attack-surface/check carve-out above: a check's own
    // name citing "risk" in a SKIP note is not a verdict about the project.
    'no manifests found — dependency-risk automation check skipped',
  ];
  const falsePositives = NEGATIVE_CONTROLS.filter((s) =>
    BANNED_PATTERNS.some((b) => b.re.test(s))
  );
  assert.deepEqual(
    falsePositives,
    [],
    `${falsePositives.length} carve-out string(s) were incorrectly flagged — narrow the offending pattern:\n` +
      falsePositives
        .map((s) => {
          const hit = BANNED_PATTERNS.find((b) => b.re.test(s))!;
          return `  [${hit.name}] "${s}"`;
        })
        .join('\n')
  );
});

test('scanner strips comments before matching — a comment discussing a conclusion is not scanned', () => {
  const src = [
    "// This detector's FAIL means the check cannot be resolved without human review.",
    "export const x = 'plain observation string';",
  ].join('\n');
  const { literals } = scanSource(src);
  const hits = literals.flatMap((lit) =>
    BANNED_PATTERNS.filter((b) => b.re.test(lit.text))
  );
  assert.deepEqual(
    hits,
    [],
    'a banned phrase inside a // comment must not be scanned — only string-literal content is in scope'
  );
});

test('scanner does not treat a regex literal as evidence text', () => {
  const src = "const re = /cannot-be-a-string/; const s = 'fine';";
  const { literals } = scanSource(src);
  assert.deepEqual(
    literals.map((l) => l.text),
    ['fine'],
    'the regex literal body must not be extracted as a string literal'
  );
});

test('detectors/*.ts and metrics/*.ts contain no string literal with a banned conclusion phrasing', () => {
  // Scoped to every string/template literal in these two directories, not
  // only literals assigned to an `evidence` array — a detector/metric can
  // build its evidence lines via an intermediate variable, a shared helper
  // (see _base.ts), or (per the failure below) any other string the source
  // happens to contain. If this ever flags a literal that is provably NOT
  // evidence-bound (e.g. a pure log/error message with no path to a report),
  // narrow the scan rather than reword the message — the intent is still
  // "no evidence-shaped conclusion claim," this docstring just states the
  // scan's actual reach.
  const hits = SCAN_DIRS.flatMap((d) => scanDir(d));
  assert.deepEqual(
    hits,
    [],
    [
      `${hits.length} string literal(s) under detectors/ and metrics/ state a capability, consequence, advice, or verdict claim instead of an observation (issue #156):`,
      ...hits.map(
        (h) =>
          `  ${h.file}:${h.line} [${h.pattern}] matched "${h.matched}" in: ${JSON.stringify(h.full)}`
      ),
      'Evidence must state what was checked and what was found — never a capability/consequence claim, advice, or risk/quality verdict.',
      'If this is a legitimate engine-side statement (incomputability, SKIP applicability, a measurement limitation) that the existing carve-outs do not cover, narrow the offending pattern in tests/evidence-phrasing.test.ts.',
      'Otherwise reword the source string to state only what was measured, or — for the rare case of the engine describing its own operation, not the audited project — add an inline `// evidence-phrasing:allow <short reason>` comment on the preceding or same line.',
    ].join('\n')
  );
});
