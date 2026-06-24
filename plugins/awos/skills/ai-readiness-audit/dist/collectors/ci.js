// plugins/awos/skills/ai-readiness-audit/collectors/ci.ts
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

// plugins/awos/skills/ai-readiness-audit/collectors/ci.ts
var CI_CONFIG_CANDIDATES = [
  ".github/workflows",
  ".gitlab-ci.yml",
  "Jenkinsfile"
];
function detectCiConfig(repoPath) {
  for (const candidate of CI_CONFIG_CANDIDATES) {
    if (existsSync(join(repoPath, candidate))) {
      return candidate;
    }
  }
  return null;
}
function collect(repoPath, period, connector) {
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
export {
  collect
};
