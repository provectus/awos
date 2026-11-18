'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueue } = require('../packages/shared/src/queue/in-memory-queue');
const { makeTempEnv } = require('./helpers/temp-env');

test('queue: jobs come out in publish order (FIFO)', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const queue = createQueue({ dir: env.queueDir });
  queue.publish('shipment.created', { n: 1 });
  queue.publish('shipment.status_updated', { n: 2 });
  queue.publish('shipment.status_updated', { n: 3 });

  const order = [queue.take(), queue.take(), queue.take()].map(
    (job) => job.payload.n
  );
  assert.deepEqual(
    order,
    [1, 2, 3],
    'the queue must deliver jobs in the order they were published'
  );
});

test('queue: take on an empty queue returns null, not an error', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const queue = createQueue({ dir: env.queueDir });
  assert.equal(
    queue.take(),
    null,
    'an empty queue must yield null so consumers can idle'
  );
});

test('queue: jobs survive a consumer restart (durability)', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const producer = createQueue({ dir: env.queueDir });
  producer.publish('shipment.created', { shipment: { id: 'shp_dur' } });

  const freshConsumer = createQueue({ dir: env.queueDir });
  const job = freshConsumer.take();
  assert.equal(
    job?.payload?.shipment?.id,
    'shp_dur',
    'a job published before a restart must still be deliverable from disk'
  );
});

test('queue: taking a job removes it (at-most-once file delivery)', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const queue = createQueue({ dir: env.queueDir });
  queue.publish('shipment.created', {});
  assert.equal(queue.size(), 1, 'size must reflect the one pending job');
  queue.take();
  assert.equal(
    queue.size(),
    0,
    'after take() the job file must be gone from the queue dir'
  );
});
