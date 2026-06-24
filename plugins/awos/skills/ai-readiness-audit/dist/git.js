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
      ["log", "--all-match", "--regexp-ignore-case", `--grep=${pat}`, "--format=%H"],
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
  const allMerges = run(["log", "--first-parent", "--merges", "--format=%H"], cwd).trim().split("\n").filter(Boolean);
  const total_merges = allMerges.length;
  const revertOut = run(
    ["log", "--first-parent", "--merges", "--grep=^Revert\\|hotfix\\|rollback", "--format=%H"],
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
    const rangeOut = run(["log", "--format=%cI", `${sha}^2..${sha}^2`, "--first-parent"], cwd);
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
  const lookback = period.lookback_days;
  const since = new Date(Date.now() - lookback * 864e5).toISOString();
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
    rows.push({ sha, author, date, isMerge: parents.trim().split(" ").length > 1 });
  }
  if (rows.length === 0) return [];
  const newest = new Date(Math.max(...rows.map((r) => r.date.getTime())));
  const oldest = new Date(Math.min(...rows.map((r) => r.date.getTime())));
  const bucketMs = period.bucket_days * 864e5;
  const buckets = [];
  let bucketEnd = newest;
  while (bucketEnd >= oldest) {
    const bucketStart = new Date(bucketEnd.getTime() - bucketMs);
    const inBucket = rows.filter((r) => r.date > bucketStart && r.date <= bucketEnd);
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
  return makeArtifact("git", true, null, { ...period, history_available_days }, raw);
}
export {
  collect
};
