'use strict';

// Despite the historical filename, this is a durable file-backed FIFO queue:
// each job is one JSON file in the queue directory, named so that a plain
// lexicographic sort yields publish order. Taking a job removes its file, so
// delivery is at-most-once per file; handlers are expected to be idempotent.

const fs = require('node:fs');
const path = require('node:path');
const { jobId } = require('../ids');
const { nowIso } = require('../clock');

function createQueue({ dir }) {
  if (!dir) {
    throw new Error('createQueue requires a dir to persist jobs in');
  }
  fs.mkdirSync(dir, { recursive: true });
  let seq = 0;

  function publish(type, payload) {
    if (typeof type !== 'string' || type === '') {
      throw new Error('queue.publish requires a non-empty job type');
    }
    seq += 1;
    const job = { id: jobId(), type, payload, publishedAt: nowIso() };
    const name = `${String(Date.now()).padStart(14, '0')}-${String(seq).padStart(6, '0')}-${job.id}.json`;
    const file = path.join(dir, name);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
    fs.renameSync(tmp, file);
    return job;
  }

  function take() {
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort();
    if (files.length === 0) return null;
    const file = path.join(dir, files[0]);
    const job = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.rmSync(file);
    return job;
  }

  function size() {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).length;
  }

  return { publish, take, size, dir };
}

module.exports = { createQueue };
