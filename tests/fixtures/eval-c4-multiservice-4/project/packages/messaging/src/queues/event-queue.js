'use strict';

// Durable file-backed event LOG: each event is one JSON file in the events
// directory, and events are never removed by consumption. Events are FACTS,
// not instructions: the envelope carries the emitting `source` and an
// `event` name, and SEVERAL services consume the same log independently.
// Each consumer tracks its own cursor (persisted alongside the log as
// cursor-<consumer>.json); takeFor(consumer) hands out the oldest event past
// that consumer's cursor and advances it. A crash between handling and
// cursor write re-delivers the event, so handlers must tolerate duplicates.

const fs = require('node:fs');
const path = require('node:path');
const { eventId } = require('../ids');
const { nowIso } = require('../clock');
const { assertEventFields } = require('../envelope');
const {
  writeJsonAtomic,
  readJson,
  orderedName,
  listOrdered,
} = require('./queue-file');

function createEventQueue({ dir }) {
  if (!dir) {
    throw new Error('createEventQueue requires a dir to persist events');
  }
  fs.mkdirSync(dir, { recursive: true });
  let seq = 0;

  function publish({ source, event, payload }) {
    assertEventFields({ source, event });
    seq += 1;
    const envelope = {
      id: eventId(),
      kind: 'event',
      source,
      event,
      payload,
      emittedAt: nowIso(),
    };
    writeJsonAtomic(
      path.join(dir, orderedName('evt', seq, envelope.id)),
      envelope
    );
    return envelope;
  }

  function cursorFile(consumer) {
    if (typeof consumer !== 'string' || consumer === '') {
      throw new Error('eventQueue requires a non-empty consumer name');
    }
    return path.join(dir, `cursor-${consumer}.json`);
  }

  function readCursor(consumer) {
    try {
      return readJson(cursorFile(consumer)).position;
    } catch (err) {
      if (err.code === 'ENOENT') return '';
      throw err;
    }
  }

  function takeFor(consumer) {
    const position = readCursor(consumer);
    for (const name of listOrdered(dir, 'evt')) {
      if (name <= position) continue;
      const envelope = readJson(path.join(dir, name));
      writeJsonAtomic(cursorFile(consumer), { consumer, position: name });
      return envelope;
    }
    return null;
  }

  function peekAll() {
    return listOrdered(dir, 'evt').map((name) =>
      readJson(path.join(dir, name))
    );
  }

  function size() {
    return listOrdered(dir, 'evt').length;
  }

  function pendingFor(consumer) {
    const position = readCursor(consumer);
    return listOrdered(dir, 'evt').filter((name) => name > position).length;
  }

  return { publish, takeFor, peekAll, size, pendingFor, dir };
}

module.exports = { createEventQueue };
