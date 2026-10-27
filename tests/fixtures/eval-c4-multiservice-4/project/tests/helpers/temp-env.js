'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Every test gets its own temp root so the file-backed stores and both
// queues never leak state between tests or into the repo.

function makeTempEnv(prefix = 'atlas-test-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    catalogDir: path.join(root, 'catalog'),
    ratesDir: path.join(root, 'rates'),
    promosDir: path.join(root, 'promos'),
    cartsDir: path.join(root, 'carts'),
    ordersDir: path.join(root, 'orders'),
    ledgerDir: path.join(root, 'ledger'),
    paymentsDir: path.join(root, 'payments'),
    stockDir: path.join(root, 'stock'),
    commandsDir: path.join(root, 'commands'),
    eventsDir: path.join(root, 'events'),
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { makeTempEnv };
