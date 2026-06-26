import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedPath, GENERATED_GLOBS } from './generated.ts';

test('isGeneratedPath flags common generated/vendored artifacts', () => {
  for (const p of [
    'htmlcov/coverage_html_cb_dd2e7eb5.js',
    'app/proto/user_pb2.py',
    'app/proto/user_pb2_grpc.py',
    'src/schema.generated.ts',
    'src/__generated__/types.ts',
    'vendor/lib/x.go',
    'dist/bundle.js',
    'build/out.js',
    '.next/static/chunk.js',
    'node_modules/left-pad/index.js',
    'assets/app.min.js',
  ]) {
    assert.equal(isGeneratedPath(p), true, `expected generated: ${p}`);
  }
});

test('isGeneratedPath leaves hand-written source alone', () => {
  for (const p of ['src/app/main.py', 'internal/handler.go', 'lib/util.ts']) {
    assert.equal(isGeneratedPath(p), false, `expected source: ${p}`);
  }
  assert.ok(GENERATED_GLOBS.length > 0, 'GENERATED_GLOBS must be non-empty');
});
