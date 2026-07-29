#!/usr/bin/env node

/**
 * AWOS - Agentic Workflow Operating System
 * Entry point that delegates to the refactored src structure
 */

const args = process.argv.slice(2);

// Subcommand routing
if (args[0] === 'overlay' && args[1] === 'validate') {
    require('./.awos-adapters/lib/cli/overlay-validate.js');
} else {
    const { main } = require('./src/index');
    main();
}
