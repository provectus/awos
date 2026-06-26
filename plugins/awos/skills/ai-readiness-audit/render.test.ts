// render.test.ts — unit tests for the deterministic JSON → Markdown renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './render.ts';
import type { AuditJson } from './render.ts';

/** Minimal valid audit fixture — extend per test. */
function makeAudit(overrides: Partial<AuditJson> = {}): AuditJson {
  return {
    date: '2026-01-01',
    project: 'test-project',
    audit_total: 10,
    coverage: 0.5,
    dimensions: [],
    ...overrides,
  };
}

test('renderMarkdown includes Tech Stack section when tech_stack is present', () => {
  const audit = makeAudit({
    tech_stack: {
      languages: ['Python', 'TypeScript'],
      agent_tools: ['Claude Code'],
      ci: ['GitHub Actions'],
      frameworks: ['FastAPI'],
    },
  });
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Tech Stack'),
    'renderMarkdown must include a ## Tech Stack section when tech_stack is populated'
  );
  assert.ok(
    md.includes('FastAPI'),
    'Tech Stack section must list detected frameworks'
  );
  assert.ok(
    md.includes('Python'),
    'Tech Stack section must list detected languages'
  );
});

test('renderMarkdown omits Tech Stack section when tech_stack is absent', () => {
  const audit = makeAudit();
  const md = renderMarkdown(audit);
  assert.ok(
    !md.includes('## Tech Stack'),
    'renderMarkdown must not include Tech Stack when tech_stack is absent'
  );
});

test('renderMarkdown includes Linked Repositories section with a detected repo', () => {
  const audit = makeAudit({
    linked_repos: [
      { name: 'other-repo-x', kind: 'symlink', via: '.claude/skills/foo' },
    ],
  });
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Linked Repositories'),
    'renderMarkdown must include ## Linked Repositories section'
  );
  assert.ok(
    md.includes('other-repo-x'),
    'Linked Repositories section must list the detected repo name'
  );
});

test('renderMarkdown shows "None detected." for Linked Repositories when empty', () => {
  const audit = makeAudit({ linked_repos: [] });
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Linked Repositories'),
    'renderMarkdown must always include ## Linked Repositories section'
  );
  assert.ok(
    md.includes('None detected.'),
    'Linked Repositories section must say "None detected." when list is empty'
  );
});

test('renderMarkdown shows "None detected." when linked_repos is absent', () => {
  const audit = makeAudit();
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Linked Repositories'),
    'renderMarkdown must always render the Linked Repositories section'
  );
  assert.ok(
    md.includes('None detected.'),
    'Linked Repositories section must say "None detected." when absent from audit JSON'
  );
});
