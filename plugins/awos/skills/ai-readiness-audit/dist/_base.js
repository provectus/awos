// plugins/awos/skills/ai-readiness-audit/collectors/_base.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
function makeArtifact(source, available, reasonIfAbsent, period, raw) {
  return {
    source,
    available: Boolean(available),
    reason_if_absent: reasonIfAbsent,
    period: {
      bucket_days: period.bucket_days,
      lookback_days: period.lookback_days,
      history_available_days: period.history_available_days,
    },
    raw,
  };
}
function writeArtifact(artifact, outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${artifact.source}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}
export { makeArtifact, writeArtifact };
