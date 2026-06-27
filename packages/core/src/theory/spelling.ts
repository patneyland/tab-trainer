/**
 * Spelled-pitch primitives for the sight-reading mode.
 *
 * `notes.ts` is MIDI-first: a pitch is a number, and that number is enough for audio and
 * interval *distance*. Notation is different — the same sounding pitch is written
 * differently depending on the key (C→E♭ vs C→D♯ are the same keys on a piano but two
 * different things on the page). To engrave a note we need its **spelling**: a letter, a
 * chromatic alteration, and an octave. This module derives spellings and bridges them back
 * to MIDI so audio playback ("hear it") still works.
 */

import { LETTERS, midiFromParts, type Letter, type MidiNote } from './notes.js';
import { intervalById, type IntervalDirection, type IntervalId } from './intervals.js';
import { accidentalLetters, type KeySignature } from './keySignatures.js';

/** How a tritone is spelled: augmented fourth (degree 4) or diminished fifth (degree 5). */
export type TritoneSpelling = 'A4' | 'd5';

/**
 * A note as it appears on the staff. `alteration` is in semitones: -1 = flat, +1 = sharp,
 * 0 = natural, ±2 = double. `octave` is scientific (middle C = C4).
 */
export interface SpelledNote {
  letter: Letter;
  alteration: number;
  octave: number;
}

/** MIDI note number for a spelled note (reuses the MIDI-first primitive). */
export function spelledToMidi(note: SpelledNote): MidiNote {
  return midiFromParts(note.letter, note.alteration, note.octave);
}

/** Render a spelled note as text, e.g. {E,-1,4} → "E♭4". */
export function spelledName(note: SpelledNote): string {
  const marks: Record<number, string> = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
  return `${note.letter}${marks[note.alteration] ?? ''}${note.octave}`;
}

/**
 * Spell the note an interval away from a root, choosing the correct letter and accidental.
 *
 * The letter is fixed by the interval number (a third up from E♭ is *some* G, never F♯),
 * and the accidental is whatever makes the pitch distance come out to the interval's
 * semitones. This is why M3 above E♭ is G♮ but m3 above C is E♭ — same idea, different
 * accidental falling out of the arithmetic.
 */
export function spellInterval(
  root: SpelledNote,
  intervalId: IntervalId,
  direction: IntervalDirection,
  opts?: { tritoneAs?: TritoneSpelling },
): SpelledNote {
  const interval = intervalById(intervalId);
  const semitones = interval.semitones;
  // The letter span comes from the interval's generic size. The tritone is the one ambiguous
  // case: as an augmented 4th its degree is 4 (default); as a diminished 5th its degree is 5.
  const degree = intervalId === 'TT' && opts?.tritoneAs === 'd5' ? 5 : interval.degree;
  const letterSteps = degree - 1;
  const sign = direction === 'ascending' ? 1 : -1;

  // Step the letter name by the interval number, wrapping through the octave.
  const rootLetterIndex = LETTERS.indexOf(root.letter);
  const rawIndex = rootLetterIndex + sign * letterSteps;
  const letter = LETTERS[((rawIndex % 7) + 7) % 7]!;
  // Each wrap past B→C (or below C→B descending) crosses an octave boundary.
  const octave = root.octave + Math.floor(rawIndex / 7);

  // The accidental absorbs whatever the natural letters don't already account for.
  const targetMidi = spelledToMidi(root) + sign * semitones;
  const alteration = targetMidi - midiFromParts(letter, 0, octave);
  return { letter, alteration, octave };
}

/** The alteration a given letter carries in a key signature (−1 flat, +1 sharp, 0 natural). */
export function alterationForLetterInKey(letter: Letter, key: KeySignature): number {
  const { accidental, letters } = accidentalLetters(key.fifths);
  if (!letters.includes(letter)) return 0;
  return accidental === 'sharp' ? 1 : -1;
}

/** Spell a natural letter as it is written in a key — i.e. apply the key's accidentals. */
export function noteInKey(letter: Letter, octave: number, key: KeySignature): SpelledNote {
  return { letter, alteration: alterationForLetterInKey(letter, key), octave };
}

// NOTE: `isDiatonic` and `diatonicNotes` live here (in spelling.ts) rather than in
// keySignatures.ts on purpose: they call `spelledToMidi`/`noteInKey`, so placing them in
// keySignatures.ts would create a runtime circular import (keySignatures ↔ spelling).

/** Whether a spelled note belongs to the key (its accidental matches the key signature). */
export function isDiatonic(note: SpelledNote, key: KeySignature): boolean {
  return note.alteration === alterationForLetterInKey(note.letter, key);
}

/**
 * The diatonic notes of a key whose MIDI value falls within [lowMidi, highMidi], ordered
 * low to high. Used to pick prompt notes that actually sit in (and read cleanly in) the key.
 */
export function diatonicNotes(
  key: KeySignature,
  lowMidi: MidiNote,
  highMidi: MidiNote,
): SpelledNote[] {
  const notes: SpelledNote[] = [];
  const lowOctave = Math.floor(lowMidi / 12) - 2;
  const highOctave = Math.floor(highMidi / 12);
  for (let octave = lowOctave; octave <= highOctave; octave++) {
    for (const letter of LETTERS) {
      const note = noteInKey(letter, octave, key);
      const midi = spelledToMidi(note);
      if (midi >= lowMidi && midi <= highMidi) notes.push(note);
    }
  }
  notes.sort((a, b) => spelledToMidi(a) - spelledToMidi(b));
  return notes;
}
