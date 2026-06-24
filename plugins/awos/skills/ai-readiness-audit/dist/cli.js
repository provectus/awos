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

// plugins/awos/skills/ai-readiness-audit/detectors/code_architecture.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { basename as basename2, dirname, relative as relative3 } from "node:path";
import { execFileSync as execFileSync3 } from "node:child_process";
var ARCH_DOC_PATTERNS = [
  "ARCHITECTURE.md",
  "ARCHITECTURE.rst",
  "architecture.md",
  "architecture.rst"
];
var LAYERED_DIRS = [
  "routes",
  "controllers",
  "handlers",
  "services",
  "repositories",
  "models",
  "domain",
  "infra",
  "infrastructure",
  "application",
  "api",
  "lib",
  "core",
  "adapters",
  "ports",
  "usecases"
];
function detectArchPattern(repoPath, _params) {
  const archDocs = iterFiles(repoPath, ARCH_DOC_PATTERNS);
  if (archDocs.length > 0) {
    const found = archDocs.map((p) => relative3(repoPath, p));
    return makeResult("PASS", archDocs.length, [
      `architecture documentation found: ${found.join(", ")}`
    ]);
  }
  let out;
  try {
    out = execFileSync3(
      "find",
      [repoPath, "-maxdepth", "3", "-type", "d", "-print"],
      { encoding: "utf8" }
    );
  } catch {
    out = "";
  }
  const dirs = out.split("\n").filter(Boolean).map((d) => basename2(d).toLowerCase());
  const layeredMatches = LAYERED_DIRS.filter((layer) => dirs.includes(layer));
  if (layeredMatches.length >= 3) {
    return makeResult("WARN", layeredMatches.length, [
      `recognizable layered directory structure detected (${layeredMatches.length} canonical dirs: ${layeredMatches.join(", ")}) but no explicit architecture document`
    ]);
  }
  return makeResult("FAIL", 0, [
    "no architecture documentation or recognizable layered directory structure found"
  ]);
}
var LAYER_TIERS = {
  models: 0,
  model: 0,
  domain: 0,
  entities: 0,
  entity: 0,
  repositories: 1,
  repository: 1,
  repos: 1,
  repo: 1,
  services: 2,
  service: 2,
  usecases: 2,
  usecase: 2,
  controllers: 3,
  controller: 3,
  handlers: 4,
  handler: 4,
  routes: 5,
  route: 5,
  api: 5
};
var IMPORT_RX = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+([^\s]+)\s+import)/;
var SOURCE_GLOBS2 = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py"];
function getLayerTier(dir) {
  const lower = dir.toLowerCase();
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower === key) return tier;
  }
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower.startsWith(key)) return tier;
  }
  return void 0;
}
function detectImportGraph(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS2);
  if (files.length === 0) {
    return makeResult("PASS", 0, [
      "no source files found \u2014 no import violations possible"
    ]);
  }
  const violations = [];
  for (const filePath of files) {
    const relPath = relative3(repoPath, filePath);
    const fileDir = basename2(dirname(relPath)).toLowerCase();
    const sourceTier = getLayerTier(fileDir);
    if (sourceTier === void 0) continue;
    let src;
    try {
      src = readFileSync3(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = IMPORT_RX.exec(line);
      if (!m) continue;
      const importPath = (m[1] || m[2] || m[3] || "").trim();
      if (!importPath) continue;
      const parts = importPath.replace(/^(?:\.\.\/)+/, "").replace(/^\.\//, "").split("/");
      const targetDir = parts[0].toLowerCase();
      const targetTier = getLayerTier(targetDir);
      if (targetTier !== void 0 && targetTier > sourceTier) {
        violations.push({
          file: relPath,
          line: i + 1,
          importPath,
          sourceLayer: fileDir,
          targetLayer: targetDir
        });
      }
    }
  }
  if (violations.length === 0) {
    return makeResult("PASS", 0, ["no import layer violations detected"]);
  }
  const evidence = violations.slice(0, 10).map(
    (v) => `${v.file}:${v.line} layer violation: ${v.sourceLayer}/ imports from ${v.targetLayer}/ (${v.importPath})`
  );
  return makeResult("FAIL", violations.length, [
    `${violations.length} import layer violation(s) detected`,
    ...evidence
  ]);
}
var PRESENTATION_DIRS = [
  "routes",
  "route",
  "controllers",
  "controller",
  "handlers",
  "handler",
  "views",
  "view",
  "templates",
  "template",
  "pages",
  "page"
];
var DATA_ACCESS_RX = /\b(?:db|conn|cursor|session|repository|repo)\s*\.\s*(?:query|execute|find|findOne|findAll|filter|get|update|delete|insert|save|add|commit|remove|all|fetchone|fetchall|fetch_one|fetch_all|run)\s*\(/i;
var ORM_STATIC_RX = /\b\w+\s*\.\s*(?:objects\s*\.\s*(?:filter|get|all|exclude|create|update|delete)\s*\(|find(?:One|All|By\w+)\s*\()/i;
var RAW_SQL_RX = /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\s+\w+/i;
function countDataAccessCalls(content) {
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    if (/^\s*(?:#|\/\/|\/\*)/.test(line)) continue;
    if (DATA_ACCESS_RX.test(line) || ORM_STATIC_RX.test(line) || RAW_SQL_RX.test(line)) {
      count++;
    }
  }
  return count;
}
function detectSeparationOfConcerns(repoPath, _params) {
  const files = iterFiles(repoPath, SOURCE_GLOBS2);
  const presentationFiles = files.filter((f) => {
    const dir = basename2(dirname(relative3(repoPath, f))).toLowerCase();
    return PRESENTATION_DIRS.some((pd) => dir === pd || dir.startsWith(pd));
  });
  if (presentationFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no route/controller/handler files found \u2014 separation of concerns not checkable"
    ]);
  }
  const failFiles = [];
  const warnFiles = [];
  for (const filePath of presentationFiles) {
    const relPath = relative3(repoPath, filePath);
    let content;
    try {
      content = readFileSync3(filePath, "utf8");
    } catch {
      continue;
    }
    const count = countDataAccessCalls(content);
    if (count >= 3) {
      failFiles.push({ file: relPath, count });
    } else if (count >= 1) {
      warnFiles.push({ file: relPath, count });
    }
  }
  if (failFiles.length > 0) {
    const evidence = failFiles.map(
      (f) => `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult("FAIL", failFiles.length, [
      `${failFiles.length} presentation-layer file(s) have >= 3 inline data-access calls`,
      ...evidence
    ]);
  }
  if (warnFiles.length > 0) {
    const evidence = warnFiles.map(
      (f) => `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult("WARN", warnFiles.length, [
      `${warnFiles.length} presentation-layer file(s) have 1-2 inline data-access calls`,
      ...evidence
    ]);
  }
  return makeResult("PASS", presentationFiles.length, [
    `${presentationFiles.length} presentation-layer file(s) checked \u2014 no inline data-access calls found`
  ]);
}
function classifyName(name) {
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) return "snake_case";
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return "kebab-case";
  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) return "PascalCase";
  if (/^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$/.test(name)) return "camelCase";
  return "other";
}
var NAMING_SOURCE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb"
];
function detectNamingConventions(repoPath, _params) {
  const files = iterFiles(repoPath, NAMING_SOURCE_GLOBS);
  const relevantFiles = files.filter((f) => {
    const base = basename2(f).replace(/\.[^.]+$/, "");
    return !["index", "__init__", "main", "app", "setup", "config"].includes(
      base
    );
  });
  if (relevantFiles.length === 0) {
    return makeResult("PASS", 0, [
      "no source files found \u2014 naming convention check skipped"
    ]);
  }
  const counts = {
    snake_case: 0,
    "kebab-case": 0,
    camelCase: 0,
    PascalCase: 0,
    other: 0
  };
  for (const f of relevantFiles) {
    const base = basename2(f).replace(/\.[^.]+$/, "");
    counts[classifyName(base)]++;
  }
  const total = relevantFiles.length;
  const conventions = [
    "snake_case",
    "kebab-case",
    "camelCase",
    "PascalCase"
  ];
  const dominant = conventions.reduce(
    (best, c) => counts[c] > counts[best] ? c : best,
    conventions[0]
  );
  const dominantCount = counts[dominant];
  const ratio = dominantCount / total;
  const evidence = [
    `dominant convention: ${dominant} (${dominantCount}/${total} = ${Math.round(ratio * 100)}%)`,
    ...conventions.filter((c) => counts[c] > 0).map((c) => `  ${c}: ${counts[c]} file(s)`)
  ];
  if (ratio >= 0.9) {
    return makeResult("PASS", ratio, evidence);
  }
  if (ratio >= 0.7) {
    return makeResult("WARN", ratio, [
      `inconsistent file naming: dominant convention ${dominant} at ${Math.round(ratio * 100)}% (below 90% threshold)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", ratio, [
    `inconsistent file naming: dominant convention ${dominant} at only ${Math.round(ratio * 100)}% (below 70% threshold)`,
    ...evidence
  ]);
}
var FILE_SIZE_GLOBS = [
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.java",
  "*.kt",
  "*.go",
  "*.rb",
  "*.cs"
];
var LOC_THRESHOLD = 300;
function countLines(filePath) {
  try {
    const content = readFileSync3(filePath, "utf8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}
function detectFileSizes(repoPath, _params) {
  const files = iterFiles(repoPath, FILE_SIZE_GLOBS);
  if (files.length === 0) {
    return makeResult(
      "PASS",
      0,
      ["no source files found \u2014 file-size check skipped"],
      "computed"
    );
  }
  const oversized = [];
  for (const filePath of files) {
    const lines = countLines(filePath);
    if (lines > LOC_THRESHOLD) {
      oversized.push({ file: relative3(repoPath, filePath), lines });
    }
  }
  const total = files.length;
  const ratio = Math.round(oversized.length / total * 1e10) / 1e10;
  const evidence = [
    `${oversized.length}/${total} source files exceed ${LOC_THRESHOLD} lines`,
    ...oversized.slice(0, 10).map((f) => `${f.file}: ${f.lines} lines`)
  ];
  if (ratio > 0.3) {
    return makeResult(
      "FAIL",
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 30%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio > 0.1) {
    return makeResult(
      "WARN",
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 10%)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "PASS",
    ratio,
    [
      `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines \u2014 within threshold`,
      ...evidence
    ],
    "computed"
  );
}
var DETECTORS2 = {
  2100: detectArchPattern,
  // ARCH-01 declared/recognizable pattern
  2101: detectImportGraph,
  // ARCH-02 import direction / no tangled cross-imports
  // 2102 intentionally omitted — ARCH-03 is method=judgment
  2103: detectSeparationOfConcerns,
  // ARCH-04 separation of concerns
  2104: detectNamingConventions,
  // ARCH-05 consistent naming conventions
  2105: detectFileSizes
  // ARCH-06 file sizes (computed)
};

// plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development.ts
import { readFileSync as readFileSync4, existsSync as existsSync3, readdirSync, statSync } from "node:fs";
import { join as join4, relative as relative4 } from "node:path";
import { execFileSync as execFileSync4 } from "node:child_process";
function detectAwosInstalled(repoPath, _params) {
  const hasAwos = existsSync3(join4(repoPath, ".awos"));
  const hasContext = existsSync3(join4(repoPath, "context"));
  if (hasAwos && hasContext) {
    return makeResult("PASS", 2, [
      ".awos/ directory present \u2014 AWOS framework installed",
      "context/ directory present \u2014 spec workspace initialised"
    ]);
  }
  if (hasAwos) {
    return makeResult("WARN", 1, [
      ".awos/ directory present but context/ is missing \u2014 AWOS installed but workspace not initialised"
    ]);
  }
  if (hasContext) {
    return makeResult("WARN", 1, [
      "context/ directory present but .awos/ is missing \u2014 workspace exists but AWOS framework not installed"
    ]);
  }
  return makeResult("FAIL", 0, [
    "neither .awos/ nor context/ found \u2014 AWOS framework is not installed"
  ]);
}
var MIN_SUBSTANTIVE_LINES = 5;
function isSubstantive(filePath) {
  try {
    const content = readFileSync4(filePath, "utf8");
    const nonBlankLines = content.split("\n").filter((l) => l.trim().length > 0);
    return nonBlankLines.length > MIN_SUBSTANTIVE_LINES;
  } catch {
    return false;
  }
}
var FOUNDATIONAL_DOC_CANDIDATES = [
  ["context/product/product-definition.md"],
  ["context/product/roadmap.md"],
  ["context/architecture/architecture.md", "context/product/architecture.md"]
];
function detectProductContextDocs(repoPath, _params) {
  const found = [];
  const missing = [];
  for (const candidates of FOUNDATIONAL_DOC_CANDIDATES) {
    let matched = false;
    for (const candidate of candidates) {
      const fullPath = join4(repoPath, candidate);
      if (existsSync3(fullPath) && isSubstantive(fullPath)) {
        found.push(candidate);
        matched = true;
        break;
      }
    }
    if (!matched) {
      missing.push(candidates[0]);
    }
  }
  const count = found.length;
  const evidence = [
    ...found.map((f) => `present and substantive: ${f}`),
    ...missing.map((m) => `missing or trivial: ${m}`)
  ];
  if (count === 3) {
    return makeResult("PASS", count, [
      "all 3 foundational AWOS documents present with substantive content",
      ...evidence
    ]);
  }
  if (count === 2) {
    return makeResult("WARN", count, [
      "2 of 3 foundational AWOS documents present",
      ...evidence
    ]);
  }
  return makeResult("FAIL", count, [
    `only ${count} of 3 foundational AWOS documents present`,
    ...evidence
  ]);
}
var TECH_SIGNALS = [
  {
    name: "typescript",
    detect: (r) => iterFiles(r, ["*.ts", "*.tsx", "tsconfig.json"]).length > 0
  },
  {
    name: "python",
    detect: (r) => iterFiles(r, ["*.py"]).length > 0
  },
  {
    name: "django",
    detect: (r) => iterFiles(r, ["manage.py", "settings.py", "urls.py"]).length > 0
  },
  {
    name: "react",
    detect: (r) => iterFiles(r, ["*.tsx", "*.jsx"]).length > 0 || (() => {
      const pkg = join4(r, "package.json");
      if (!existsSync3(pkg)) return false;
      try {
        return readFileSync4(pkg, "utf8").includes('"react"');
      } catch {
        return false;
      }
    })()
  },
  {
    name: "node",
    detect: (r) => existsSync3(join4(r, "package.json")) || iterFiles(r, ["*.js"]).length > 0
  },
  {
    name: "javascript",
    detect: (r) => iterFiles(r, ["*.js", "*.jsx"]).length > 0
  },
  {
    name: "postgresql",
    detect: (r) => iterFiles(r, ["*.sql"]).length > 0 || (() => {
      try {
        const out = execFileSync4(
          "grep",
          [
            "-rl",
            "--include=*.py",
            "--include=*.ts",
            "--include=*.js",
            "psycopg2",
            r
          ],
          { encoding: "utf8" }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    })()
  },
  {
    name: "postgres",
    detect: (r) => iterFiles(r, ["*.sql"]).length > 0 || (() => {
      try {
        const out = execFileSync4(
          "grep",
          [
            "-rl",
            "--include=*.py",
            "--include=*.ts",
            "--include=*.js",
            "psycopg",
            r
          ],
          { encoding: "utf8" }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    })()
  },
  {
    name: "go",
    detect: (r) => iterFiles(r, ["*.go", "go.mod"]).length > 0
  },
  {
    name: "java",
    detect: (r) => iterFiles(r, ["*.java"]).length > 0
  },
  {
    name: "docker",
    detect: (r) => iterFiles(r, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"]).length > 0
  },
  {
    name: "terraform",
    detect: (r) => iterFiles(r, ["*.tf"]).length > 0
  },
  {
    name: "kubernetes",
    detect: (r) => {
      try {
        const out = execFileSync4(
          "grep",
          ["-rl", "--include=*.yaml", "--include=*.yml", "apiVersion:", r],
          { encoding: "utf8" }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    }
  }
];
function findArchDoc(repoPath) {
  for (const candidate of [
    join4(repoPath, "context", "architecture", "architecture.md"),
    join4(repoPath, "context", "product", "architecture.md"),
    join4(repoPath, "ARCHITECTURE.md")
  ]) {
    if (existsSync3(candidate)) return candidate;
  }
  return null;
}
function detectArchTechMatch(repoPath, _params) {
  const archDoc = findArchDoc(repoPath);
  if (!archDoc) {
    return makeResult("PASS", 0, [
      "no architecture document found \u2014 tech-match check skipped"
    ]);
  }
  let content;
  try {
    content = readFileSync4(archDoc, "utf8").toLowerCase();
  } catch {
    return makeResult("PASS", 0, ["could not read architecture document"]);
  }
  const unverified = [];
  const verified = [];
  for (const signal of TECH_SIGNALS) {
    if (!content.includes(signal.name.toLowerCase())) continue;
    if (signal.detect(repoPath)) {
      verified.push(signal.name);
    } else {
      unverified.push(signal.name);
    }
  }
  const evidence = [
    `architecture document: ${relative4(repoPath, archDoc)}`,
    ...verified.map((t) => `verified in codebase: ${t}`),
    ...unverified.map((t) => `mentioned but not evidenced in codebase: ${t}`)
  ];
  if (unverified.length >= 3) {
    return makeResult("FAIL", unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence
    ]);
  }
  if (unverified.length >= 1) {
    return makeResult("WARN", unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence
    ]);
  }
  return makeResult("PASS", 0, [
    "all technology mentions in architecture doc are evidenced in the codebase",
    ...evidence
  ]);
}
var TRUNK_BRANCHES = /* @__PURE__ */ new Set(["main", "master", "develop", "development"]);
function detectTrunk(repoPath) {
  for (const candidate of ["main", "master", "develop", "development"]) {
    try {
      execFileSync4("git", ["rev-parse", "--verify", candidate], {
        cwd: repoPath,
        encoding: "utf8"
      });
      return candidate;
    } catch {
    }
  }
  return "main";
}
function listLocalBranches(repoPath) {
  try {
    const out = execFileSync4("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    return out.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_BRANCHES.has(b));
  } catch {
    return [];
  }
}
function branchTouchedSpec(repoPath, branch, trunk) {
  try {
    const out = execFileSync4(
      "git",
      [
        "log",
        branch,
        "--not",
        trunk,
        "--name-only",
        "--format=",
        "--diff-filter=ACDMR"
      ],
      { cwd: repoPath, encoding: "utf8" }
    );
    return out.split("\n").some((line) => line.startsWith("context/spec/"));
  } catch {
    return false;
  }
}
function detectBranchSpecRatio(repoPath, _params) {
  const branches = listLocalBranches(repoPath);
  if (branches.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no feature branches found \u2014 branch\u2192spec ratio not computable"],
      "computed"
    );
  }
  const trunk = detectTrunk(repoPath);
  const specBranches = [];
  const plainBranches = [];
  for (const branch of branches) {
    if (branchTouchedSpec(repoPath, branch, trunk)) {
      specBranches.push(branch);
    } else {
      plainBranches.push(branch);
    }
  }
  const total = branches.length;
  const ratio = Math.round(specBranches.length / total * 1e10) / 1e10;
  const evidence = [
    `${specBranches.length}/${total} feature branches touched context/spec/ (ratio: ${Math.round(ratio * 100)}%)`,
    ...specBranches.slice(0, 10).map((b) => `spec branch: ${b}`),
    ...plainBranches.slice(0, 10).map((b) => `plain branch: ${b}`)
  ];
  if (ratio >= 0.7) {
    return makeResult(
      "PASS",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.4) {
    return makeResult(
      "WARN",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (below 70% threshold)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
      ...evidence
    ],
    "computed"
  );
}
var SPEC_TRIAD = [
  "functional-spec.md",
  "technical-considerations.md",
  "tasks.md"
];
function listSpecDirs(repoPath) {
  const specBase = join4(repoPath, "context", "spec");
  if (!existsSync3(specBase)) return [];
  try {
    return readdirSync(specBase).filter((name) => /^\d{3}-/.test(name)).sort().map((name) => join4(specBase, name)).filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
function detectSpecTriadComplete(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  if (specDirs.length === 0) {
    return makeResult("PASS", 0, [
      "no spec directories found \u2014 triad check skipped"
    ]);
  }
  const statuses = [];
  for (const dir of specDirs) {
    const present = SPEC_TRIAD.filter((f) => existsSync3(join4(dir, f)));
    const missing = SPEC_TRIAD.filter((f) => !existsSync3(join4(dir, f)));
    statuses.push({ dir: relative4(repoPath, dir), present, missing });
  }
  const empty = statuses.filter((s) => s.present.length === 0);
  const incomplete = statuses.filter(
    (s) => s.present.length > 0 && s.missing.length > 0
  );
  const complete = statuses.filter((s) => s.missing.length === 0);
  const evidence = [
    `${complete.length}/${specDirs.length} spec dirs have all 3 files`,
    ...incomplete.map(
      (s) => `incomplete: ${s.dir} \u2014 missing: ${s.missing.join(", ")}`
    ),
    ...empty.map((s) => `empty: ${s.dir} \u2014 has none of the 3 required files`)
  ];
  if (empty.length > 0) {
    return makeResult("FAIL", empty.length, [
      `${empty.length} spec dir(s) have none of the 3 required files`,
      ...evidence
    ]);
  }
  if (incomplete.length > 0) {
    return makeResult("WARN", incomplete.length, [
      `${incomplete.length} spec dir(s) are incomplete (have some but not all 3 files)`,
      ...evidence
    ]);
  }
  return makeResult("PASS", specDirs.length, [
    `all ${specDirs.length} spec dir(s) have the complete triad`,
    ...evidence
  ]);
}
var TASK_LINE_RX = /^\s*-\s*\[[ xX]\]/m;
var UNCHECKED_RX = /^\s*-\s*\[ \]/m;
function detectStaleSpecs(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  if (specDirs.length === 0) {
    return makeResult("PASS", 0, [
      "no spec directories found \u2014 stale-spec check skipped"
    ]);
  }
  const stale = [];
  const active = [];
  const done = [];
  for (const dir of specDirs) {
    const tasksPath = join4(dir, "tasks.md");
    if (!existsSync3(tasksPath)) continue;
    let content;
    try {
      content = readFileSync4(tasksPath, "utf8");
    } catch {
      continue;
    }
    const hasTasks = TASK_LINE_RX.test(content);
    if (!hasTasks) {
      stale.push(relative4(repoPath, dir));
    } else if (UNCHECKED_RX.test(content)) {
      active.push(relative4(repoPath, dir));
    } else {
      done.push(relative4(repoPath, dir));
    }
  }
  const evidence = [
    ...active.map((d) => `active (has open tasks): ${d}`),
    ...done.map((d) => `done (all tasks complete): ${d}`),
    ...stale.map((d) => `stale (tasks.md has no task items): ${d}`)
  ];
  if (stale.length === 0) {
    return makeResult("PASS", 0, ["no stale specs found", ...evidence]);
  }
  if (stale.length === 1) {
    return makeResult("WARN", stale.length, [
      `1 stale spec detected (tasks.md is an empty stub)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", stale.length, [
    `${stale.length} stale specs detected (tasks.md empty stubs)`,
    ...evidence
  ]);
}
var TASK_CHECKBOX_RX = /^\s*-\s*\[[ xX]\]/;
var AGENT_ANNOTATION_RX = /\*\*\[Agent:\s*[^\]]+\]\*\*/;
function detectAgentAnnotations(repoPath, _params) {
  const specDirs = listSpecDirs(repoPath);
  let totalTasks = 0;
  let annotatedTasks = 0;
  for (const dir of specDirs) {
    const tasksPath = join4(dir, "tasks.md");
    if (!existsSync3(tasksPath)) continue;
    let content;
    try {
      content = readFileSync4(tasksPath, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (TASK_CHECKBOX_RX.test(line)) {
        totalTasks++;
        if (AGENT_ANNOTATION_RX.test(line)) {
          annotatedTasks++;
        }
      }
    }
  }
  if (totalTasks === 0) {
    return makeResult("SKIP", null, [
      "no task checkbox lines found in any tasks.md \u2014 agent-annotation check skipped"
    ]);
  }
  const ratio = Math.round(annotatedTasks / totalTasks * 1e10) / 1e10;
  const evidence = [
    `${annotatedTasks}/${totalTasks} task lines have **[Agent: ...]** annotations (${Math.round(ratio * 100)}%)`
  ];
  if (ratio >= 0.7) {
    return makeResult("PASS", ratio, [
      `${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
      ...evidence
    ]);
  }
  if (ratio >= 0.4) {
    return makeResult("WARN", ratio, [
      `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (below 70%)`,
      ...evidence
    ]);
  }
  return makeResult("FAIL", ratio, [
    `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
    ...evidence
  ]);
}
var DETECTORS3 = {
  2800: detectAwosInstalled,
  // SDD-01 AWOS installed
  2801: detectProductContextDocs,
  // SDD-02 foundational product docs
  2802: detectArchTechMatch,
  // SDD-03 tech choices match codebase
  2803: detectBranchSpecRatio,
  // SDD-04 branch→spec ratio (computed)
  2804: detectSpecTriadComplete,
  // SDD-05 spec triad completeness
  2805: detectStaleSpecs,
  // SDD-06 no stale specs
  2806: detectAgentAnnotations
  // SDD-07 agent annotations in tasks.md
};

// plugins/awos/skills/ai-readiness-audit/detectors/ai_development_tooling.ts
import { existsSync as existsSync4, readFileSync as readFileSync5 } from "node:fs";
import { join as join5, relative as relative5 } from "node:path";
function detectCustomCommands(repoPath, _params) {
  const commandsDir = join5(repoPath, ".claude", "commands");
  if (!existsSync4(commandsDir)) {
    return makeResult("FAIL", 0, [
      "no .claude/commands/ directory found \u2014 no custom slash commands defined"
    ]);
  }
  const files = iterFiles(commandsDir, ["*.md"]);
  if (files.length > 0) {
    const names = files.map((p) => relative5(repoPath, p));
    return makeResult("PASS", files.length, [
      `${files.length} custom command file(s) found under .claude/commands/`,
      ...names.slice(0, 10).map((n) => `command: ${n}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no custom command files found in .claude/commands/ \u2014 define slash commands for common workflows"
  ]);
}
function detectClaudeSkills(repoPath, _params) {
  const skillsRoot = join5(repoPath, ".claude", "skills");
  if (!existsSync4(skillsRoot)) {
    return makeResult("FAIL", 0, [
      "no .claude/skills/ directory found \u2014 no Claude Code skills configured"
    ]);
  }
  const files = iterFiles(skillsRoot, ["SKILL.md"]);
  if (files.length > 0) {
    const names = files.map((p) => relative5(repoPath, p));
    return makeResult("PASS", files.length, [
      `${files.length} SKILL.md file(s) found under .claude/skills/`,
      ...names.slice(0, 10).map((n) => `skill: ${n}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no SKILL.md files found under .claude/skills/ \u2014 no Claude Code skills configured"
  ]);
}
var MCP_CONFIG_PATHS = [".mcp.json", ".claude/mcp.json"];
function detectMcpConfig(repoPath, _params) {
  const found = [];
  for (const relPath of MCP_CONFIG_PATHS) {
    if (existsSync4(join5(repoPath, relPath))) {
      found.push(relPath);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `MCP configuration found: ${found.join(", ")}`,
      ...found.map((f) => `MCP config: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no MCP configuration found (.mcp.json or .claude/mcp.json) \u2014 no MCP servers configured"
  ]);
}
function detectClaudeHooks(repoPath, _params) {
  const hooksDir = join5(repoPath, ".claude", "hooks");
  if (existsSync4(hooksDir)) {
    const hookFiles = iterFiles(hooksDir, [
      "*.sh",
      "*.js",
      "*.ts",
      "*.py",
      "*.bash"
    ]);
    if (hookFiles.length > 0) {
      const names = hookFiles.map((p) => relative5(repoPath, p));
      return makeResult("PASS", hookFiles.length, [
        `${hookFiles.length} hook file(s) found in .claude/hooks/`,
        ...names.slice(0, 10).map((n) => `hook file: ${n}`)
      ]);
    }
  }
  const settingsFiles = [
    join5(repoPath, ".claude", "settings.json"),
    join5(repoPath, ".claude", "settings.local.json")
  ];
  for (const settingsPath of settingsFiles) {
    if (!existsSync4(settingsPath)) continue;
    let content;
    try {
      content = readFileSync5(settingsPath, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (/"hooks"\s*:/.test(content)) {
        return makeResult("PASS", 1, [
          `"hooks" key found in ${relative5(repoPath, settingsPath)}`
        ]);
      }
      continue;
    }
    if (parsed !== null && typeof parsed === "object" && "hooks" in parsed) {
      return makeResult("PASS", 1, [
        `"hooks" key configured in ${relative5(repoPath, settingsPath)}`
      ]);
    }
  }
  return makeResult("FAIL", 0, [
    'no Claude Code hooks found \u2014 neither .claude/hooks/ files nor "hooks" key in settings'
  ]);
}
var ROOT_RUN_FILES = [
  "Makefile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "run.sh",
  "start.sh",
  "justfile",
  "Justfile",
  "Taskfile.yml",
  "Taskfile.yaml"
];
function hasPackageJsonRunScript(repoPath) {
  const pkgPath = join5(repoPath, "package.json");
  if (!existsSync4(pkgPath)) return false;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync5(pkgPath, "utf8"));
  } catch {
    return false;
  }
  if (pkg === null || typeof pkg !== "object") return false;
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== "object") return false;
  return "start" in scripts || "dev" in scripts;
}
function detectCanRunApp(repoPath, _params) {
  const found = [];
  for (const f of ROOT_RUN_FILES) {
    if (existsSync4(join5(repoPath, f))) {
      found.push(f);
    }
  }
  if (hasPackageJsonRunScript(repoPath)) {
    found.push("package.json (start/dev script)");
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `run mechanism(s) found: ${found.join(", ")}`,
      ...found.map((f) => `run signal: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no run mechanism found \u2014 no Makefile, docker-compose, or package.json start script; Claude Code cannot run the application without human involvement"
  ]);
}
var DETECTORS4 = {
  2001: detectCustomCommands,
  // AI-02 custom slash commands
  2002: detectClaudeSkills,
  // AI-03 Claude Code skills
  2003: detectMcpConfig,
  // AI-04 MCP server config
  2004: detectClaudeHooks,
  // AI-05 Claude Code hooks
  2006: detectCanRunApp
  // AI-07 agent can run/observe app
};

// plugins/awos/skills/ai-readiness-audit/detectors/end_to_end_delivery.ts
import { existsSync as existsSync5, readFileSync as readFileSync6, statSync as statSync2 } from "node:fs";
import { join as join6, relative as relative6 } from "node:path";
import { execFileSync as execFileSync5 } from "node:child_process";
var TRUNK_NAMES = /* @__PURE__ */ new Set(["main", "master", "develop", "development"]);
var LAYER_PATTERNS = [
  {
    name: "api/backend",
    patterns: /\/(api|backend|server|services?|routes?|controllers?|handlers?|endpoints?)\//i
  },
  {
    name: "frontend/ui",
    patterns: /\/(frontend|ui|web|client|app|pages?|components?|views?)\//i
  },
  {
    name: "database",
    patterns: /\/(db|database|migrations?|schemas?|sql|models?)\//i
  },
  {
    name: "infra",
    patterns: /\/(infra|infrastructure|terraform|k8s|kubernetes|helm|deploy)\//i
  }
];
function detectTrunk2(repoPath) {
  for (const candidate of ["main", "master", "develop", "development"]) {
    try {
      execFileSync5("git", ["rev-parse", "--verify", candidate], {
        cwd: repoPath,
        encoding: "utf8"
      });
      return candidate;
    } catch {
    }
  }
  return "main";
}
function listFeatureBranches(repoPath) {
  try {
    const out = execFileSync5("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    return out.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return [];
  }
}
function branchLayerCount(repoPath, branch, trunk) {
  let paths;
  try {
    const out = execFileSync5(
      "git",
      [
        "log",
        branch,
        "--not",
        trunk,
        "--name-only",
        "--format=",
        "--diff-filter=ACDMR"
      ],
      { cwd: repoPath, encoding: "utf8" }
    );
    paths = out.split("\n").filter(Boolean);
  } catch {
    return 0;
  }
  const layers = /* @__PURE__ */ new Set();
  for (const p of paths) {
    const withSlash = "/" + p;
    for (const { name, patterns } of LAYER_PATTERNS) {
      if (patterns.test(withSlash)) {
        layers.add(name);
        break;
      }
    }
  }
  return layers.size;
}
function detectVerticalDelivery(repoPath, _params) {
  const branches = listFeatureBranches(repoPath);
  if (branches.length === 0) {
    return makeResult(
      "SKIP",
      null,
      ["no feature branches found \u2014 vertical delivery ratio not computable"],
      "computed"
    );
  }
  const trunk = detectTrunk2(repoPath);
  const verticalBranches = [];
  const singleLayerBranches = [];
  for (const branch of branches) {
    const layerCount = branchLayerCount(repoPath, branch, trunk);
    if (layerCount >= 2) {
      verticalBranches.push(branch);
    } else {
      singleLayerBranches.push(branch);
    }
  }
  const total = branches.length;
  const ratio = Math.round(verticalBranches.length / total * 1e10) / 1e10;
  const evidence = [
    `${verticalBranches.length}/${total} feature branches touch \u2265 2 layers (ratio: ${Math.round(ratio * 100)}%)`,
    ...verticalBranches.slice(0, 10).map((b) => `vertical branch: ${b}`),
    ...singleLayerBranches.slice(0, 5).map((b) => `single-layer branch: ${b}`)
  ];
  if (ratio >= 0.5) {
    return makeResult(
      "PASS",
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
        ...evidence
      ],
      "computed"
    );
  }
  if (ratio >= 0.25) {
    return makeResult(
      "WARN",
      ratio,
      [
        `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (below 50%)`,
        ...evidence
      ],
      "computed"
    );
  }
  return makeResult(
    "FAIL",
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
      ...evidence
    ],
    "computed"
  );
}
var BACKEND_RX = /-backend$|[-_]api$|[-_]server$/i;
var FRONTEND_RX = /-frontend$|[-_]ui$|[-_]client$|[-_]web$/i;
function stripLayerSuffix(name) {
  return name.replace(
    /-backend$|-frontend$|[-_]api$|[-_]server$|[-_]ui$|[-_]client$|[-_]web$/i,
    ""
  ).toLowerCase();
}
function detectNoLayerSplit(repoPath, _params) {
  let branches;
  try {
    const out = execFileSync5("git", ["branch", "--format=%(refname:short)"], {
      cwd: repoPath,
      encoding: "utf8"
    });
    branches = out.split("\n").map((b) => b.trim()).filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return makeResult("SKIP", null, [
      "no git branches available \u2014 layer-split detection skipped"
    ]);
  }
  if (branches.length === 0) {
    return makeResult("SKIP", null, [
      "no feature branches found \u2014 layer-split detection skipped"
    ]);
  }
  const backendBranches = branches.filter((b) => BACKEND_RX.test(b));
  const frontendBranches = branches.filter((b) => FRONTEND_RX.test(b));
  const pairedRoots = [];
  for (const b of backendBranches) {
    const root = stripLayerSuffix(b);
    const hasFrontendPair = frontendBranches.some(
      (f) => stripLayerSuffix(f) === root
    );
    if (hasFrontendPair) {
      pairedRoots.push(root);
    }
  }
  if (pairedRoots.length === 0) {
    return makeResult("PASS", 0, [
      "no paired backend/frontend branch split patterns detected",
      `${branches.length} feature branch(es) inspected`
    ]);
  }
  const evidence = [
    `${pairedRoots.length} paired layer-split branch pattern(s) detected`,
    ...pairedRoots.slice(0, 10).map((r) => `split pattern root: ${r}`)
  ];
  if (pairedRoots.length >= 3) {
    return makeResult("FAIL", pairedRoots.length, [
      `${pairedRoots.length} feature(s) split into separate backend/frontend branches \u2014 vertical delivery anti-pattern`,
      ...evidence
    ]);
  }
  return makeResult("WARN", pairedRoots.length, [
    `${pairedRoots.length} feature(s) split into separate backend/frontend branches`,
    ...evidence
  ]);
}
var IMPL_PATH_RX = /\b(src|app|lib|packages?)\//i;
var SPEC_REF_RX = /context\/spec\/\d{3}-|(?<!\/)spec\/\d{3}-/;
function detectBidirectionalLinks(repoPath, _params) {
  const specBase = join6(repoPath, "context", "spec");
  if (!existsSync5(specBase)) {
    return makeResult("FAIL", 0, [
      "no context/spec/ directory found \u2014 spec\u2194impl bidirectional links not possible"
    ]);
  }
  let specFiles = [];
  try {
    specFiles = iterFiles(specBase, ["*.md"]);
  } catch {
    specFiles = [];
  }
  if (specFiles.length === 0) {
    return makeResult("FAIL", 0, [
      "no spec markdown files found \u2014 bidirectional links not detectable"
    ]);
  }
  let specRefsImpl = false;
  const specImplEvidence = [];
  for (const f of specFiles) {
    let content;
    try {
      content = readFileSync6(f, "utf8");
    } catch {
      continue;
    }
    if (IMPL_PATH_RX.test(content)) {
      specRefsImpl = true;
      specImplEvidence.push(`spec\u2192impl reference in: ${relative6(repoPath, f)}`);
      if (specImplEvidence.length >= 3) break;
    }
  }
  const SOURCE_GLOBS3 = [
    "*.ts",
    "*.tsx",
    "*.js",
    "*.jsx",
    "*.py",
    "*.go",
    "*.java",
    "*.kt"
  ];
  let implRefsSpec = false;
  const implSpecEvidence = [];
  let sourceFiles = [];
  try {
    sourceFiles = iterFiles(repoPath, SOURCE_GLOBS3);
  } catch {
    sourceFiles = [];
  }
  for (const f of sourceFiles) {
    let content;
    try {
      content = readFileSync6(f, "utf8");
    } catch {
      continue;
    }
    if (SPEC_REF_RX.test(content)) {
      implRefsSpec = true;
      implSpecEvidence.push(`impl\u2192spec reference in: ${relative6(repoPath, f)}`);
      if (implSpecEvidence.length >= 3) break;
    }
  }
  const evidence = [...specImplEvidence, ...implSpecEvidence];
  if (specRefsImpl && implRefsSpec) {
    return makeResult("PASS", 2, [
      "bidirectional spec\u2194impl cross-references detected",
      ...evidence
    ]);
  }
  if (specRefsImpl || implRefsSpec) {
    return makeResult("WARN", 1, [
      "only one direction of spec\u2194impl cross-references found",
      specRefsImpl ? "spec files reference implementation paths" : "no spec files reference implementation paths",
      implRefsSpec ? "implementation files reference spec directories" : "no implementation files reference spec directories",
      ...evidence
    ]);
  }
  return makeResult("FAIL", 0, [
    "no bidirectional spec\u2194impl cross-references found",
    `${specFiles.length} spec file(s) found but none reference implementation paths`,
    `${sourceFiles.length} source file(s) found but none reference context/spec/`
  ]);
}
var API_DIRS = [
  "api",
  "routes",
  "server",
  "backend",
  "controllers",
  "handlers",
  "endpoints"
];
var UI_DIRS = ["frontend", "ui", "web", "client"];
var DB_FILES_GLOBS = ["*.sql", "schema.prisma", "*.prisma"];
var DB_DIRS = ["migrations", "db", "database", "models"];
function hasAnyDir(repoPath, dirs) {
  for (const d of dirs) {
    if (existsSync5(join6(repoPath, d)) && statSync2(join6(repoPath, d)).isDirectory()) {
      return d;
    }
  }
  return null;
}
function detectLayerCoverage(repoPath, _params) {
  const apiDir = hasAnyDir(repoPath, API_DIRS);
  const hasApi = apiDir !== null;
  const uiDir = hasAnyDir(repoPath, UI_DIRS);
  let hasUi = uiDir !== null;
  let uiSignal = uiDir ? `directory: ${uiDir}/` : null;
  if (!hasUi) {
    let uiFiles = [];
    try {
      uiFiles = iterFiles(repoPath, ["*.tsx", "*.jsx"]);
    } catch {
      uiFiles = [];
    }
    if (uiFiles.length > 0) {
      hasUi = true;
      uiSignal = `${uiFiles.length} .tsx/.jsx file(s)`;
    }
  }
  const dbDir = hasAnyDir(repoPath, DB_DIRS);
  let hasDb = dbDir !== null;
  let dbSignal = dbDir ? `directory: ${dbDir}/` : null;
  if (!hasDb) {
    let dbFiles = [];
    try {
      dbFiles = iterFiles(repoPath, DB_FILES_GLOBS);
    } catch {
      dbFiles = [];
    }
    if (dbFiles.length > 0) {
      hasDb = true;
      dbSignal = `${dbFiles.length} schema/SQL file(s)`;
    }
  }
  const layerCount = [hasApi, hasUi, hasDb].filter(Boolean).length;
  if (layerCount < 2) {
    return makeResult("SKIP", layerCount, [
      "fewer than 2 distinct layers detected \u2014 single-layer project, E2E-04 not applicable",
      hasApi ? `API layer: ${apiDir}/` : "API layer: not detected",
      hasUi ? `UI layer: ${uiSignal}` : "UI layer: not detected",
      hasDb ? `DB layer: ${dbSignal}` : "DB layer: not detected"
    ]);
  }
  const evidence = [
    hasApi ? `API layer: ${apiDir}/` : "API layer: not detected",
    hasUi ? `UI layer: ${uiSignal}` : "UI layer: not detected",
    hasDb ? `DB layer: ${dbSignal}` : "DB layer: not detected"
  ];
  if (layerCount === 3) {
    return makeResult("PASS", layerCount, [
      "API, UI, and DB layers all detected \u2014 full vertical coverage",
      ...evidence
    ]);
  }
  return makeResult("WARN", layerCount, [
    `only ${layerCount} of 3 layers detected \u2014 partial vertical coverage`,
    ...evidence
  ]);
}
var ROOT_TOOLING_FILES = [
  "Makefile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Taskfile.yml",
  "Taskfile.yaml",
  "justfile",
  "Justfile",
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml"
];
var CI_DIRS = [".github/workflows", ".circleci", ".buildkite", ".drone"];
function detectCrossLayerTooling(repoPath, _params) {
  const found = [];
  for (const f of ROOT_TOOLING_FILES) {
    if (existsSync5(join6(repoPath, f))) {
      found.push(f);
    }
  }
  for (const ciDir of CI_DIRS) {
    const ciDirPath = join6(repoPath, ciDir);
    if (!existsSync5(ciDirPath)) continue;
    let ciFiles = [];
    try {
      ciFiles = iterFiles(ciDirPath, ["*.yml", "*.yaml"]);
    } catch {
      ciFiles = [];
    }
    if (ciFiles.length > 0) {
      found.push(`${ciDir}/ (${ciFiles.length} workflow file(s))`);
    }
  }
  if (found.length > 0) {
    return makeResult("PASS", found.length, [
      `cross-layer tooling found: ${found.join(", ")}`,
      ...found.map((f) => `tooling: ${f}`)
    ]);
  }
  return makeResult("FAIL", 0, [
    "no cross-layer tooling found \u2014 no Makefile, docker-compose, or shared CI config at repo root"
  ]);
}
var DETECTORS5 = {
  2300: detectVerticalDelivery,
  // E2E-01 vertical delivery (computed)
  2301: detectNoLayerSplit,
  // E2E-02 no paired layer-split branches
  2302: detectBidirectionalLinks,
  // E2E-03 spec↔impl bidirectional links
  2303: detectLayerCoverage,
  // E2E-04 API + UI + DB layer coverage
  2304: detectCrossLayerTooling
  // E2E-05 cross-layer unified tooling
};

// plugins/awos/skills/ai-readiness-audit/cli.ts
var COLLECTORS = {
  git: collect,
  ci: collect2,
  tracker: collect3,
  docs: collect4
};
var DETECTORS6 = {
  ...DETECTORS,
  ...DETECTORS2,
  ...DETECTORS3,
  ...DETECTORS4,
  ...DETECTORS5
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
      const fn = DETECTORS6[code];
      if (!fn) {
        printJson({
          error: `unknown detector code ${code}`,
          known: Object.keys(DETECTORS6).map(Number).sort((a, b) => a - b)
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
