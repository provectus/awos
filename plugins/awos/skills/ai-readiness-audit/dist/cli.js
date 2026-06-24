#!/usr/bin/env node

// plugins/awos/skills/ai-readiness-audit/collectors/git.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

// plugins/awos/skills/ai-readiness-audit/collectors/_base.ts
function makeArtifact(source, available, reasonIfAbsent, period, raw) {
  return {
    source,
    available: Boolean(available),
    reason_if_absent: reasonIfAbsent,
    period: {
      bucket_days: period.bucket_days,
      lookback_days: period.lookback_days,
      history_available_days: period.history_available_days
    },
    raw
  };
}

// plugins/awos/skills/ai-readiness-audit/collectors/git.ts
function run(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
  } catch {
    return "";
  }
}
function parseDate(s) {
  return new Date(s.trim());
}
function daysBetween(d1, d2) {
  return Math.round((d2.getTime() - d1.getTime()) / 864e5);
}
function getDefaultBranch(cwd) {
  const out = run(["symbolic-ref", "--short", "HEAD"], cwd).trim();
  return out || "main";
}
function getTotalCommits(cwd) {
  const out = run(["rev-list", "--count", "HEAD"], cwd).trim();
  const n = parseInt(out, 10);
  return isNaN(n) ? 0 : n;
}
function getAiMarkedCommits(cwd) {
  const patterns = [
    "Co-authored-by: Claude",
    "Co-authored-by:.*[Aa]ssistant",
    "Co-authored-by:.*claude@anthropic"
  ];
  const matchedSHAs = /* @__PURE__ */ new Set();
  for (const pat of patterns) {
    const out = run(
      [
        "log",
        "--all-match",
        "--regexp-ignore-case",
        `--grep=${pat}`,
        "--format=%H"
      ],
      cwd
    );
    for (const sha of out.trim().split("\n").filter(Boolean)) {
      matchedSHAs.add(sha);
    }
  }
  return matchedSHAs.size;
}
var TOOLING_CANDIDATES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".claude/skills",
  ".claude/commands",
  ".claude/hooks",
  ".mcp.json"
];
function getToolingPaths(repoPath) {
  return TOOLING_CANDIDATES.filter((p) => existsSync(join(repoPath, p)));
}
function getMergeStats(cwd) {
  const allMerges = run(
    ["log", "--first-parent", "--merges", "--format=%H"],
    cwd
  ).trim().split("\n").filter(Boolean);
  const total_merges = allMerges.length;
  const revertOut = run(
    [
      "log",
      "--first-parent",
      "--merges",
      "--grep=^Revert\\|hotfix\\|rollback",
      "--format=%H"
    ],
    cwd
  ).trim().split("\n").filter(Boolean);
  const revert_merges = revertOut.length;
  return { total_merges, revert_merges };
}
function getMergeRecords(cwd) {
  const mergeOut = run(
    ["log", "--first-parent", "--merges", "--format=%H %cI"],
    cwd
  ).trim().split("\n").filter(Boolean);
  const records = [];
  for (const line of mergeOut) {
    const [sha, mergedAt] = line.split(" ");
    if (!sha || !mergedAt) continue;
    const sideOut = run(["log", "--format=%cI", `${sha}^1..${sha}^2`], cwd).trim().split("\n").filter(Boolean);
    if (sideOut.length === 0) continue;
    const dates = sideOut.map((d) => new Date(d)).filter((d) => !isNaN(d.getTime()));
    if (dates.length === 0) continue;
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    records.push({
      merged_at: mergedAt,
      branch_first_commit_at: earliest.toISOString()
    });
  }
  return records;
}
function buildMonthlyBuckets(cwd, period) {
  const latestDateStr = run(
    ["log", "--all", "--format=%cI", "--max-count=1"],
    cwd
  ).trim();
  if (!latestDateStr) return [];
  const latestCommitDate = parseDate(latestDateStr);
  if (isNaN(latestCommitDate.getTime())) return [];
  const lookback = period.lookback_days;
  const since = new Date(
    latestCommitDate.getTime() - lookback * 864e5
  ).toISOString();
  const logOut = run(
    ["log", "--all", `--since=${since}`, "--format=%H	%aN	%cI	%P"],
    cwd
  ).trim().split("\n").filter(Boolean);
  if (logOut.length === 0) return [];
  const rows = [];
  for (const line of logOut) {
    const parts = line.split("	");
    const [sha, author, dateStr, parents = ""] = parts;
    if (!sha || !author || !dateStr) continue;
    const date = parseDate(dateStr);
    if (isNaN(date.getTime())) continue;
    rows.push({
      sha,
      author,
      date,
      isMerge: parents.trim().split(" ").length > 1
    });
  }
  if (rows.length === 0) return [];
  const newest = new Date(Math.max(...rows.map((r) => r.date.getTime())));
  const oldest = new Date(Math.min(...rows.map((r) => r.date.getTime())));
  const bucketMs = period.bucket_days * 864e5;
  const buckets = [];
  let bucketEnd = newest;
  while (bucketEnd >= oldest) {
    const bucketStart = new Date(bucketEnd.getTime() - bucketMs);
    const inBucket = rows.filter(
      (r) => r.date > bucketStart && r.date <= bucketEnd
    );
    if (inBucket.length > 0) {
      const authors = new Set(inBucket.map((r) => r.author)).size;
      buckets.push({
        bucket_start: bucketStart.toISOString(),
        authors,
        commits: inBucket.length,
        merges: inBucket.filter((r) => r.isMerge).length
      });
    }
    bucketEnd = bucketStart;
  }
  return buckets.reverse();
}
function getNumstatTotals(cwd) {
  const out = run(["log", "--numstat", "--format="], cwd);
  let added = 0;
  let deleted = 0;
  for (const line of out.split("\n")) {
    const m = line.match(/^(\d+)\s+(\d+)\s+/);
    if (m) {
      added += parseInt(m[1], 10);
      deleted += parseInt(m[2], 10);
    }
  }
  return { added, deleted };
}
function getHistoryAvailableDays(cwd) {
  const allDates = run(["log", "--all", "--format=%cI"], cwd).trim().split("\n").filter(Boolean).map((s) => parseDate(s)).filter((d) => !isNaN(d.getTime()));
  if (allDates.length < 2) return 0;
  const ts = allDates.map((d) => d.getTime());
  const earliest = new Date(Math.min(...ts));
  const latest = new Date(Math.max(...ts));
  return Math.max(0, daysBetween(earliest, latest));
}
function collect(repoPath, period) {
  const default_branch = getDefaultBranch(repoPath);
  const total_commits = getTotalCommits(repoPath);
  const ai_marked_commits = getAiMarkedCommits(repoPath);
  const tooling_paths = getToolingPaths(repoPath);
  const { total_merges, revert_merges } = getMergeStats(repoPath);
  const merge_records = getMergeRecords(repoPath);
  const monthly_buckets = buildMonthlyBuckets(repoPath, period);
  const numstat_totals = getNumstatTotals(repoPath);
  const history_available_days = getHistoryAvailableDays(repoPath);
  const raw = {
    default_branch,
    total_commits,
    ai_marked_commits,
    total_merges,
    revert_merges,
    tooling_paths,
    merge_records,
    monthly_buckets,
    numstat_totals
  };
  return makeArtifact(
    "git",
    true,
    null,
    { ...period, history_available_days },
    raw
  );
}

// plugins/awos/skills/ai-readiness-audit/collectors/ci.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";
var CI_CONFIG_CANDIDATES = [
  ".github/workflows",
  ".gitlab-ci.yml",
  "Jenkinsfile"
];
function detectCiConfig(repoPath) {
  for (const candidate of CI_CONFIG_CANDIDATES) {
    if (existsSync2(join2(repoPath, candidate))) {
      return candidate;
    }
  }
  return null;
}
function collect2(repoPath, period, connector) {
  const configPath = detectCiConfig(repoPath);
  const hasConfig = configPath !== null;
  const hasConnector = connector !== void 0 && connector !== null;
  if (!hasConfig && !hasConnector) {
    return makeArtifact(
      "ci",
      false,
      "no CI config (.github/workflows, .gitlab-ci.yml, Jenkinsfile) or connector found",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const runs = connector?.runs ?? [];
  const raw = {
    config_detected: hasConfig,
    config_path: configPath,
    runs
  };
  return makeArtifact("ci", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/collectors/tracker.ts
function buildTypeCounts(tickets) {
  const counts = {};
  for (const t of tickets) {
    const key = (t.type ?? "unknown").toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
function countResolved(tickets) {
  return tickets.filter(
    (t) => t.status?.toLowerCase() === "done" || t.resolved_at != null
  ).length;
}
function collect3(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "tracker",
      false,
      "no tracker connector provided; supply a Jira/Linear/GitHub Issues connector to enable work-mix and throughput metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const tickets = connector.tickets ?? [];
  const incident_source = connector.incident_source ?? null;
  const raw = {
    tickets,
    type_counts: buildTypeCounts(tickets),
    resolved_count: countResolved(tickets),
    incident_source
  };
  return makeArtifact("tracker", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/collectors/docs.ts
function countRecentlyUpdated(pages, lookbackDays) {
  const cutoff = new Date(Date.now() - lookbackDays * 864e5);
  return pages.filter((p) => {
    if (!p.updated_at) return false;
    const d = new Date(p.updated_at);
    return !isNaN(d.getTime()) && d >= cutoff;
  }).length;
}
function collect4(_repoPath, period, connector) {
  if (connector === void 0 || connector === null) {
    return makeArtifact(
      "docs",
      false,
      "no docs connector provided; supply a Confluence/Notion/GitBook connector to enable documentation coverage metrics",
      { ...period, history_available_days: period.history_available_days },
      {}
    );
  }
  const pages = connector.pages ?? [];
  const recently_updated_count = countRecentlyUpdated(
    pages,
    period.lookback_days
  );
  const raw = {
    pages,
    page_count: pages.length,
    recently_updated_count
  };
  return makeArtifact("docs", true, null, period, raw);
}

// plugins/awos/skills/ai-readiness-audit/detectors/_base.ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { execFileSync as execFileSync2 } from "node:child_process";
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
  const out = execFileSync2(
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
var PY2_EXCEPT = /except\s+[A-Za-z_][\w.]*(\s*,\s*[A-Za-z_][\w.]*)+\s*:/;
function detectExceptClauseDefect(repoPath, _params) {
  const hits = grep(repoPath, PY2_EXCEPT, ["**/*.py"]);
  const realHits = hits.filter((h) => !/^\s*#/.test(h.text));
  if (realHits.length) {
    const ev = realHits.map((h) => `${h.file}:${h.line} ${h.text}`);
    return makeResult("FAIL", realHits.length, ev);
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
  "*.kt"
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

// plugins/awos/skills/ai-readiness-audit/cli.ts
var COLLECTORS = {
  git: collect,
  ci: collect2,
  tracker: collect3,
  docs: collect4
};
var DETECTORS2 = {
  ...DETECTORS
  // ...FOO_DETECTORS,  // ← template for future modules
};
var DEFAULT_PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0
};
function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
function main() {
  const [, , command, arg1, arg2] = process.argv;
  if (!command) {
    printJson({
      error: "no command given",
      usage: "collect|detect|metric <arg> <repoPath>"
    });
    process.exit(1);
  }
  switch (command) {
    case "collect": {
      const source = arg1;
      const repoPath = arg2;
      if (!source || !repoPath) {
        printJson({ error: "collect requires <source> and <repoPath>" });
        process.exit(1);
      }
      const fn = COLLECTORS[source];
      if (!fn) {
        printJson({
          error: `unknown collector source "${source}"`,
          known: Object.keys(COLLECTORS)
        });
        process.exit(1);
      }
      printJson(fn(repoPath, DEFAULT_PERIOD));
      break;
    }
    case "detect": {
      const codeStr = arg1;
      const repoPath = arg2;
      if (!codeStr || !repoPath) {
        printJson({ error: "detect requires <code> and <repoPath>" });
        process.exit(1);
      }
      const code = Number(codeStr);
      if (!Number.isInteger(code)) {
        printJson({
          error: `detector code must be an integer, got "${codeStr}"`
        });
        process.exit(1);
      }
      const fn = DETECTORS2[code];
      if (!fn) {
        printJson({
          error: `unknown detector code ${code}`,
          known: Object.keys(DETECTORS2).map(Number).sort((a, b) => a - b)
        });
        process.exit(1);
      }
      printJson(fn(repoPath));
      break;
    }
    case "metric": {
      const id = arg1;
      printJson({
        error: `unknown metric "${id ?? "(none)"}"`,
        status: "ERROR",
        note: "metric modules are not yet implemented; they will be wired here when they land"
      });
      process.exit(1);
    }
    default: {
      printJson({
        error: `unknown command "${command}"`,
        usage: "collect|detect|metric <arg> <repoPath>"
      });
      process.exit(1);
    }
  }
}
main();
