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
export {
  DEFAULT_IGNORE,
  VALID_STATUS,
  grep,
  iterFiles,
  makeResult
};
