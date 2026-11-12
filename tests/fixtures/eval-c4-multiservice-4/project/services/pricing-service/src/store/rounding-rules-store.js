'use strict';

// Per-currency rounding rules. Each record names the rounding mode a
// currency's amounts must be rounded with and lives beside the prices and
// conversion rates it governs. half-even is the only mode the platform
// implements today.

const { createJsonFileStore } = require('./json-file');

const DEFAULT_MODE = 'half-even';

function createRoundingRulesStore({ dir }) {
  if (!dir) throw new Error('createRoundingRulesStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'rounding' });

  function putRule({ currency, mode }) {
    if (mode !== DEFAULT_MODE) {
      throw new Error(`unsupported rounding mode: ${mode}`);
    }
    return files.write(currency, { currency, mode });
  }

  function getRule(currency) {
    return files.read(currency) || { currency, mode: DEFAULT_MODE };
  }

  return { putRule, getRule };
}

module.exports = { createRoundingRulesStore, DEFAULT_MODE };
