'use strict';

/**
 * Resource Resolver for the Company Resource Overlay.
 *
 * Discovers, validates, and resolves company-provided resources from
 * `.awos-company/manifest.json`. Provides schema validation, path existence
 * checks, and structured discovery results.
 *
 * Uses only `node:fs` and `node:path` — no external dependencies.
 *
 * @module lib/resource-resolver
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

/** Directory name for the company overlay registry. */
const OVERLAY_DIR = '.awos-company';

/** Manifest filename within the overlay directory. */
const MANIFEST_FILE = 'manifest.json';

/** Valid resource type values. */
const VALID_TYPES = ['skill', 'agent', 'mcp'];

/** Pattern for valid resource names: starts with lowercase alnum, then lowercase alnum + _ or - */
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Maximum length for resource name. */
const NAME_MAX_LENGTH = 128;

/** Maximum length for description. */
const DESCRIPTION_MAX_LENGTH = 256;

/** Maximum number of tags per resource. */
const TAGS_MAX_ITEMS = 20;

/** Maximum length for a single tag. */
const TAG_MAX_LENGTH = 64;

/** Pattern to detect path traversal segments. */
const PATH_TRAVERSAL_PATTERN = /(^|[/\\])\.\.[/\\]|^\.\.$|(^|[/\\])\.\.$/;

// ---------------------------------------------------------------------
// Manifest JSON Schema (as JS object for internal validation)
// ---------------------------------------------------------------------

/**
 * The manifest schema definition used for validation.
 * Mirrors the JSON Schema from the design document.
 */
const MANIFEST_SCHEMA = {
    type: 'object',
    required: ['resources'],
    additionalProperties: false,
    properties: {
        resources: {
            type: 'array',
            items: {
                type: 'object',
                required: ['name', 'type', 'path'],
                additionalProperties: false,
                properties: {
                    name: {
                        type: 'string',
                        minLength: 1,
                        maxLength: NAME_MAX_LENGTH,
                        pattern: NAME_PATTERN,
                    },
                    type: {
                        type: 'string',
                        enum: VALID_TYPES,
                    },
                    path: {
                        type: 'string',
                        minLength: 1,
                        noTraversal: true,
                    },
                    description: {
                        type: 'string',
                        maxLength: DESCRIPTION_MAX_LENGTH,
                    },
                    tags: {
                        type: 'array',
                        maxItems: TAGS_MAX_ITEMS,
                        items: {
                            type: 'string',
                            minLength: 1,
                            maxLength: TAG_MAX_LENGTH,
                        },
                    },
                },
            },
        },
    },
};

// ---------------------------------------------------------------------
// Schema Validation
// ---------------------------------------------------------------------

/**
 * Validate a parsed manifest object against the schema.
 * Returns an array of schema error objects with `path` and `message` fields.
 *
 * @param {*} manifest - The parsed JSON object to validate
 * @returns {Object[]} Array of { path: string, message: string }
 */
function validateSchema(manifest) {
    const errors = [];

    // Top-level must be an object
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
        errors.push({ path: '$', message: 'Manifest must be a JSON object' });
        return errors;
    }

    // Check for additional top-level properties
    const allowedTopLevel = ['resources'];
    for (const key of Object.keys(manifest)) {
        if (!allowedTopLevel.includes(key)) {
            errors.push({ path: `$.${key}`, message: `Unexpected property "${key}"` });
        }
    }

    // "resources" is required
    if (!Object.prototype.hasOwnProperty.call(manifest, 'resources')) {
        errors.push({ path: '$.resources', message: 'Required property "resources" is missing' });
        return errors;
    }

    // "resources" must be an array
    if (!Array.isArray(manifest.resources)) {
        errors.push({ path: '$.resources', message: '"resources" must be an array' });
        return errors;
    }

    // Validate each entry
    for (let i = 0; i < manifest.resources.length; i++) {
        const entry = manifest.resources[i];
        const basePath = `$.resources[${i}]`;

        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            errors.push({ path: basePath, message: 'Resource entry must be an object' });
            continue;
        }

        // Check for additional properties on entries
        const allowedEntryProps = ['name', 'type', 'path', 'description', 'tags'];
        for (const key of Object.keys(entry)) {
            if (!allowedEntryProps.includes(key)) {
                errors.push({ path: `${basePath}.${key}`, message: `Unexpected property "${key}"` });
            }
        }

        // Validate "name"
        validateName(entry, basePath, errors);

        // Validate "type"
        validateType(entry, basePath, errors);

        // Validate "path"
        validatePath(entry, basePath, errors);

        // Validate optional "description"
        validateDescription(entry, basePath, errors);

        // Validate optional "tags"
        validateTags(entry, basePath, errors);
    }

    return errors;
}

/**
 * Validate the "name" field of a resource entry.
 */
function validateName(entry, basePath, errors) {
    if (!Object.prototype.hasOwnProperty.call(entry, 'name')) {
        errors.push({ path: `${basePath}.name`, message: 'Required property "name" is missing' });
        return;
    }

    if (typeof entry.name !== 'string') {
        errors.push({ path: `${basePath}.name`, message: '"name" must be a string' });
        return;
    }

    if (entry.name.length < 1) {
        errors.push({ path: `${basePath}.name`, message: '"name" must not be empty' });
        return;
    }

    if (entry.name.length > NAME_MAX_LENGTH) {
        errors.push({
            path: `${basePath}.name`,
            message: `"name" must not exceed ${NAME_MAX_LENGTH} characters`,
        });
        return;
    }

    if (!NAME_PATTERN.test(entry.name)) {
        errors.push({
            path: `${basePath}.name`,
            message: '"name" must match pattern ^[a-z0-9][a-z0-9_-]*$',
        });
    }
}

/**
 * Validate the "type" field of a resource entry.
 */
function validateType(entry, basePath, errors) {
    if (!Object.prototype.hasOwnProperty.call(entry, 'type')) {
        errors.push({ path: `${basePath}.type`, message: 'Required property "type" is missing' });
        return;
    }

    if (typeof entry.type !== 'string') {
        errors.push({ path: `${basePath}.type`, message: '"type" must be a string' });
        return;
    }

    if (!VALID_TYPES.includes(entry.type)) {
        errors.push({
            path: `${basePath}.type`,
            message: `"type" must be one of: ${VALID_TYPES.join(', ')}`,
        });
    }
}

/**
 * Validate the "path" field of a resource entry.
 */
function validatePath(entry, basePath, errors) {
    if (!Object.prototype.hasOwnProperty.call(entry, 'path')) {
        errors.push({ path: `${basePath}.path`, message: 'Required property "path" is missing' });
        return;
    }

    if (typeof entry.path !== 'string') {
        errors.push({ path: `${basePath}.path`, message: '"path" must be a string' });
        return;
    }

    if (entry.path.length < 1) {
        errors.push({ path: `${basePath}.path`, message: '"path" must not be empty' });
        return;
    }

    if (PATH_TRAVERSAL_PATTERN.test(entry.path)) {
        errors.push({
            path: `${basePath}.path`,
            message: '"path" must not contain parent-directory traversal (..) segments',
        });
    }
}

/**
 * Validate the optional "description" field of a resource entry.
 */
function validateDescription(entry, basePath, errors) {
    if (!Object.prototype.hasOwnProperty.call(entry, 'description')) {
        return; // Optional field
    }

    if (typeof entry.description !== 'string') {
        errors.push({ path: `${basePath}.description`, message: '"description" must be a string' });
        return;
    }

    if (entry.description.length > DESCRIPTION_MAX_LENGTH) {
        errors.push({
            path: `${basePath}.description`,
            message: `"description" must not exceed ${DESCRIPTION_MAX_LENGTH} characters`,
        });
    }
}

/**
 * Validate the optional "tags" field of a resource entry.
 */
function validateTags(entry, basePath, errors) {
    if (!Object.prototype.hasOwnProperty.call(entry, 'tags')) {
        return; // Optional field
    }

    if (!Array.isArray(entry.tags)) {
        errors.push({ path: `${basePath}.tags`, message: '"tags" must be an array' });
        return;
    }

    if (entry.tags.length > TAGS_MAX_ITEMS) {
        errors.push({
            path: `${basePath}.tags`,
            message: `"tags" must not exceed ${TAGS_MAX_ITEMS} items`,
        });
        return;
    }

    for (let j = 0; j < entry.tags.length; j++) {
        const tag = entry.tags[j];

        if (typeof tag !== 'string') {
            errors.push({
                path: `${basePath}.tags[${j}]`,
                message: 'Each tag must be a string',
            });
            continue;
        }

        if (tag.length < 1) {
            errors.push({
                path: `${basePath}.tags[${j}]`,
                message: 'Tags must not be empty',
            });
            continue;
        }

        if (tag.length > TAG_MAX_LENGTH) {
            errors.push({
                path: `${basePath}.tags[${j}]`,
                message: `Tags must not exceed ${TAG_MAX_LENGTH} characters`,
            });
        }
    }
}

// ---------------------------------------------------------------------
// discover(projectRoot)
// ---------------------------------------------------------------------

/**
 * Discover company overlay resources from `.awos-company/manifest.json`.
 *
 * Logic:
 * 1. Check if `.awos-company/manifest.json` exists. If not, return empty result.
 * 2. Read and JSON-parse the manifest. If parse fails, return with error.
 * 3. Validate against schema. If schema errors, return with errors (skip discovery).
 * 4. For each valid entry, resolve path relative to `.awos-company/`.
 * 5. Check file existence. If missing, add warning and skip entry.
 * 6. Check for duplicate names — keep first occurrence, warn on duplicates.
 * 7. Return DiscoveryResult with resolved resources and accumulated warnings.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {DiscoveryResult}
 */
function discover(projectRoot) {
    const resources = [];
    const warnings = [];
    const errors = [];

    const overlayDir = path.join(projectRoot, OVERLAY_DIR);
    const manifestPath = path.join(overlayDir, MANIFEST_FILE);

    // 1. Check if manifest exists
    if (!fs.existsSync(manifestPath)) {
        return { resources, warnings, errors };
    }

    // 2. Read and parse JSON
    let manifest;
    try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        manifest = JSON.parse(raw);
    } catch (err) {
        errors.push(`Failed to parse ${MANIFEST_FILE}: ${err.message}`);
        return { resources, warnings, errors };
    }

    // 3. Validate schema
    const schemaErrors = validateSchema(manifest);
    if (schemaErrors.length > 0) {
        for (const schemaErr of schemaErrors) {
            errors.push(`Schema error at ${schemaErr.path}: ${schemaErr.message}`);
        }
        return { resources, warnings, errors };
    }

    // 4–7. Process valid entries
    const seenNames = new Map(); // name → index of first occurrence

    for (let i = 0; i < manifest.resources.length; i++) {
        const entry = manifest.resources[i];

        // 6. Check for duplicate names — keep first occurrence
        if (seenNames.has(entry.name)) {
            warnings.push(
                `Duplicate resource name "${entry.name}" at index ${i} — using first occurrence`
            );
            continue;
        }
        seenNames.set(entry.name, i);

        // 4. Resolve path relative to .awos-company/
        const absolutePath = path.resolve(overlayDir, entry.path);

        // 5. Check file existence
        if (!fs.existsSync(absolutePath)) {
            warnings.push(
                `Resource "${entry.name}" references missing path: ${entry.path}`
            );
            continue;
        }

        // Build resolved resource
        const resolved = {
            name: entry.name,
            type: entry.type,
            absolutePath,
            source: 'company',
        };

        if (entry.description !== undefined) {
            resolved.description = entry.description;
        }

        if (entry.tags !== undefined) {
            resolved.tags = entry.tags;
        }

        resources.push(resolved);
    }

    return { resources, warnings, errors };
}

// ---------------------------------------------------------------------
// validate(projectRoot)
// ---------------------------------------------------------------------

/**
 * Validate the company overlay manifest — schema checks + file path existence.
 *
 * Returns a ValidationResult with:
 * - valid: true if no schema errors and no path errors
 * - schemaErrors: array of { path, message } for schema violations
 * - pathErrors: array of { name, path } for missing file references
 * - resourceCount: number of valid resources (passing both checks)
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {ValidationResult}
 */
function validate(projectRoot) {
    const result = {
        valid: true,
        schemaErrors: [],
        pathErrors: [],
        resourceCount: 0,
    };

    const overlayDir = path.join(projectRoot, OVERLAY_DIR);
    const manifestPath = path.join(overlayDir, MANIFEST_FILE);

    // Check manifest exists
    if (!fs.existsSync(manifestPath)) {
        result.valid = false;
        result.schemaErrors.push({
            path: '$',
            message: `Manifest file not found: ${OVERLAY_DIR}/${MANIFEST_FILE}`,
        });
        return result;
    }

    // Read and parse
    let manifest;
    try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        manifest = JSON.parse(raw);
    } catch (err) {
        result.valid = false;
        result.schemaErrors.push({
            path: '$',
            message: `Failed to parse JSON: ${err.message}`,
        });
        return result;
    }

    // Schema validation
    const schemaErrors = validateSchema(manifest);
    if (schemaErrors.length > 0) {
        result.valid = false;
        result.schemaErrors = schemaErrors;
        return result;
    }

    // Path existence checks
    for (const entry of manifest.resources) {
        const absolutePath = path.resolve(overlayDir, entry.path);
        if (!fs.existsSync(absolutePath)) {
            result.pathErrors.push({
                name: entry.name,
                path: entry.path,
            });
        } else {
            result.resourceCount++;
        }
    }

    if (result.pathErrors.length > 0) {
        result.valid = false;
    }

    return result;
}

// ---------------------------------------------------------------------
// matchQuery(resources, query)
// ---------------------------------------------------------------------

/**
 * Match resources against a search query.
 *
 * Logic:
 * 1. Tokenize query by splitting on whitespace into terms.
 * 2. If query is empty or produces no terms, return empty array.
 * 3. For each resource, check:
 *    - Does `name` contain any term as a case-insensitive substring? → match
 *    - Does any entry in `tags` exactly match any term (case-insensitive)? → match
 * 4. Return all matching resources.
 *
 * Important: Tag matching is EXACT (tag must equal term, case-insensitive).
 *            Name matching is SUBSTRING (name must contain term, case-insensitive).
 *
 * @param {ResolvedResource[]} resources - Array of resolved resources
 * @param {string} query - The search query string
 * @returns {ResolvedResource[]} Resources matching at least one criterion
 */
function matchQuery(resources, query) {
    if (!query || typeof query !== 'string') {
        return [];
    }

    const terms = query.split(/\s+/).filter(t => t.length > 0);

    if (terms.length === 0) {
        return [];
    }

    const lowerTerms = terms.map(t => t.toLowerCase());

    return resources.filter(resource => {
        // Check name: case-insensitive substring match against any term
        const lowerName = resource.name.toLowerCase();
        for (const term of lowerTerms) {
            if (lowerName.includes(term)) {
                return true;
            }
        }

        // Check tags: case-insensitive exact match against any term
        if (Array.isArray(resource.tags)) {
            for (const tag of resource.tags) {
                const lowerTag = tag.toLowerCase();
                for (const term of lowerTerms) {
                    if (lowerTag === term) {
                        return true;
                    }
                }
            }
        }

        return false;
    });
}

// ---------------------------------------------------------------------
// mergeResults(upstream, overlay)
// ---------------------------------------------------------------------

/**
 * Merge upstream registry resources with overlay resources.
 *
 * The overlay wins on conflicts: any upstream resource whose (name, type) pair
 * matches an overlay resource is excluded. All overlay resources are always
 * included in the result.
 *
 * @param {ResolvedResource[]} upstream - Resources from the upstream registry (source: 'registry')
 * @param {ResolvedResource[]} overlay - Resources from the company overlay (source: 'company')
 * @returns {ResolvedResource[]} Merged array with overlay-wins semantics
 */
function mergeResults(upstream, overlay) {
    // 1. Build a Set of "name|type" keys from overlay resources
    const overlayKeys = new Set();
    for (const resource of overlay) {
        overlayKeys.add(`${resource.name}|${resource.type}`);
    }

    // 2. Filter upstream: exclude any entry whose name+type combo exists in overlay
    const filteredUpstream = upstream.filter((resource) => {
        const key = `${resource.name}|${resource.type}`;
        return !overlayKeys.has(key);
    });

    // 3. Concatenate remaining upstream with ALL overlay resources
    return [...filteredUpstream, ...overlay];
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

module.exports = {
    discover,
    validate,
    matchQuery,
    mergeResults,
    // Internal exports for testing
    validateSchema,
    MANIFEST_SCHEMA,
    OVERLAY_DIR,
    MANIFEST_FILE,
    NAME_PATTERN,
    VALID_TYPES,
};
