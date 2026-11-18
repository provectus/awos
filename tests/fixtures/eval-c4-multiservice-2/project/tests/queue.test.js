'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { createFileQueue } = require('../packages/core/src/queue/file-queue');
const { makeTempEnv } = require('./helpers/temp-env');

test('file queue: jobs come back in publish order (FIFO)', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const queue = createFileQueue({ dir: env.queueDir });
  queue.publish('reading.accepted', { n: 1 });
  queue.publish('reading.accepted', { n: 2 });
  queue.publish('cycle.close', { n: 3 });

  assert.equal(
    queue.take().payload.n,
    1,
    'the first job taken must be the first published'
  );
  assert.equal(
    queue.take().payload.n,
    2,
    'the second job taken must be the second published'
  );
  assert.equal(
    queue.take().type,
    'cycle.close',
    'job type must survive the round trip through the queue directory'
  );
  assert.equal(queue.take(), null, 'an empty queue must yield null, not throw');
});

test('file queue: taking a job removes its file (at-most-once delivery)', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const queue = createFileQueue({ dir: env.queueDir });
  queue.publish('reading.accepted', { reading: { id: 'rdg_1' } });
  assert.equal(
    queue.size(),
    1,
    'publishing must materialize exactly one job file'
  );
  queue.take();
  assert.equal(
    queue.size(),
    0,
    'taking a job must delete its file so it is never delivered twice'
  );
  assert.equal(
    fs.readdirSync(env.queueDir).filter((n) => n.endsWith('.json')).length,
    0,
    'the queue directory must hold no job files after the take'
  );
});

test('file queue: a second queue handle on the same dir sees published jobs (cross-process contract)', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const publisher = createFileQueue({ dir: env.queueDir });
  const consumer = createFileQueue({ dir: env.queueDir });
  publisher.publish('meter.registered', { meter: { id: 'mtr_1' } });

  const job = consumer.take();
  assert.ok(
    job,
    'a consumer opened on the same queue directory must see jobs published by another handle'
  );
  assert.equal(
    job.payload.meter.id,
    'mtr_1',
    'the payload must survive serialization through the shared directory'
  );
});

test('file queue: publish requires a non-empty job type', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const queue = createFileQueue({ dir: env.queueDir });
  assert.throws(
    () => queue.publish('', {}),
    /non-empty job type/,
    'publishing with an empty type must be rejected before any file is written'
  );
});
