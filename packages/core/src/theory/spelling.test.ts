import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAJOR_KEYS } from './keySignatures.js';
import {
  diatonicNotes,
  isDiatonic,
  spelledToMidi,
  noteInKey,
  spellInterval,
  spelledName,
  type SpelledNote,
} from './spelling.js';

const key = (tonic: string) => MAJOR_KEYS.find((k) => k.tonic === tonic)!;

test('spelling fixes the letter by interval number, the accidental by distance', () => {
  // M3 above E♭ is G natural (the same two letters, no accidental needed).
  const g = spellInterval({ letter: 'E', alteration: -1, octave: 4 }, 'M3', 'ascending');
  assert.deepEqual(g, { letter: 'G', alteration: 0, octave: 4 });

  // m3 above C is E♭ — same letter-step as above, but the quality pulls the accidental down.
  const eFlat = spellInterval({ letter: 'C', alteration: 0, octave: 4 }, 'm3', 'ascending');
  assert.deepEqual(eFlat, { letter: 'E', alteration: -1, octave: 4 });

  // m3 above E♭ is G♭ (E♭ → G♭, still two letter-steps).
  const gFlat = spellInterval({ letter: 'E', alteration: -1, octave: 4 }, 'm3', 'ascending');
  assert.deepEqual(gFlat, { letter: 'G', alteration: -1, octave: 4 });

  // P5 above C is G; P4 below C is G3.
  assert.deepEqual(spellInterval({ letter: 'C', alteration: 0, octave: 4 }, 'P5', 'ascending'), {
    letter: 'G',
    alteration: 0,
    octave: 4,
  });
  assert.deepEqual(spellInterval({ letter: 'C', alteration: 0, octave: 4 }, 'P4', 'descending'), {
    letter: 'G',
    alteration: 0,
    octave: 3,
  });
});

test('the tritone spells as A4 or d5 per the option', () => {
  // Ascending tritone from C4: augmented fourth → F♯4, diminished fifth → G♭4.
  assert.deepEqual(spellInterval({ letter: 'C', alteration: 0, octave: 4 }, 'TT', 'ascending', { tritoneAs: 'A4' }), {
    letter: 'F',
    alteration: 1,
    octave: 4,
  });
  assert.deepEqual(spellInterval({ letter: 'C', alteration: 0, octave: 4 }, 'TT', 'ascending', { tritoneAs: 'd5' }), {
    letter: 'G',
    alteration: -1,
    octave: 4,
  });
  // Default (no option) is the augmented fourth.
  assert.deepEqual(spellInterval({ letter: 'C', alteration: 0, octave: 4 }, 'TT', 'ascending'), {
    letter: 'F',
    alteration: 1,
    octave: 4,
  });
});

test('spelling crosses the octave boundary correctly', () => {
  // A third up from B4 lands on D5, not D4.
  const d5 = spellInterval({ letter: 'B', alteration: 0, octave: 4 }, 'm3', 'ascending');
  assert.deepEqual(d5, { letter: 'D', alteration: 0, octave: 5 });

  // A perfect octave up from C4 is C5.
  const c5 = spellInterval({ letter: 'C', alteration: 0, octave: 4 }, 'P8', 'ascending');
  assert.deepEqual(c5, { letter: 'C', alteration: 0, octave: 5 });
});

test('descending spelling drops the letter and octave as expected', () => {
  // A major third below A4 is F4 (F♮), matching the MIDI-only test in intervals.test.ts.
  const f4 = spellInterval({ letter: 'A', alteration: 0, octave: 4 }, 'M3', 'descending');
  assert.deepEqual(f4, { letter: 'F', alteration: 0, octave: 4 });
  assert.equal(spelledToMidi(f4), 65);
});

test('a spelled note round-trips to the right MIDI value', () => {
  assert.equal(spelledToMidi({ letter: 'C', alteration: 0, octave: 4 }), 60);
  assert.equal(spelledToMidi({ letter: 'E', alteration: -1, octave: 4 }), 63); // E♭4
  assert.equal(spelledToMidi({ letter: 'F', alteration: 1, octave: 4 }), 66); // F♯4
});

test('noteInKey applies the key signature; diatonic membership follows', () => {
  // In E♭ major (B, E, A flatted) the letter E is written E♭.
  const e = noteInKey('E', 4, key('Eb'));
  assert.deepEqual(e, { letter: 'E', alteration: -1, octave: 4 });
  assert.ok(isDiatonic(e, key('Eb')));
  // E♮ does not belong to E♭ major.
  assert.equal(isDiatonic({ letter: 'E', alteration: 0, octave: 4 }, key('Eb')), false);
});

test('diatonicNotes yields in-key notes, in pitch order, within bounds', () => {
  const notes = diatonicNotes(key('G'), 60, 72); // C4..C5 in G major (F is sharp)
  assert.ok(notes.length > 0);
  for (const n of notes) {
    assert.ok(isDiatonic(n, key('G')));
    const midi = spelledToMidi(n);
    assert.ok(midi >= 60 && midi <= 72);
  }
  const midis = notes.map(spelledToMidi);
  assert.deepEqual(midis, [...midis].sort((a, b) => a - b));
  // F should appear as F♯ in G major.
  const f = notes.find((n) => n.letter === 'F') as SpelledNote;
  assert.equal(f.alteration, 1);
});

test('spelledName renders accidentals', () => {
  assert.equal(spelledName({ letter: 'E', alteration: -1, octave: 4 }), 'E♭4');
  assert.equal(spelledName({ letter: 'F', alteration: 1, octave: 5 }), 'F♯5');
  assert.equal(spelledName({ letter: 'C', alteration: 0, octave: 4 }), 'C4');
});
