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
 * This test greps every non-test .ts source under detectors/, metrics/, and
 * audit_core.ts (the orchestrator's own SKIP-reason text — see
 * `buildSkipReason`, which lands in a check's `evidence` array exactly like
 * a detector's own output) for banned conclusion phrasings, scoped to
 * string/template literal content only. Comments legitimately discuss
 * conclusions — e.g. a comment can say a check "cannot be resolved" while
 * explaining the code — so comments are stripped before matching, never
 * scanned. A banned phrase split across a `'a' + 'b'` concatenation seam or
 * a `` `a ${x} b` `` template interpolation seam is still matched as one
 * clause: adjacent `+`-joined literals are merged, and a template literal's
 * static parts are read as ONE combined string with interpolations
 * contributing nothing to the text (patterns tolerate the resulting
 * variable whitespace via `\s+`), rather than being split into disconnected
 * fragments at each `${...}`.
 *
 * The positive-control corpus below is derived mechanically from
 * `git diff f7293e3 4f619bb` — every evidence string issue #156 actually
 * removed from detectors/*.ts — not hand-picked, so this test guards the
 * real diff rather than a curated sample of it (a straight revert of the
 * fix is provably caught, not just twenty sentences someone remembered to
 * list).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['detectors', 'metrics'];
// Single files outside the two directories that also write report-visible
// evidence text (see the module docstring above).
const SCAN_FILES = ['audit_core.ts'];

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

interface AllowMarker {
  line: number;
  reason: string;
}

interface ScanResult {
  literals: StringLit[];
  /** `// evidence-phrasing:allow <reason>` markers with a non-empty reason.
   * A bare marker with no reason text does NOT appear here — it is not a
   * valid escape hatch (see the ratchet test below), so it suppresses
   * nothing and the underlying hit still fires until a reason is added. */
  allowMarkers: AllowMarker[];
}

// Keywords after which a following `/` starts a regex literal, not
// division — `return /pattern/.test(x)` is the case that matters here
// (common at the top of a detector's boolean-check branch). Treating
// "return" as if it were a value (the naive "last char was alnum" heuristic)
// would misread the regex's opening `/` as division, fall through to
// reading its first `"`/`'` as an open string quote, and desync string
// extraction for the rest of the file.
const KEYWORDS_NOT_VALUE = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'if',
  'while',
  'for',
  'switch',
]);

function scanSource(src: string): ScanResult {
  const literals: StringLit[] = [];
  const allowMarkers: AllowMarker[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  // Tracks whether the previous significant token was a "value" (identifier,
  // number, string, closing bracket) — distinguishes regex literals (which
  // aren't evidence text and must not be scanned) from division. Keywords
  // that precede an expression (return, typeof, new, …) are NOT values —
  // see KEYWORDS_NOT_VALUE.
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
    const text = src.slice(start, i);
    const m = text.match(/evidence-phrasing:allow\s+(\S.*)$/);
    if (m) {
      allowMarkers.push({ line, reason: m[1].trim() });
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

  // Pushes ONE merged literal for the whole template's static text —
  // interpolations contribute nothing to the text (patterns tolerate the
  // resulting variable whitespace via \s+), so a banned phrase split across
  // a `${...}` seam (e.g. "nothing ${adverb} prevents credentials") is still
  // matched as one clause instead of being silently split at the seam.
  // Nested strings/templates inside an interpolation are still extracted as
  // their own literal(s), in case the interpolated expression itself builds
  // risky text.
  function readTemplate(): void {
    const startLine = line;
    const startIndex = i;
    adv(1);
    let buf = '';
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\' && i + 1 < n) {
        buf += src[i + 1] === 'n' ? ' ' : src[i + 1];
        adv(2);
        continue;
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        adv(2);
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
            literals.push(readQuoted(c));
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
        continue;
      }
      buf += src[i];
      adv(1);
    }
    adv(1);
    literals.push({ text: buf, startLine, startIndex, endIndex: i });
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
      readTemplate();
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
    if (c === ')' || c === ']') {
      lastTokenWasValue = true;
      adv(1);
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let word = '';
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) {
        word += src[i];
        adv(1);
      }
      lastTokenWasValue = !KEYWORDS_NOT_VALUE.has(word);
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

  return { literals, allowMarkers };
}

/**
 * Merge string literals that are joined only by `+` (and whitespace) between
 * them — e.g. `'a ' + 'b'` — into one unit, so a banned phrase split across a
 * concatenation seam is still caught as a whole clause. Template-literal
 * interpolation seams don't need this: scanSource already merges them (see
 * readTemplate).
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
  { name: 'no reliable way of', re: /\bno (?:reliable )?way of\b/i },
  { name: 'is impossible', re: /\bis impossible\b/i },
  { name: 'not trustworthy', re: /\bnot trustworthy\b/i },
  { name: 'no entry point', re: /\bno entry point\b/i },
  { name: 'without human', re: /\bwithout human\b/i },
  { name: 'by hand', re: /\bby hand\b/i },
  { name: 'manually', re: /\bmanually\b/i },
  {
    name: 'depends on a human/someone',
    re: /\bdepends on (?:a\s+)?(?:human|someone|somebody|a developer|a person)\b/i,
  },
  {
    name: 'requires a human/developer/reviewer',
    re: /\brequires? (?:a )?(?:human|developer|person|someone|reviewer)\b/i,
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
  {
    name: 'consequence connective',
    // "this means"/"means that" draws an inference from the observation;
    // "leaves"/"left to" and "silently"/"unreviewed" assert an unverified
    // downstream consequence (silent merges, unreviewed changes) rather
    // than reporting what was found.
    re: /\b(?:this means|means that|leaves|left to|silently|unreviewed)\b/i,
  },
  {
    name: 'modal speculation',
    // "may/might/could (not) be/have/indicate/contain" guesses at a fact the
    // detector never checked (e.g. "tests may have real I/O dependencies").
    // Deliberately excludes bare "can" — too common in legitimate factual
    // statements ("X can be configured via Y") to ban without high false-
    // positive risk; the capability-claim patterns above already cover the
    // "can" phrasings actually removed by this issue ("depends on", "without
    // human", "bypass code review"). Two narrow lookahead exclusions:
    // "could not be read/parsed/loaded/written" is the engine reporting its
    // own I/O failure (readTextSafe/JSON.parse returning null), not
    // speculation about the project; "may be stale" is the dedicated
    // carve-out below (measurement-limitation wording), handled there so it
    // isn't duplicated here without that pattern's own "relative to" escape.
    re: /\b(?:may|might|could)\s+(?:not\s+)?(?:be|have|indicate|contain)\b(?!\s+(?:read|parsed|loaded|written|stale)\b)/i,
  },

  // --- Advice / recommendation ---------------------------------------------
  {
    name: 'advice-imperative clause',
    // An em dash, semicolon, colon, or comma opening a clause with an
    // imperative verb is remediation advice, not an observation. `(?!\.\w)`
    // excludes the verb being part of a token like "audit.json" or
    // "audit.total" (a filename or property access, not the imperative
    // "audit").
    re: /[—;:,]\s*\(?\s*(add|use|define|configure|enforce|restrict|review|prefer|consider|audit|prune|replace|switch|adopt|ensure|avoid|remove|migrate|install)\b(?!\.\w)/i,
  },
  {
    name: 'recommendation',
    // Standalone recommendation language, not anchored to a clause opener —
    // "the other two should be configured" has no em dash/colon before
    // "should be".
    re: /\b(?:should be|we recommend|recommended|consider|prefer)\b/i,
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
  { name: 'safe (verdict)', re: /\bsafe\b/i },
  { name: 'healthy', re: /\bhealthy\b/i },
  { name: 'clean dependency', re: /\bclean dependency\b/i },
  { name: 'auditable', re: /\bauditable\b/i },
  { name: 'appears', re: /\bappears?\b/i },
  { name: 'seems', re: /\bseems?\b/i },
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
  {
    name: 'is/are/not enforced',
    // Bare `\benforced\b` would also match the PreventionTier data tag
    // `'enforced'` compared in org_rollup.ts (`cl.tier === 'enforced'`) — a
    // status value, not evidence prose. Requiring a preceding is/are/not
    // verb excludes the bare tag while still catching "is enforced" / "not
    // enforced" as a verb phrase.
    re: /\b(?:is|are|not)\s+enforced\b/i,
  },
  { name: 'pyramid verdict', re: /\b(?:inverted|top-heavy)\b/i },
  {
    name: 'vertical coverage verdict',
    re: /\b(?:full|partial) vertical coverage\b/i,
  },
  { name: 'partial coverage verdict', re: /\bpartial (?:test )?coverage\b/i },
  {
    name: 'verdict adjective',
    re: /\b(?:inadequate|insufficient|bloated|fragile|poor|weak|out of date|too (?:short|long|few|many|low|high))\b/i,
  },
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

/** Scan one file's source for banned-phrase hits, honoring allow-markers. */
function scanOneFile(rel: string, src: string): Hit[] {
  const hits: Hit[] = [];
  const { literals, allowMarkers } = scanSource(src);
  for (const unit of mergeConcatenated(src, literals)) {
    for (const b of BANNED_PATTERNS) {
      const m = b.re.exec(unit.text);
      if (!m) continue;
      const allowed = allowMarkers.some(
        (a) => a.line === unit.startLine || a.line === unit.startLine - 1
      );
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
  return hits;
}

function nonTestTsFiles(dirName: string): string[] {
  const dirPath = join(SKILL, dirName);
  return readdirSync(dirPath)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => `${dirName}/${f}`);
}

/** Every non-test .ts source in scope, as {rel, abs} pairs. */
function scanTargets(): Array<{ rel: string; abs: string }> {
  const dirTargets = SCAN_DIRS.flatMap(nonTestTsFiles);
  return [...dirTargets, ...SCAN_FILES].map((rel) => ({
    rel,
    abs: join(SKILL, rel),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('positive controls: every known pre-fix conclusion-style string is caught', () => {
  // The bulk of this corpus is mechanically derived — every evidence string
  // `git diff f7293e3 4f619bb` removed from detectors/*.ts (extracted with
  // this same scanner run over the old and new file contents, so the corpus
  // reflects what a reader of the diff actually saw, concatenation/
  // interpolation seams included). A handful of reviewer-constructed strings
  // are appended at the end to cover phrasings the real diff didn't happen
  // to use but the rule still bans.
  const POSITIVE_CONTROLS = [
    // --- Original 8 (issue #156 canonical examples) -----------------------
    'no run mechanism found — no Makefile, docker-compose, package.json start/dev script, build-tool wrapper (mvnw/gradlew), manage.py, or Procfile; Claude Code cannot run the application without human involvement',
    'secret-scanner config present but no gate invokes it — scanning depends on someone running it',
    'possible string-built SQL pattern(s) found — review for injection risk',
    'total direct dependencies — excessive attack surface (> 200); audit and prune',
    'no README file found at repository root — a new developer has no entry point',
    'AI agent file(s) are not tracked in git — changes bypass code review',
    'no plain-HTTP (http://) service URLs found in config files — TLS appears enforced',
    'ignored by .gitignore but not .dockerignore — COPY . in Dockerfile would leak it into the image',
    // --- Round 2 (opus review: verdict adjectives/adverbs, consequence) ---
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
    // --- Round 3: mechanically derived from `git diff f7293e3 4f619bb` ----
    // (detectors/application_security.ts)
    'no string-concatenated SQL query patterns found — parameterized queries appear to be used',
    'auth found in only 2 of 5 mutation route files — some endpoints may be unprotected',
    'no input-validation patterns found — check skipped (may be handled at infrastructure level)',
    // (detectors/documentation.ts)
    'the README.md is too short (40 bytes) — missing setup instructions',
    'lacks a Markdown heading structure — may not be well-organised',
    'README reference(s) point to non-existent items — documentation is out of date',
    // (detectors/end_to_end_delivery.ts)
    'API, UI, and DB layers all detected — full vertical coverage',
    '2 of 3 layers detected — partial vertical coverage',
    // (detectors/prevention_coverage.ts)
    'no CI test gate found — untested changes can merge silently (this includes having no CI at all)',
    'CI runs the test suite and a coverage threshold is enforced',
    // (detectors/prompt_agent_integrity.ts)
    '.mcp.json uses safe endpoints (HTTPS or localhost only, no embedded credentials)',
    'all 3 AI agent file(s) are tracked in git — auditable change history',
    // (detectors/quality_assurance.ts)
    'test coverage proxy: 45.0% — partial test coverage (below 60% threshold)',
    'test coverage proxy: 10.0% — insufficient test coverage (below 30% threshold)',
    'no mocking/stubbing patterns found in test files — tests may have real I/O dependencies',
    // (detectors/software_best_practices.ts)
    '40.0% of Python function signatures carry return-type annotations — some typing present but not enforced by a type checker',
    // --- Reviewer-constructed strings (violate the rule's spirit; families
    // above must catch each one) ---
    'no run mechanism found at repo root — every verification loop requires a developer to run the build manually',
    'no CI workflow files found — this means changes reach main unreviewed',
    'no Makefile or npm script found — an AI agent has no reliable way of building this project',
    'only 1 of 3 security headers found — the other two should be configured',
    'test coverage proxy: 12.0% — inadequate coverage of source modules',
    'no context/spec/ directory found — traceability from spec to implementation is impossible here',
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

test('negative controls: engine-side / applicability / definitional / already-legitimate strings are not flagged', () => {
  // Two kinds of entry here:
  //  (a) statements about the engine's OWN measurement (incomputability,
  //      SKIP gates, scoring-rule names, threshold citations, measurement
  //      limitations) — legitimate and must survive;
  //  (b) residue from the mechanically-derived corpus above: strings the
  //      diff also touched (restructured, retemplated, or moved) but that
  //      were never a banned-phrase violation — kept visible here, with a
  //      reason, rather than silently dropped from the corpus.
  const NEGATIVE_CONTROLS: Array<{ s: string; reason: string }> = [
    {
      s: 'ci.json is available but has no run records — cannot compute a pass rate',
      reason: 'incomputability — the engine describing its own arithmetic',
    },
    {
      s: 'CI runs present but no decided run carries duration_seconds — cannot compute pipeline duration',
      reason: 'incomputability',
    },
    {
      s: 'check skipped — applies only to multi-service repos',
      reason: 'applicability / SKIP-gate reason',
    },
    {
      s: 'no feature branches found',
      reason: 'applicability / SKIP-gate reason',
    },
    {
      s: '3/4 dominance under the all-or-nothing standard',
      reason: 'scoring-rule name citation',
    },
    {
      s: 'org-level config is not visible from the repo',
      reason: 'measurement limitation, not a project verdict',
    },
    {
      s: 'only 40% of feature branches touch multiple layers (below 60%)',
      reason: 'threshold citation',
    },
    { s: 'threshold: 70%', reason: 'threshold citation' },
    {
      s: 'no package manifests found — dependency attack surface check skipped',
      reason: "the check's own name (SCS-08), not a verdict",
    },
    {
      s: 'measured from the coverage report(s) on disk — a report reflects the run that produced it and may be stale relative to the current tree',
      reason: 'a coverage report is a point-in-time artifact — engine-side',
    },
    {
      s: 'CI runs fetched but none reached a pass/fail verdict (456 skipped) — widen the run fetch or exclude trigger-style workflows so decided runs land in the sample',
      reason:
        "advice about the engine's OWN fetch configuration, not the project",
    },
    {
      s: 'no manifests found — dependency-risk automation check skipped',
      reason:
        "symmetric with SCS-08 above — the check's own name, not a verdict",
    },
    // --- Residue from the mechanically-derived corpus ----------------------
    {
      s: 'no MCP configuration found — no MCP servers configured for any agentic coding tool',
      reason:
        'tautological restatement of absence, not a capability/verdict claim; removed for redundancy, not phrasing',
    },
    {
      s: 'no CORS configuration found — browsers default to same-origin; check is not applicable',
      reason: 'applicability / SKIP-gate reason (documented browser default)',
    },
    {
      s: 'no password-hashing or session-token patterns found — hygiene check skipped (may not apply to this project)',
      reason:
        "applicability hedge about the check's own relevance, not a verdict about the project",
    },
    {
      s: 'no top-level service directories found — single-service project, DOC-02 not applicable',
      reason: 'applicability / SKIP-gate reason',
    },
    {
      s: 'static application-security testing gated in pre-commit/CI',
      reason:
        '"gated in pre-commit/CI" (no trailing verdict clause) is legitimate observational phrasing — the same bare idiom survives untouched elsewhere in this file (eslint boundary rules, documentation checker)',
    },
    {
      s: 'module-boundary tool gated in pre-commit/CI',
      reason: 'same as above',
    },
    {
      s: '3 hook file(s) found in .claude/hooks but none explicitly reference .env/secret patterns',
      reason:
        'cosmetic wording tweak (explicit pattern enumeration replaced "explicitly reference" with "matching"), not a banned-phrase fix',
    },
    {
      s: 'dependency automation configured with review required: .github/dependabot.yml',
      reason: 'cosmetic restructuring artifact, not a banned-phrase fix',
    },
  ];
  const falsePositives = NEGATIVE_CONTROLS.filter(({ s }) =>
    BANNED_PATTERNS.some((b) => b.re.test(s))
  );
  assert.deepEqual(
    falsePositives,
    [],
    `${falsePositives.length} carve-out string(s) were incorrectly flagged — narrow the offending pattern:\n` +
      falsePositives
        .map(({ s }) => {
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

test('scanner does not desync after a `return /regex/` containing a quote character', () => {
  // return /["']/.test(x) — under a heuristic that treats "return" as a
  // value, the regex's opening `/` reads as division instead, and the `"`
  // inside the character class opens a bogus string read that can desync
  // extraction for the rest of the file (green suite, coverage quietly
  // gone). KEYWORDS_NOT_VALUE is what prevents that.
  const src = [
    'function f(x: string): boolean {',
    '  return /["\']/.test(x);',
    '}',
    "export const bad = 'this string mentions a suspicious pattern';",
  ].join('\n');
  const { literals } = scanSource(src);
  assert.deepEqual(
    literals.map((l) => l.text),
    ['this string mentions a suspicious pattern'],
    `expected exactly the one real string literal after the regex; got: ${JSON.stringify(literals.map((l) => l.text))}`
  );
  const hits = literals.flatMap((lit) =>
    BANNED_PATTERNS.filter((b) => b.re.test(lit.text)).map((b) => b.name)
  );
  assert.ok(
    hits.includes('suspicious'),
    `the banned string after the regex literal must still be extracted and matched; hits: ${JSON.stringify(hits)}`
  );
});

test('tokenizer sanity floor — extraction did not silently collapse across the scanned tree', () => {
  // Not a per-file floor: some files in scope (e.g. metrics/_merge_records.ts,
  // a pure duration-math helper) legitimately carry zero evidence strings, so
  // a per-file minimum would be noise, not signal. What DOES generalize is
  // the aggregate: dozens of detect*/compute branches across ~30 files each
  // contribute evidence line(s), so a tokenizer desync (see the
  // regex-with-quote test above) big enough to matter shows up as a sharp
  // drop in the total literal count — turning a silent truncation into a
  // loud failure instead.
  const total = scanTargets().reduce(
    (s, { abs }) => s + scanSource(readFileSync(abs, 'utf8')).literals.length,
    0
  );
  assert.ok(
    total > 300,
    `expected >300 string literals total across the scanned files, got ${total} — the tokenizer may have desynced somewhere and stopped extracting`
  );
});

test('the evidence-phrasing:allow escape hatch is unused — introducing one is a visible review decision', () => {
  // Nothing in the scanned tree should need the escape hatch today. An
  // allow-marker count that is silently nonzero would mean exceptions have
  // been accumulating without anyone deciding that was OK — this assertion
  // makes adding the FIRST one a failing test a reviewer has to notice and
  // approve, not a quiet comment.
  const allows = scanTargets().flatMap(({ rel, abs }) =>
    scanSource(readFileSync(abs, 'utf8')).allowMarkers.map((a) => ({
      file: rel,
      line: a.line,
      reason: a.reason,
    }))
  );
  assert.deepEqual(
    allows,
    [],
    `${allows.length} evidence-phrasing:allow marker(s) found — each is a deliberate exception and must be reviewed here, not accumulated silently:\n` +
      allows.map((a) => `  ${a.file}:${a.line} — ${a.reason}`).join('\n')
  );
});

test('detectors/*.ts, metrics/*.ts, and audit_core.ts contain no string literal with a banned conclusion phrasing', () => {
  // Scoped to every string/template literal in these files, not only
  // literals assigned to an `evidence` array — a detector/metric/the
  // orchestrator can build its evidence lines via an intermediate variable,
  // a shared helper (see _base.ts, audit_core.ts's buildSkipReason), or any
  // other string the source happens to contain. If this ever flags a
  // literal that is provably NOT evidence-bound (e.g. a pure log/error
  // message with no path to a report), narrow the scan rather than reword
  // the message — the intent is still "no evidence-shaped conclusion
  // claim," this docstring just states the scan's actual reach.
  const hits = scanTargets().flatMap(({ rel, abs }) =>
    scanOneFile(rel, readFileSync(abs, 'utf8'))
  );
  assert.deepEqual(
    hits,
    [],
    [
      `${hits.length} string literal(s) under detectors/, metrics/, and audit_core.ts state a capability, consequence, advice, or verdict claim instead of an observation (issue #156):`,
      ...hits.map(
        (h) =>
          `  ${h.file}:${h.line} [${h.pattern}] matched "${h.matched}" in: ${JSON.stringify(h.full)}`
      ),
      'Evidence must state what was checked and what was found — never a capability/consequence claim, advice, or risk/quality verdict.',
      'If this is a legitimate engine-side statement (incomputability, SKIP applicability, a measurement limitation) that the existing carve-outs do not cover, narrow the offending pattern in tests/evidence-phrasing.test.ts.',
      'Otherwise reword the source string to state only what was measured, or — for the rare case of the engine describing its own operation, not the audited project — add an inline `// evidence-phrasing:allow <short reason>` comment on the preceding or same line (the reason is required; a bare marker suppresses nothing — see the ratchet test above).',
    ].join('\n')
  );
});
