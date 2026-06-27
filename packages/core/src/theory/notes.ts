/**
 * Pitch primitives.
 *
 * Pitch is modeled on MIDI note numbers (C4 = middle C = 60). MIDI is the lingua
 * franca here: audio synthesis, transposition, and interval math are all trivial on
 * integers. Letter-name spelling (needed for the sight-reading mode) is derived on
 * demand and lives alongside, but the canonical identity of a pitch is its MIDI number.
 */

export type MidiNote = number;

export const A4_FREQUENCY = 440;
export const A4_MIDI = 69;
export const MIDDLE_C_MIDI = 60;

/** The seven natural letter names, in pitch-class order starting at C. */
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

/** Pitch class (0-11) for each natural letter. */
export const LETTER_PITCH_CLASS: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Convert a MIDI note number to frequency in Hz (equal temperament, A4 = 440). */
export function midiToFrequency(midi: MidiNote): number {
  return A4_FREQUENCY * 2 ** ((midi - A4_MIDI) / 12);
}

/**
 * Convert a frequency in Hz to a (fractional) MIDI note number — the inverse of
 * `midiToFrequency`. A detected pitch rarely lands exactly on a semitone, so the result is
 * fractional; round it to map back to the nearest MIDI note.
 */
export function frequencyToMidi(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_FREQUENCY);
}

/** Pitch class 0-11 (C..B) of a MIDI note. */
export function pitchClass(midi: MidiNote): number {
  return ((midi % 12) + 12) % 12;
}

/** Octave number in scientific pitch notation (C4 = middle C). */
export function octaveOf(midi: MidiNote): number {
  return Math.floor(midi / 12) - 1;
}

/**
 * Human-readable name for a MIDI note, e.g. 60 -> "C4", 61 -> "C#4" (or "Db4").
 * @param preferFlats render black keys as flats instead of sharps.
 */
export function noteName(midi: MidiNote, preferFlats = false): string {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[pitchClass(midi)]}${octaveOf(midi)}`;
}

/** Build a MIDI note from a natural letter, semitone alteration, and octave. */
export function midiFromParts(letter: Letter, alteration: number, octave: number): MidiNote {
  return (octave + 1) * 12 + LETTER_PITCH_CLASS[letter] + alteration;
}
