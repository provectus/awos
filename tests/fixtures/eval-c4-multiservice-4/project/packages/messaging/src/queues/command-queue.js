'use strict';

// Durable file-backed FIFO command queue: each command is one JSON file in
// the commands directory. Commands are IMPERATIVE and ADDRESSED: every
// envelope carries a `target` naming the consuming service, and take(target)
// only removes the oldest command addressed to that target, leaving commands
// for other services in place. Taking a command removes its file, so
// delivery is at-most-once per file; handlers are expected to be idempotent.

const fs = require('node:fs');
const path = require('node:path');
const { commandId } = require('../ids');
const { nowIso } = require('../clock');
const { assertCommandFields } = require('../envelope');
const {
  writeJsonAtomic,
  readJson,
  orderedName,
  listOrdered,
} = require('./queue-file');

function createCommandQueue({ dir }) {
  if (!dir) {
    throw new Error('createCommandQueue requires a dir to persist commands');
  }
  fs.mkdirSync(dir, { recursive: true });
  let seq = 0;

  function publish({ target, command, payload }) {
    assertCommandFields({ target, command });
    seq += 1;
    const envelope = {
      id: commandId(),
      kind: 'command',
      target,
      command,
      payload,
      sentAt: nowIso(),
    };
    writeJsonAtomic(
      path.join(dir, orderedName('cmd', seq, envelope.id)),
      envelope
    );
    return envelope;
  }

  function take(target) {
    if (typeof target !== 'string' || target === '') {
      throw new Error('commandQueue.take requires the consuming target name');
    }
    for (const name of listOrdered(dir, 'cmd')) {
      const file = path.join(dir, name);
      const envelope = readJson(file);
      if (envelope.target !== target) continue;
      fs.rmSync(file);
      return envelope;
    }
    return null;
  }

  function peekAll() {
    return listOrdered(dir, 'cmd').map((name) =>
      readJson(path.join(dir, name))
    );
  }

  function size(target) {
    const all = peekAll();
    if (!target) return all.length;
    return all.filter((envelope) => envelope.target === target).length;
  }

  return { publish, take, peekAll, size, dir };
}

module.exports = { createCommandQueue };
