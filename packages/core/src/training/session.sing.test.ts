import assert from 'node:assert/strict';
import { test } from 'node:test';
import { midiToFrequency } from '../theory/notes.js';
import {
  DEFAULT_SING_CONFIG,
  generateSingQuestion,
  gradeSungPitch,
} from './session.js';
import type { Question, Rng } from './types.js';

/** Deterministic RNG so the generation invariants are reproducible. */
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

/** Shift a frequency by a number of cents. */
function centsAbove(hz: number, cents: number): number {
  return hz * 2 ** (cents / 1200);
}

/** A fixed P5-above-C4 question for grading tests (root C4=60, target G4=67). */
function p5Question(): Question {
  return {
    id: 'q_test',
    mode: 'sing',
    intervalId: 'P5',
    rootMidi: 60,
    direction: 'ascending',
    playbackStyle: 'melodic',
    targetMidi: 67,
  };
}

test('exact target Hz scores ~0 cents and is correct', () => {
  const q = p5Question();
  const detected = midiToFrequency(q.targetMidi);
  const result = gradeSungPitch(q, detected, 800, { toleranceCents: 50, octaveAgnostic: false });
  assert.ok(Math.abs(result.centsError) < 1e-6);
  assert.equal(result.answer.correct, true);
  assert.equal(result.answer.chosenIntervalId, 'P5');
});

test('+49 cents passes and +51 cents fails a 50-cent tolerance', () => {
  const q = p5Question();
  const target = midiToFrequency(q.targetMidi);

  const near = gradeSungPitch(q, centsAbove(target, 49), 800, { toleranceCents: 50, octaveAgnostic: false });
  assert.ok(Math.abs(near.centsError - 49) < 1e-6);
  assert.equal(near.answer.correct, true);

  const far = gradeSungPitch(q, centsAbove(target, 51), 800, { toleranceCents: 50, octaveAgnostic: false });
  assert.ok(Math.abs(far.centsError - 51) < 1e-6);
  assert.equal(far.answer.correct, false);
});

test('octaveAgnostic accepts the target one octave high; without it, fails', () => {
  const q = p5Question();
  const octaveUp = midiToFrequency(q.targetMidi + 12);

  const agnostic = gradeSungPitch(q, octaveUp, 800, { toleranceCents: 50, octaveAgnostic: true });
  assert.ok(Math.abs(agnostic.centsError) < 1e-6);
  assert.equal(agnostic.answer.correct, true);

  const strict = gradeSungPitch(q, octaveUp, 800, { toleranceCents: 50, octaveAgnostic: false });
  assert.ok(Math.abs(strict.centsError - 1200) < 1e-6);
  assert.equal(strict.answer.correct, false);
});

test('chosenIntervalId reflects the sung interval (sing a P4 when asked for a P5)', () => {
  const q = p5Question(); // root C4=60, asked P5
  // Sing F4 (65) instead — a perfect fourth above the root.
  const sungP4 = midiToFrequency(65);
  const result = gradeSungPitch(q, sungP4, 800, { toleranceCents: 50, octaveAgnostic: false });
  assert.equal(result.answer.chosenIntervalId, 'P4');
  assert.equal(result.answer.correct, false);
});

test('responseMs is rounded and clamped to >= 0', () => {
  const q = p5Question();
  const target = midiToFrequency(q.targetMidi);
  assert.equal(gradeSungPitch(q, target, 1234.7, { toleranceCents: 50, octaveAgnostic: false }).answer.responseMs, 1235);
  assert.equal(gradeSungPitch(q, target, -5, { toleranceCents: 50, octaveAgnostic: false }).answer.responseMs, 0);
});

test('generateSingQuestion keeps both notes inside the vocal range over many draws', () => {
  const config = DEFAULT_SING_CONFIG;
  const rng = mulberry32(4242);
  const { lowMidi, highMidi } = config.vocalRange;
  for (let i = 0; i < 500; i++) {
    const q = generateSingQuestion(config, rng);
    assert.equal(q.mode, 'sing');
    assert.ok(config.intervalPool.includes(q.intervalId));
    assert.equal(q.notation, undefined);
    for (const midi of [q.rootMidi, q.targetMidi]) {
      assert.ok(midi >= lowMidi && midi <= highMidi, `midi ${midi} out of range`);
    }
  }
});
