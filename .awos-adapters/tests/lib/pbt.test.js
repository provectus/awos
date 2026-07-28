'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { forAll, createRandom } = require('./pbt.js');

describe('PBT harness', () => {
    it('passes when property always holds', () => {
        forAll(
            'positive numbers are positive',
            (rng) => rng.int(1, 1000),
            (n) => n > 0,
            { iterations: 50 }
        );
    });

    it('throws on property failure', () => {
        assert.throws(
            () => {
                forAll(
                    'always false',
                    (rng) => rng.int(0, 100),
                    () => false,
                    { iterations: 10 }
                );
            },
            (err) => {
                assert.match(err.message, /Property "always false" failed/);
                assert.match(err.message, /seed:/);
                assert.match(err.message, /iteration/);
                return true;
            }
        );
    });

    it('throws on property exception', () => {
        assert.throws(
            () => {
                forAll(
                    'throws error',
                    (rng) => rng.int(0, 100),
                    () => {
                        throw new Error('boom');
                    },
                    { iterations: 5 }
                );
            },
            (err) => {
                assert.match(err.message, /Property "throws error" threw/);
                assert.match(err.message, /boom/);
                return true;
            }
        );
    });

    it('produces deterministic results with same seed', () => {
        const rng1 = createRandom(42);
        const rng2 = createRandom(42);
        for (let i = 0; i < 20; i++) {
            assert.equal(rng1.int(0, 1000), rng2.int(0, 1000));
        }
    });

    it('supports seed option for reproducibility', () => {
        const seed = 12345;

        const capture = () => {
            try {
                forAll(
                    'repro',
                    (rng) => rng.int(0, 1000),
                    (n) => n % 7 !== 0,
                    { iterations: 200, seed }
                );
            } catch (err) {
                return err.message;
            }
            return null;
        };

        const msg1 = capture();
        const msg2 = capture();
        assert.ok(msg1, 'should have failed');
        assert.equal(msg1, msg2);
    });

    it('performs basic shrinking on numbers', () => {
        let caughtErr = null;
        try {
            forAll(
                'shrink test',
                (rng) => rng.int(10, 1000),
                (n) => n < 5,
                { iterations: 200, seed: 999 }
            );
        } catch (err) {
            caughtErr = err;
        }
        assert.ok(caughtErr);
        const match = caughtErr.message.match(/Input: (\d+)/);
        assert.ok(match, 'should contain numeric input');
        const shrunkVal = parseInt(match[1], 10);
        assert.ok(shrunkVal < 1000, 'shrunk value should be smaller');
    });

    it('performs basic shrinking on strings', () => {
        let caughtErr = null;
        try {
            forAll(
                'string shrink',
                (rng) => 'a'.repeat(rng.int(5, 20)),
                (s) => s.length < 3,
                { iterations: 200, seed: 777 }
            );
        } catch (err) {
            caughtErr = err;
        }
        assert.ok(caughtErr);
        assert.match(caughtErr.message, /Property "string shrink" failed/);
    });

    it('rng.pick selects from array', () => {
        const rng = createRandom(99);
        const arr = ['a', 'b', 'c', 'd'];
        for (let i = 0; i < 20; i++) {
            assert.ok(arr.includes(rng.pick(arr)));
        }
    });

    it('respects iteration count option', () => {
        let count = 0;
        forAll(
            'counting',
            (rng) => rng.int(0, 100),
            () => {
                count++;
                return true;
            },
            { iterations: 37 }
        );
        assert.equal(count, 37);
    });
});
