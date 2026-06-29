import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linterp, loginterp, bandScore, clamp01 } from './_score.ts';

// ---------------------------------------------------------------------------
// linterp
// ---------------------------------------------------------------------------

test('linterp: returns y0 at x=x0', () => {
  assert.equal(linterp(0, 0, 0, 10, 1), 0);
});

test('linterp: returns y1 at x=x1', () => {
  assert.equal(linterp(10, 0, 0, 10, 1), 1);
});

test('linterp: returns midpoint at x=(x0+x1)/2', () => {
  assert.ok(Math.abs(linterp(5, 0, 0, 10, 1) - 0.5) < 1e-10);
});

test('linterp: handles descending y (inverted)', () => {
  // x=0→y=1, x=100→y=0; at x=25 expect y=0.75
  assert.ok(Math.abs(linterp(25, 0, 1, 100, 0) - 0.75) < 1e-10);
});

test('linterp: returns y0 when x0===x1 (degenerate guard)', () => {
  assert.equal(linterp(5, 3, 0.7, 3, 0.2), 0.7);
});

test('linterp: does not clamp — extrapolates beyond range', () => {
  // At x=15 (beyond x1=10), output is 1.5, not clamped.
  assert.ok(Math.abs(linterp(15, 0, 0, 10, 1) - 1.5) < 1e-10);
});

// ---------------------------------------------------------------------------
// loginterp
// ---------------------------------------------------------------------------

test('loginterp: returns y0 at x=x0', () => {
  assert.ok(Math.abs(loginterp(1, 1, 0, 10, 1) - 0) < 1e-10);
});

test('loginterp: returns y1 at x=x1', () => {
  assert.ok(Math.abs(loginterp(10, 1, 0, 10, 1) - 1) < 1e-10);
});

test('loginterp: log midpoint (sqrt) maps to linear midpoint', () => {
  // log midpoint of [1, 100] is sqrt(100)=10 (= exp((log1+log100)/2))
  const mid = Math.sqrt(100); // 10
  assert.ok(Math.abs(loginterp(mid, 1, 0, 100, 1) - 0.5) < 1e-10);
});

test('loginterp: returns y0 when x<=0 (guard against log(0))', () => {
  assert.equal(loginterp(0, 1, 0.5, 10, 1), 0.5);
});

test('loginterp: returns y0 when x0<=0 (guard against log(0))', () => {
  assert.equal(loginterp(5, 0, 0.5, 10, 1), 0.5);
});

// ---------------------------------------------------------------------------
// bandScore
// ---------------------------------------------------------------------------

const LINEAR_ANCHORS = [
  { x: 0, y: 0 },
  { x: 50, y: 0.5 },
  { x: 100, y: 1.0 },
];

test('bandScore linear: clamps to y0 when x < first anchor', () => {
  assert.equal(bandScore(-10, LINEAR_ANCHORS, 'linear'), 0);
});

test('bandScore linear: returns y0 exactly at first anchor', () => {
  assert.equal(bandScore(0, LINEAR_ANCHORS, 'linear'), 0);
});

test('bandScore linear: returns y_last exactly at last anchor', () => {
  assert.equal(bandScore(100, LINEAR_ANCHORS, 'linear'), 1.0);
});

test('bandScore linear: clamps to y_last when x > last anchor', () => {
  assert.equal(bandScore(200, LINEAR_ANCHORS, 'linear'), 1.0);
});

test('bandScore linear: interpolates between first and second anchor', () => {
  // x=25 is midpoint of [0,50], so y = 0.25
  assert.ok(Math.abs(bandScore(25, LINEAR_ANCHORS, 'linear') - 0.25) < 1e-10);
});

test('bandScore linear: interpolates between second and third anchor', () => {
  // x=75 is midpoint of [50,100], so y = 0.75
  assert.ok(Math.abs(bandScore(75, LINEAR_ANCHORS, 'linear') - 0.75) < 1e-10);
});

test('bandScore: returns 0 for empty anchors', () => {
  assert.equal(bandScore(5, [], 'linear'), 0);
});

// Log-scale anchors matching deploy-frequency design
const DEPLOY_ANCHORS = [
  { x: 0.03, y: 0 },
  { x: 0.25, y: 0.1 },
  { x: 1.0, y: 0.5 },
  { x: 7.0, y: 1.0 },
];

test('bandScore log: clamps to 0 when x <= first anchor (0.03)', () => {
  assert.equal(bandScore(0.03, DEPLOY_ANCHORS, 'log'), 0);
});

test('bandScore log: returns 0.1 exactly at second anchor (0.25)', () => {
  assert.ok(
    Math.abs(bandScore(0.25, DEPLOY_ANCHORS, 'log') - 0.1) < 1e-10,
    `expected 0.1 at x=0.25, got ${bandScore(0.25, DEPLOY_ANCHORS, 'log')}`
  );
});

test('bandScore log: returns 0.5 exactly at third anchor (1.0)', () => {
  assert.ok(
    Math.abs(bandScore(1.0, DEPLOY_ANCHORS, 'log') - 0.5) < 1e-10,
    `expected 0.5 at x=1.0, got ${bandScore(1.0, DEPLOY_ANCHORS, 'log')}`
  );
});

test('bandScore log: clamps to 1.0 at and beyond last anchor (7.0)', () => {
  assert.equal(bandScore(7.0, DEPLOY_ANCHORS, 'log'), 1.0);
  assert.equal(bandScore(14, DEPLOY_ANCHORS, 'log'), 1.0);
});

// Lead-time anchors (descending y — lower hours is better)
const LEAD_TIME_ANCHORS = [
  { x: 1, y: 1.0 },
  { x: 24, y: 0.75 },
  { x: 168, y: 0.5 },
  { x: 720, y: 0.25 },
  { x: 2160, y: 0.0 },
];

test('bandScore log descending: returns 1.0 at first anchor (1h)', () => {
  assert.equal(bandScore(1, LEAD_TIME_ANCHORS, 'log'), 1.0);
});

test('bandScore log descending: returns 0.75 at second anchor (24h)', () => {
  assert.ok(
    Math.abs(bandScore(24, LEAD_TIME_ANCHORS, 'log') - 0.75) < 1e-10,
    `expected 0.75 at x=24, got ${bandScore(24, LEAD_TIME_ANCHORS, 'log')}`
  );
});

test('bandScore log descending: returns 0.5 at third anchor (168h)', () => {
  assert.ok(
    Math.abs(bandScore(168, LEAD_TIME_ANCHORS, 'log') - 0.5) < 1e-10,
    `expected 0.5 at x=168, got ${bandScore(168, LEAD_TIME_ANCHORS, 'log')}`
  );
});

test('bandScore log descending: returns 0.25 at fourth anchor (720h)', () => {
  assert.ok(
    Math.abs(bandScore(720, LEAD_TIME_ANCHORS, 'log') - 0.25) < 1e-10,
    `expected 0.25 at x=720, got ${bandScore(720, LEAD_TIME_ANCHORS, 'log')}`
  );
});

test('bandScore log descending: clamps to 0 at and beyond last anchor (2160h)', () => {
  assert.equal(bandScore(2160, LEAD_TIME_ANCHORS, 'log'), 0);
  assert.equal(bandScore(5000, LEAD_TIME_ANCHORS, 'log'), 0);
});

test('bandScore log descending: clamps to 1.0 below first anchor (< 1h)', () => {
  assert.equal(bandScore(0.5, LEAD_TIME_ANCHORS, 'log'), 1.0);
});

// ---------------------------------------------------------------------------
// clamp01
// ---------------------------------------------------------------------------

test('clamp01: values in [0,1] pass through unchanged', () => {
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(1), 1);
});

test('clamp01: values below 0 clamp to 0', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(-0.001), 0);
});

test('clamp01: values above 1 clamp to 1', () => {
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(1.001), 1);
});
