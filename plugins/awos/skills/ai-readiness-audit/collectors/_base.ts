import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Period {
  bucket_days: number;
  lookback_days: number;
  history_available_days: number;
}

export function makeArtifact(
  source: string,
  available: boolean,
  reasonIfAbsent: string | null,
  period: Period,
  raw: unknown
) {
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

export function writeArtifact(
  artifact: { source: string },
  outDir: string
): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${artifact.source}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}
