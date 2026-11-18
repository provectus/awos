'use strict';

// The payments gateway: deterministic authorization bands per currency,
// journaled actions, capture validated against the authorization on file.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPaymentsGateway,
} = require('../services/payments-gateway/src/service');
const {
  BANDS,
} = require('../services/payments-gateway/src/rules/decline-bands');
const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../packages/messaging/src/queues/event-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { silentLogger } = require('./helpers/world');

function build(env) {
  const gateway = createPaymentsGateway({
    paymentsDir: env.paymentsDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const commands = createCommandQueue({ dir: env.commandsDir });
  const events = createEventQueue({ dir: env.eventsDir });
  return { gateway, commands, events };
}

test('an amount at or under the soft ceiling authorizes in full and is journaled', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { gateway, commands, events } = build(env);

  commands.publish({
    target: 'payments-gateway',
    command: 'authorize-payment',
    payload: {
      orderId: 'ord_1',
      attemptId: 'att_1',
      amount: BANDS.USD.softCeiling,
      currency: 'USD',
    },
  });
  await gateway.drain();

  const authorized = events
    .peekAll()
    .filter((e) => e.event === 'payment.authorized');
  assert.equal(authorized.length, 1, 'the authorization must be announced');
  assert.equal(
    authorized[0].payload.amount,
    BANDS.USD.softCeiling,
    'the full requested amount must be authorized at the ceiling'
  );
  assert.deepEqual(
    gateway.journal.listByType('ord_1', 'authorization').length,
    1,
    'the journal must carry exactly one authorization entry'
  );
});

test('an amount between the bands declines with over_band; above the hard band with suspected_fraud', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { gateway, commands, events } = build(env);

  commands.publish({
    target: 'payments-gateway',
    command: 'authorize-payment',
    payload: {
      orderId: 'ord_2',
      attemptId: 'att_1',
      amount: BANDS.EUR.softCeiling + 1,
      currency: 'EUR',
    },
  });
  commands.publish({
    target: 'payments-gateway',
    command: 'authorize-payment',
    payload: {
      orderId: 'ord_3',
      attemptId: 'att_1',
      amount: BANDS.EUR.hardCeiling + 1,
      currency: 'EUR',
    },
  });
  await gateway.drain();

  const declined = events
    .peekAll()
    .filter((e) => e.event === 'payment.declined');
  assert.equal(declined.length, 2, 'both declines must be announced');
  assert.equal(
    declined[0].payload.code,
    'over_band',
    'between the bands the decline code must be over_band'
  );
  assert.equal(
    declined[1].payload.code,
    'suspected_fraud',
    'above the hard band the decline code must be suspected_fraud'
  );
});

test('capture against an authorization journals a capture entry and announces it', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { gateway, commands, events } = build(env);

  commands.publish({
    target: 'payments-gateway',
    command: 'authorize-payment',
    payload: {
      orderId: 'ord_4',
      attemptId: 'att_1',
      amount: 5000,
      currency: 'USD',
    },
  });
  commands.publish({
    target: 'payments-gateway',
    command: 'capture-payment',
    payload: {
      orderId: 'ord_4',
      attemptId: 'att_1',
      amount: 5000,
      currency: 'USD',
    },
  });
  await gateway.drain();

  assert.equal(
    gateway.journal.listByType('ord_4', 'capture').length,
    1,
    'the journal must carry exactly one capture entry'
  );
  const captured = events
    .peekAll()
    .filter((e) => e.event === 'payment.captured');
  assert.equal(captured.length, 1, 'the capture must be announced once');
  assert.equal(
    captured[0].payload.amount,
    5000,
    'the captured amount must equal the instructed amount'
  );
});

test('capture without an authorization on file fails loudly', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { gateway, commands } = build(env);
  commands.publish({
    target: 'payments-gateway',
    command: 'capture-payment',
    payload: {
      orderId: 'ord_ghost',
      attemptId: 'att_1',
      amount: 100,
      currency: 'USD',
    },
  });
  await assert.rejects(
    () => gateway.drain(),
    /no authorization on file/,
    'capturing with nothing authorized must be an error'
  );
});

test('a redelivered authorize-payment re-announces the recorded outcome without journaling twice', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { gateway, commands, events } = build(env);

  const payload = {
    orderId: 'ord_5',
    attemptId: 'att_1',
    amount: 100,
    currency: 'USD',
  };
  commands.publish({
    target: 'payments-gateway',
    command: 'authorize-payment',
    payload,
  });
  await gateway.drain();
  commands.publish({
    target: 'payments-gateway',
    command: 'authorize-payment',
    payload,
  });
  await gateway.drain();

  assert.equal(
    gateway.journal.listByType('ord_5', 'authorization').length,
    1,
    'the duplicate authorize must not journal a second authorization'
  );
  assert.equal(
    events.peekAll().filter((e) => e.event === 'payment.authorized').length,
    2,
    'the duplicate must re-announce the recorded outcome'
  );
});
