'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Every test gets its own temp root so the file-backed stores and the queue
// never leak state between tests or into the repo.

function makeTempEnv(prefix = 'shiplog-test-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    ordersDir: path.join(root, 'orders'),
    trackingDir: path.join(root, 'tracking'),
    queueDir: path.join(root, 'queue'),
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { makeTempEnv };
