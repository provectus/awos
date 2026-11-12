'use strict';

// The two queues have different semantics: the command queue is addressed
// and destructive (one consumer per command), the event queue is an
// append-only log consumed independently by several services, each under its
// own cursor.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../packages/messaging/src/queues/event-queue');
const { makeTempEnv } = require('./helpers/temp-env');

test('command queue: take(target) removes only the oldest command addressed to that target', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createCommandQueue({ dir: env.commandsDir });

  queue.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: { n: 1 },
  });
  queue.publish({
    target: 'stock-service',
    command: 'reserve-stock',
    payload: { n: 2 },
  });
  queue.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: { n: 3 },
  });

  const first = queue.take('pricing-service');
  assert.equal(
    first.payload.n,
    1,
    'the oldest command for the target must come out first'
  );
  assert.equal(
    queue.size('stock-service'),
    1,
    'commands addressed to other services must stay queued'
  );
  assert.equal(
    queue.size('pricing-service'),
    1,
    'taking must remove exactly one command for the target'
  );
  assert.equal(
    queue.take('promotions-service'),
    null,
    'a target with no commands must get null, not someone else’s command'
  );
});

test('command queue: envelopes require a target and a command name', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createCommandQueue({ dir: env.commandsDir });
  assert.throws(
    () => queue.publish({ target: '', command: 'x', payload: {} }),
    /target/,
    'an unaddressed command must be refused at publish'
  );
  assert.throws(
    () => queue.publish({ target: 'x', command: '', payload: {} }),
    /command/,
    'a nameless command must be refused at publish'
  );
});

test('event queue: two consumers each see every event, in order, under their own cursor', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createEventQueue({ dir: env.eventsDir });

  queue.publish({ source: 'a', event: 'one', payload: { n: 1 } });
  queue.publish({ source: 'a', event: 'two', payload: { n: 2 } });

  const c1first = queue.takeFor('consumer-1');
  const c2first = queue.takeFor('consumer-2');
  assert.equal(
    c1first.event,
    'one',
    'consumer-1 must start at the beginning of the log'
  );
  assert.equal(
    c2first.event,
    'one',
    'consumer-2 must also start at the beginning: consumption does not remove events'
  );
  assert.equal(
    queue.takeFor('consumer-1').event,
    'two',
    'consumer-1 must advance to the next event under its own cursor'
  );
  assert.equal(
    queue.takeFor('consumer-1'),
    null,
    'a caught-up consumer must get null'
  );
  assert.equal(
    queue.pendingFor('consumer-2'),
    1,
    'consumer-2 still has one event pending under its own cursor'
  );
  assert.equal(queue.size(), 2, 'the log must retain all events');
});

test('event queue: events published after a consumer caught up are delivered next', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createEventQueue({ dir: env.eventsDir });

  queue.publish({ source: 'a', event: 'one', payload: {} });
  queue.takeFor('c');
  assert.equal(queue.takeFor('c'), null, 'consumer is caught up');
  queue.publish({ source: 'a', event: 'two', payload: {} });
  assert.equal(
    queue.takeFor('c').event,
    'two',
    'a newly published event must reach the caught-up consumer'
  );
});
