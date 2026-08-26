/**
 * helpers_orchestration.ts — shared fixtures and constants for the
 * orchestration-root suites.
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpDir } from './helpers.ts';

/**
 * check_ids that may be credited from an orchestration root.
 *
 * Excluded deliberately: ARCH-01 (measures the member's own code structure),
 * SDD-03 (the root's architecture document describes the platform, not the
 * member's stack), and SDD-04 (computed over per-work-tree git history, which
 * cannot be inherited at all).
 */
export const INHERITING_CHECK_IDS = new Set([
  'ADP-01',
  'ADP-02',
  'ADP-03',
  'ADP-04',
  'ADP-05',
  'ADP-06',
  'AI-02',
  'AI-03',
  'AI-04',
  'AI-05',
  'SDD-01',
  'SDD-02',
  'SDD-05',
  'SDD-06',
  'SDD-07',
  'DOC-07',
  'AIS-07',
  'PRV-07',
  'PRV-17',
]);

/**
 * A realistic orchestration-root fixture.
 *
 * The root carries the full agent-tooling and spec surface; the member
 * carries only source code and its own CLAUDE.md, mirroring the layout
 * reported in issue #172. Both are real git repos with one commit, because
 * the collectors run `git log` per work tree.
 */
const BODY =
  'Real content that clears the substantive-line bar.\nLine two.\nLine three.\nLine four.\nLine five.\nLine six.\nLine seven.\n';

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'README.md'), `# repo\n\n${BODY}`);
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@e.x', 'commit', '-qm', 'init'],
    { cwd: dir, stdio: 'ignore' }
  );
}

export function buildOrchestrationFixture(prefix: string): {
  root: string;
  member: string;
  cleanup: () => void;
} {
  const root = tmpDir(prefix);
  initRepo(root);

  // Agent tooling: instruction file, commands, skills, hooks, MCP config.
  writeFileSync(join(root, 'CLAUDE.md'), `# Root\n\n${BODY}`);
  mkdirSync(join(root, '.claude', 'commands'), { recursive: true });
  writeFileSync(
    join(root, '.claude', 'commands', 'ship.md'),
    `# Ship\n\n${BODY}`
  );
  mkdirSync(join(root, '.claude', 'skills', 'demo'), { recursive: true });
  writeFileSync(
    join(root, '.claude', 'skills', 'demo', 'SKILL.md'),
    `---\nname: demo\n---\n\n${BODY}`
  );
  mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
  writeFileSync(
    join(root, '.claude', 'hooks', 'guard.sh'),
    `#!/bin/sh\n# guards .env and secret files\necho guard\n${BODY.split('\n')
      .map((l) => `# ${l}`)
      .join('\n')}\n`
  );
  writeFileSync(
    join(root, '.claude', 'settings.json'),
    '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Read", "hooks": [] }\n    ]\n  }\n}\n'
  );
  writeFileSync(
    join(root, '.mcp.json'),
    '{\n  "mcpServers": {\n    "demo": {\n      "command": "demo",\n      "args": []\n    }\n  }\n}\n'
  );

  // AWOS spec workspace.
  mkdirSync(join(root, '.awos', 'commands'), { recursive: true });
  writeFileSync(
    join(root, '.awos', 'commands', 'spec.md'),
    `# Spec\n\n${BODY}`
  );
  mkdirSync(join(root, 'context', 'product'), { recursive: true });
  for (const f of ['product-definition.md', 'roadmap.md', 'architecture.md']) {
    writeFileSync(join(root, 'context', 'product', f), `# ${f}\n\n${BODY}`);
  }
  const spec = join(root, 'context', 'spec', '001-demo');
  mkdirSync(spec, { recursive: true });
  writeFileSync(
    join(spec, 'functional-spec.md'),
    `# Demo\n\nStatus: Completed\n\nImplemented in src/handler.ts.\n${BODY}`
  );
  writeFileSync(join(spec, 'technical-considerations.md'), `# Tech\n\n${BODY}`);
  writeFileSync(
    join(spec, 'tasks.md'),
    '# Tasks\n\n## Slice one\n\n  - [x] Build it **[Agent: backend-dev]**\n  - [x] Verify it **[Agent: testing-expert]**\n  - [x] Ship it **[Agent: backend-dev]**\n'
  );

  writeFileSync(join(root, '.gitignore'), 'services/\n');

  // Member: code only, plus its own instruction file.
  const member = join(root, 'services', 'api');
  initRepo(member);
  writeFileSync(join(member, 'CLAUDE.md'), `# API service\n\n${BODY}`);
  mkdirSync(join(member, 'src'), { recursive: true });
  writeFileSync(
    join(member, 'src', 'handler.ts'),
    '// Implements context/spec/001-demo\nexport const handler = (): null => null;\n'
  );

  return {
    root,
    member,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * Flatten an audit.json into check_id → status.
 *
 * `dimensions` is an array of DimensionArtifact (artifact_types.ts:447), each
 * with a `checks: Check[]` (:214) — not a map keyed by dimension name.
 */
export function statusByCheckId(auditJsonPath: string): Map<string, string> {
  const audit = JSON.parse(readFileSync(auditJsonPath, 'utf8')) as {
    dimensions?: Array<{
      checks?: Array<{ check_id: string; status: string }>;
    }>;
  };
  const out = new Map<string, string>();
  for (const dim of audit.dimensions ?? []) {
    for (const c of dim.checks ?? []) out.set(c.check_id, c.status);
  }
  return out;
}
