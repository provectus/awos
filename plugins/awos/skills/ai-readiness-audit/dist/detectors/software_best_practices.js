// plugins/awos/skills/ai-readiness-audit/detectors/_base.ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { execFileSync } from "node:child_process";
var VALID_STATUS = /* @__PURE__ */ new Set(["PASS", "WARN", "FAIL", "SKIP"]);
var DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".next",
  "target"
];
function makeResult(status, value, evidence, method = "detected") {
  if (!VALID_STATUS.has(status)) {
    throw new Error(
      `status must be one of ${[...VALID_STATUS].sort()}, got ${status}`
    );
  }
  return { status, value, evidence: [...evidence], method };
}
function iterFiles(repoPath, globs, ignore = DEFAULT_IGNORE) {
  const pruneArgs = ignore.flatMap((d) => ["-name", d, "-prune", "-o"]);
  const nameArgs = globs.flatMap((g, i) => {
    const bare = g.replace(/^\*\*\//, "");
    return i === 0 ? ["-name", bare] : ["-o", "-name", bare];
  });
  const out = execFileSync(
    "find",
    [repoPath, ...pruneArgs, "(", ...nameArgs, ")", "-type", "f", "-print"],
    { encoding: "utf8" }
  );
  return out.split("\n").filter(Boolean).sort();
}
function grep(repoPath, pattern, globs, flags = "") {
  const hits = [];
  const rx = new RegExp(pattern.source, pattern.flags || flags);
  for (const p of iterFiles(repoPath, globs)) {
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, i) => {
      if (rx.test(line))
        hits.push({
          file: relative(repoPath, p),
          line: i + 1,
          text: line.trim()
        });
    });
  }
  return hits.sort(
    (a, b) => a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
  );
}

// plugins/awos/skills/ai-readiness-audit/detectors/software_best_practices.ts
import { basename, relative as relative2 } from "node:path";
import { readFileSync as readFileSync2 } from "node:fs";
var PY2_EXCEPT = /except\s+[A-Za-z_][\w.]*\s*,\s*[A-Za-z_][\w.]*\s*:/;
function detectExceptClauseDefect(repoPath, _params) {
  const hits = grep(repoPath, PY2_EXCEPT, ["**/*.py"]);
  if (hits.length) {
    const ev = hits.map((h) => `${h.file}:${h.line} ${h.text}`);
    return makeResult("FAIL", hits.length, ev);
  }
  return makeResult("PASS", 0, ["no Python-2 except-clause syntax found"]);
}
var LOCKFILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "gradle.lockfile",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum"
];
function detectLockfiles(repoPath, _params) {
  const found = iterFiles(repoPath, LOCKFILES).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      "PASS",
      uniq.length,
      uniq.map((n) => `lock file present: ${n}`)
    );
  }
  return makeResult("FAIL", 0, ["no dependency lock file found"]);
}
var HANDLED_RX = /\b(log|logger|logging|print|console\.(log|warn|error|debug)|raise|throw|re-?raise|return|traceback|sys\.exit|abort|panic)\b/i;
var EXCEPT_OPENER_RX = /^\s*(except\b|catch\s*\(|catch\s*$)/;
var EMPTY_BODY_RX = /^\s*(pass|}\s*$|{\s*}\s*)$/;
function analyseFile(repoPath, filePath) {
  let src;
  try {
    src = readFileSync2(filePath, "utf8");
  } catch {
    return [];
  }
  const lines = src.split("\n");
  const samples = [];
  const rel = relative2(repoPath, filePath);
  for (let i = 0; i < lines.length; i++) {
    if (!EXCEPT_OPENER_RX.test(lines[i])) continue;
    const body = lines.slice(i + 1, i + 5).join("\n");
    const isEmptyFirst = lines[i + 1] !== void 0 && EMPTY_BODY_RX.test(lines[i + 1]);
    const hasHandled = HANDLED_RX.test(body);
    const bad = isEmptyFirst || !hasHandled;
    samples.push({ file: rel, line: i + 1, bad });
  }
  return samples;
}
var SOURCE_GLOBS = [
  "*.py",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.java",
  "*.kt",
  "*.go"
];
function detectErrorHandling(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS);
  const allSamples = files.flatMap(
    (f) => analyseFile(repoPath, f)
  );
  if (allSamples.length === 0) {
    return makeResult("PASS", 0, [
      "no catch/except blocks found \u2014 nothing to assess"
    ]);
  }
  const badSamples = allSamples.filter((s) => s.bad);
  const badRatio = badSamples.length / allSamples.length;
  const evidence = badSamples.slice(0, 10).map((s) => `${s.file}:${s.line} empty or unhandled catch/except block`);
  if (badRatio >= 0.5) {
    return makeResult("FAIL", badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%)`,
      ...evidence
    ]);
  }
  if (badRatio >= 0.1) {
    return makeResult("WARN", badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%) \u2014 mixed patterns`,
      ...evidence
    ]);
  }
  return makeResult("PASS", allSamples.length - badSamples.length, [
    `${allSamples.length - badSamples.length}/${allSamples.length} catch/except blocks are properly handled`
  ]);
}
var DETECTORS = {
  2704: detectErrorHandling,
  // SBP-06 error-handling consistency
  2705: detectLockfiles,
  // SBP-07 dependency lockfiles
  2706: detectExceptClauseDefect
  // SBP-06 sibling: Python-2 except-clause syntax
};
export {
  DETECTORS,
  detectErrorHandling,
  detectExceptClauseDefect,
  detectLockfiles
};
