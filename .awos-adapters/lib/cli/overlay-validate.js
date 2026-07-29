#!/usr/bin/env node
'use strict';

const { validate } = require('../resource-resolver');

function main() {
    const projectRoot = process.cwd();
    const result = validate(projectRoot);

    if (result.schemaErrors.length > 0) {
        for (const err of result.schemaErrors) {
            process.stderr.write(`Schema error at ${err.path}: ${err.message}\n`);
        }
    }

    if (result.pathErrors.length > 0) {
        for (const err of result.pathErrors) {
            process.stderr.write(`Missing path: ${err.name} \u2192 ${err.path}\n`);
        }
    }

    if (result.schemaErrors.length === 0 && result.pathErrors.length === 0) {
        process.stdout.write(`\u2713 ${result.resourceCount} resources validated successfully\n`);
        process.exit(0);
    } else {
        process.exit(1);
    }
}

main();
