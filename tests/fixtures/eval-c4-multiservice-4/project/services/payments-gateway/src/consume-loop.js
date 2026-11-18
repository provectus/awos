'use strict';

// Generic polling loop around a step function. step() handles at most one
// message and resolves true when it did; drain() steps until nothing is
// left; start()/stop() run drain on an interval for production.

function createConsumeLoop({ step, logger }) {
  async function drain() {
    let processed = 0;
    while (await step()) processed += 1;
    return processed;
  }

  let timer = null;
  function start({ pollMs = 250 } = {}) {
    timer = setInterval(() => {
      drain().catch((err) => logger.error(err));
    }, pollMs);
    return timer;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { drain, start, stop };
}

module.exports = { createConsumeLoop };
