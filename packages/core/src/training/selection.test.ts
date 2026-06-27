import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IntervalId } from '../theory/intervals.js';
import type { AttemptRecord } from '../progress/types.js';
import { selectNextInterval } from './selection.js';
import type { Rng } from './types.js';

/** Deterministic RNG so the weighted-selection bias is reproducible. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function record(intervalId: IntervalId, correct: boolean): AttemptRecord {
  return {
    at: new Date().toISOString(),
    mode: 'ear',
    intervalId,
    chosenIntervalId: correct ? intervalId : 'm2',
    correct,
    responseMs: 1000,
  };
}

test('a consistently-wrong interval is chosen more often than a consistently-right one', () => {
  const pool: IntervalId[] = ['P5', 'M3'];
  const records: AttemptRecord[] = [];
  for (let i = 0; i < 20; i++) {
    records.push(record('P5', true)); // always right
    records.push(record('M3', false)); // always wrong
  }
  const rng = mulberry32(7);
  const counts = { P5: 0, M3: 0 };
  for (let i = 0; i < 4000; i++) {
    counts[selectNextInterval(pool, records, rng) as 'P5' | 'M3'] += 1;
  }
  assert.ok(counts.M3 > counts.P5, `expected M3 (${counts.M3}) > P5 (${counts.P5})`);
});

test('an unseen interval gets picked', () => {
  const pool: IntervalId[] = ['P5', 'M3'];
  // Only P5 has history; M3 is unseen and should still be selectable.
  const records: AttemptRecord[] = Array.from({ length: 30 }, () => record('P5', true));
  const rng = mulberry32(11);
  let pickedM3 = false;
  for (let i = 0; i < 2000 && !pickedM3; i++) {
    if (selectNextInterval(pool, records, rng) === 'M3') pickedM3 = true;
  }
  assert.ok(pickedM3, 'unseen interval was never picked');
});

test('a single-item pool returns that item', () => {
  assert.equal(selectNextInterval(['TT'], [], mulberry32(1)), 'TT');
  assert.equal(selectNextInterval(['TT'], [record('TT', true)], mulberry32(2)), 'TT');
});

test('empty records falls back to a valid pick from the pool', () => {
  const pool: IntervalId[] = ['m3', 'P5', 'P8'];
  const rng = mulberry32(3);
  for (let i = 0; i < 100; i++) {
    assert.ok(pool.includes(selectNextInterval(pool, [], rng)));
  }
});

test('opts.mode filters the records used for weighting', () => {
  const pool: IntervalId[] = ['P5', 'M3'];
  // Both intervals are seen in both modes, but with opposite outcomes per mode:
  //   ear:  P5 wrong, M3 right   →  filtering to 'ear' should bias toward P5
  //   sing: P5 right, M3 wrong
  const records: AttemptRecord[] = [];
  for (let i = 0; i < 20; i++) {
    records.push({ ...record('P5', false), mode: 'ear' });
    records.push({ ...record('M3', true), mode: 'ear' });
    records.push({ ...record('P5', true), mode: 'sing' });
    records.push({ ...record('M3', false), mode: 'sing' });
  }
  const rng = mulberry32(99);
  const counts = { P5: 0, M3: 0 };
  for (let i = 0; i < 4000; i++) {
    counts[selectNextInterval(pool, records, rng, { mode: 'ear' }) as 'P5' | 'M3'] += 1;
  }
  assert.ok(counts.P5 > counts.M3, `expected P5 (${counts.P5}) > M3 (${counts.M3})`);
});
