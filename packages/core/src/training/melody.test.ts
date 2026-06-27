import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAJOR_KEYS } from '../theory/keySignatures.js';
import { isDiatonic, spelledToMidi } from '../theory/spelling.js';
import { pitchClass } from '../theory/notes.js';
import { generateMelody } from './melody.js';
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

const C_MAJOR = MAJOR_KEYS.find((k) => k.tonic === 'C')!;
const G_MAJOR = MAJOR_KEYS.find((k) => k.tonic === 'G')!;
const F_MAJOR = MAJOR_KEYS.find((k) => k.tonic === 'F')!;
const RANGE = { lowMidi: 48, highMidi: 72 }; // C3 .. C5

test('produces exactly `length` notes, in range, diatonic, with small leaps', () => {
  for (const key of [C_MAJOR, G_MAJOR, F_MAJOR]) {
    for (let length = 3; length <= 8; length++) {
      const rng = mulberry32(length * 131 + key.fifths * 17 + 5);
      for (let i = 0; i < 50; i++) {
        const melody = generateMelody(key, RANGE, length, rng);
        assert.equal(melody.length, length);
        for (const note of melody) {
          // MIDI matches its spelling, sits in range, and is diatonic to the key.
          assert.equal(spelledToMidi(note.spelled), note.midi);
          assert.ok(note.midi >= RANGE.lowMidi && note.midi <= RANGE.highMidi);
          assert.ok(isDiatonic(note.spelled, key));
        }
        // Adjacent leaps are small (no bigger than a major third = 4 semitones).
        for (let j = 1; j < melody.length; j++) {
          const leap = Math.abs(melody[j]!.midi - melody[j - 1]!.midi);
          assert.ok(leap > 0 && leap <= 4, `leap of ${leap} too large`);
        }
      }
    }
  }
});

test('clamps out-of-bounds length into 3..8', () => {
  const tooShort = generateMelody(C_MAJOR, RANGE, 1, mulberry32(1));
  assert.equal(tooShort.length, 3);
  const tooLong = generateMelody(C_MAJOR, RANGE, 99, mulberry32(2));
  assert.equal(tooLong.length, 8);
});

test('ends on a stable tone (tonic / 3rd / 5th of the key)', () => {
  for (const key of [C_MAJOR, G_MAJOR, F_MAJOR]) {
    const tonicPc = ((key.fifths * 7) % 12 + 12) % 12;
    const stable = new Set([tonicPc, (tonicPc + 3) % 12, (tonicPc + 4) % 12, (tonicPc + 7) % 12]);
    for (let i = 0; i < 50; i++) {
      const melody = generateMelody(key, RANGE, 6, mulberry32(i + key.fifths * 7));
      const last = melody[melody.length - 1]!;
      assert.ok(stable.has(pitchClass(last.midi)), `final pc ${pitchClass(last.midi)} not stable`);
    }
  }
});

test('reproducible: same seed → same melody', () => {
  const a = generateMelody(G_MAJOR, RANGE, 7, mulberry32(42));
  const b = generateMelody(G_MAJOR, RANGE, 7, mulberry32(42));
  assert.deepEqual(
    a.map((n) => n.midi),
    b.map((n) => n.midi),
  );
});
