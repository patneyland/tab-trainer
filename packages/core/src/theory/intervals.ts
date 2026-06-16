/**
 * Interval definitions and helpers.
 *
 * An interval is identified by the number of semitones between two pitches. Within one
 * octave there are 13 simple intervals (perfect unison through perfect octave). Each has
 * a quality + number name ("major third"), a compact label ("M3"), and a common
 * solfège-style mnemonic that ear-training students lean on.
 *
 * The tritone is intentionally a single entry (6 semitones). It can be spelled as an
 * augmented fourth or a diminished fifth; that distinction only matters once we render
 * notation in the sight-reading mode, where spelling is derived from the key context.
 */

import type { MidiNote } from './notes.js';

export type IntervalId =
  | 'P1'
  | 'm2'
  | 'M2'
  | 'm3'
  | 'M3'
  | 'P4'
  | 'TT'
  | 'P5'
  | 'm6'
  | 'M6'
  | 'm7'
  | 'M7'
  | 'P8';

export interface Interval {
  id: IntervalId;
  /** Compact label, e.g. "M3". */
  label: string;
  /** Full name, e.g. "Major third". */
  name: string;
  /** Distance in semitones (0-12). */
  semitones: number;
  /** A familiar tune that opens with this interval — the classic ear-training crutch. */
  ascendingMnemonic: string;
  descendingMnemonic: string;
}

export const INTERVALS: readonly Interval[] = [
  { id: 'P1', label: 'P1', name: 'Perfect unison', semitones: 0, ascendingMnemonic: 'Same note', descendingMnemonic: 'Same note' },
  { id: 'm2', label: 'm2', name: 'Minor second', semitones: 1, ascendingMnemonic: 'Jaws theme', descendingMnemonic: 'Für Elise' },
  { id: 'M2', label: 'M2', name: 'Major second', semitones: 2, ascendingMnemonic: 'Happy Birthday', descendingMnemonic: 'Mary Had a Little Lamb' },
  { id: 'm3', label: 'm3', name: 'Minor third', semitones: 3, ascendingMnemonic: 'Greensleeves', descendingMnemonic: 'Hey Jude' },
  { id: 'M3', label: 'M3', name: 'Major third', semitones: 4, ascendingMnemonic: 'Oh When the Saints', descendingMnemonic: 'Swing Low, Sweet Chariot' },
  { id: 'P4', label: 'P4', name: 'Perfect fourth', semitones: 5, ascendingMnemonic: 'Here Comes the Bride', descendingMnemonic: 'O Come All Ye Faithful' },
  { id: 'TT', label: 'TT', name: 'Tritone', semitones: 6, ascendingMnemonic: 'The Simpsons (Maria)', descendingMnemonic: 'YYZ (Rush)' },
  { id: 'P5', label: 'P5', name: 'Perfect fifth', semitones: 7, ascendingMnemonic: 'Twinkle Twinkle', descendingMnemonic: 'Flintstones' },
  { id: 'm6', label: 'm6', name: 'Minor sixth', semitones: 8, ascendingMnemonic: 'The Entertainer', descendingMnemonic: 'Love Story theme' },
  { id: 'M6', label: 'M6', name: 'Major sixth', semitones: 9, ascendingMnemonic: 'My Bonnie / NBC chimes', descendingMnemonic: 'Nobody Knows the Trouble' },
  { id: 'm7', label: 'm7', name: 'Minor seventh', semitones: 10, ascendingMnemonic: 'Star Trek theme', descendingMnemonic: 'An American in Paris' },
  { id: 'M7', label: 'M7', name: 'Major seventh', semitones: 11, ascendingMnemonic: 'Take On Me', descendingMnemonic: 'I Love You (Cole Porter)' },
  { id: 'P8', label: 'P8', name: 'Perfect octave', semitones: 12, ascendingMnemonic: 'Somewhere Over the Rainbow', descendingMnemonic: 'Willow Weep for Me' },
];

const BY_ID = new Map<IntervalId, Interval>(INTERVALS.map((i) => [i.id, i]));
const BY_SEMITONES = new Map<number, Interval>(INTERVALS.map((i) => [i.semitones, i]));

export function intervalById(id: IntervalId): Interval {
  const interval = BY_ID.get(id);
  if (!interval) throw new Error(`Unknown interval id: ${id}`);
  return interval;
}

/** Look up the simple (within-octave) interval for a semitone count 0-12. */
export function intervalBySemitones(semitones: number): Interval {
  const interval = BY_SEMITONES.get(semitones);
  if (!interval) throw new Error(`No simple interval for ${semitones} semitones`);
  return interval;
}

/**
 * The interval between two MIDI notes, reduced to a simple interval (0-12 semitones).
 * A whole-octave gap names as a perfect octave (P8), not a unison — only a true
 * same-pitch pair is a unison.
 */
export function intervalBetween(a: MidiNote, b: MidiNote): Interval {
  const raw = Math.abs(b - a);
  const reduced = raw % 12;
  if (reduced === 0) return intervalBySemitones(raw === 0 ? 0 : 12);
  return intervalBySemitones(reduced);
}

export type IntervalDirection = 'ascending' | 'descending';

/** Apply an interval to a root note, returning the resulting MIDI note. */
export function applyInterval(
  root: MidiNote,
  interval: Interval,
  direction: IntervalDirection,
): MidiNote {
  return direction === 'ascending' ? root + interval.semitones : root - interval.semitones;
}
