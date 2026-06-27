import assert from 'node:assert/strict';
import { test } from 'node:test';
import { intervalById } from '../theory/intervals.js';
import { isDiatonic, spelledToMidi } from '../theory/spelling.js';
import {
  CLEF_RANGE,
  DEFAULT_SIGHT_CONFIG,
  gradeAnswer,
  generateSightReadingQuestion,
} from './session.js';
import { MAX_SIGHT_LEVEL, SIGHT_STAGES, sightConfigForLevel } from './sightReading.js';
import type { Rng } from './types.js';

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

test('every stage generates valid, in-range, in-key, correctly-spelled prompts', () => {
  for (let level = 1; level <= MAX_SIGHT_LEVEL; level++) {
    const config = sightConfigForLevel(level);
    const rng = mulberry32(level * 7919 + 13);
    for (let i = 0; i < 200; i++) {
      const q = generateSightReadingQuestion(config, rng);
      assert.equal(q.mode, 'sight');
      assert.ok(config.intervalPool.includes(q.intervalId));
      const notation = q.notation!;
      assert.ok(notation);
      assert.ok(config.clefs.includes(notation.clef));
      assert.ok(config.keyPool.some((k) => k.tonic === notation.key.tonic));
      assert.ok(notation.rootSpelled && notation.targetSpelled);

      // The spelled notes must round-trip to the question's MIDI values.
      assert.equal(spelledToMidi(notation.rootSpelled), q.rootMidi);
      assert.equal(spelledToMidi(notation.targetSpelled), q.targetMidi);

      // The sounding distance must match the interval the learner is asked to name.
      assert.equal(q.targetMidi - q.rootMidi, intervalById(q.intervalId).semitones);

      // Both notes stay inside the clef's render range.
      const range = CLEF_RANGE[notation.clef];
      for (const midi of [q.rootMidi, q.targetMidi]) {
        assert.ok(midi >= range.lowMidi && midi <= range.highMidi);
      }

      // Diatonic stages must keep both notes in the key (no accidental glyphs needed).
      if (config.diatonicOnly) {
        assert.ok(isDiatonic(notation.rootSpelled, notation.key));
        assert.ok(isDiatonic(notation.targetSpelled, notation.key));
      }
    }
  }
});

test('the spelled target is the right number of letters from the root', () => {
  const config = sightConfigForLevel(MAX_SIGHT_LEVEL);
  const rng = mulberry32(99);
  const order = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  for (let i = 0; i < 200; i++) {
    const q = generateSightReadingQuestion(config, rng);
    const { rootSpelled, targetSpelled } = q.notation!;
    const rootIdx = order.indexOf(rootSpelled.letter) + rootSpelled.octave * 7;
    const targetIdx = order.indexOf(targetSpelled.letter) + targetSpelled.octave * 7;
    const letterSteps = targetIdx - rootIdx;
    // P1=0, m2/M2=1, thirds=2 ... octave=7. Derive the expected step count from the label.
    const number = Number(intervalById(q.intervalId).label.replace(/\D/g, ''));
    // TT may be spelled as either A4 (3 steps) or d5 (4 steps) depending on the key.
    const expectedSteps = q.intervalId === 'TT' ? [3, 4] : [number - 1];
    assert.ok(expectedSteps.includes(letterSteps));
  }
});

test('gradeAnswer works unchanged for a sight question', () => {
  const q = generateSightReadingQuestion(DEFAULT_SIGHT_CONFIG, mulberry32(1));
  assert.equal(gradeAnswer(q, q.intervalId, 1234).correct, true);
  const wrong = q.intervalId === 'P5' ? 'M3' : 'P5';
  assert.equal(gradeAnswer(q, wrong, 1234).correct, false);
});

test('difficulty levels clamp and the default is the first stage', () => {
  assert.equal(sightConfigForLevel(0), SIGHT_STAGES[0]!.config);
  assert.equal(sightConfigForLevel(999), SIGHT_STAGES[MAX_SIGHT_LEVEL - 1]!.config);
});
