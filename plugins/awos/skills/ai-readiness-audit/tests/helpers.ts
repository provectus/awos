import { parse } from 'smol-toml';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadStandards(): any {
  return parse(
    readFileSync(join(SKILL, 'references', 'standards.toml'), 'utf8')
  );
}

export function writeCollected(
  tmpDir: string,
  source: string,
  raw: unknown,
  available = true
): string {
  const d = join(tmpDir, 'collected');
  mkdirSync(d, { recursive: true });
  const art = {
    source,
    available,
    reason_if_absent: null,
    period: { bucket_days: 30, lookback_days: 730, history_available_days: 0 },
    raw,
  };
  writeFileSync(join(d, `${source}.json`), JSON.stringify(art));
  return d;
}
