/**
 * api_specs.ts — content-based OpenAPI/Swagger/AsyncAPI spec discovery.
 *
 * Filename conventions vary by team — observed in the wild: a contract-first
 * repo whose root spec is `swagger/api.yaml` (+ 64 per-resource path files),
 * invisible to a basename allow-list like `openapi.yaml`/`swagger.json`, so
 * DOC-03 told an OpenAPI-first project to "add an OpenAPI spec". What IS
 * standard is the document itself: every OpenAPI 3.x document must carry a
 * top-level `openapi:` version field, Swagger 2.0 a `swagger: "2.0"` field,
 * AsyncAPI an `asyncapi:` field. Detect that, not the file name.
 *
 * Cost control: only files whose repo-relative path hints at an API contract
 * (api/swagger/openapi/asyncapi/contract — which subsumes all the well-known
 * basenames) are sniffed, capped, and only the head of each file is examined
 * (the version key is top-level, so it appears early).
 */
import { relative } from 'node:path';
import { iterFiles, readTextSafe } from './_base.ts';

const CANDIDATE_GLOBS = ['*.yaml', '*.yml', '*.json'];

/** Path (including basename) must hint at an API contract to be sniffed. */
const PATH_HINT_RX = /api|swagger|openapi|asyncapi|contract/i;

/** Sniff at most this many hinted candidates (defensive cap for huge repos). */
const MAX_SNIFF = 200;

/** The version key is top-level, so it must appear near the head. */
const HEAD_CHARS = 4096;

// YAML: top-level key at column 0 with a version-ish value (`openapi: 3.0.3`,
// `swagger: "2.0"`). JSON: the same key/value pair anywhere in the head.
const YAML_SPEC_RX = /^(?:openapi|swagger|asyncapi):\s*["']?\d/m;
const JSON_SPEC_RX = /"(?:openapi|swagger|asyncapi)"\s*:\s*"\d/;

/** True when the file's head carries a spec version marker. */
function isSpecContent(path: string): boolean {
  const text = readTextSafe(path);
  if (text === null) return false;
  const head = text.slice(0, HEAD_CHARS);
  return path.endsWith('.json')
    ? JSON_SPEC_RX.test(head)
    : YAML_SPEC_RX.test(head);
}

/**
 * Absolute paths of API spec documents under repoPath, found by content.
 * Shared by DOC-03 (API documentation) and topology's has_api flag so both
 * see the same spec universe.
 */
export function findApiSpecFiles(repoPath: string): string[] {
  const candidates = iterFiles(repoPath, CANDIDATE_GLOBS).filter((p) =>
    PATH_HINT_RX.test(relative(repoPath, p))
  );
  return candidates.slice(0, MAX_SNIFF).filter(isSpecContent);
}
