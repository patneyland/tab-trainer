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
  /** Generic size (letter-name span): P1=1, 2nds=2, 3rds=3, P4=4, P5=5, 6ths=6, 7ths=7, P8=8. */
  degree: number;
  /** A familiar tune that opens with this interval — the classic ear-training crutch. */
  ascendingMnemonic: string;
  descendingMnemonic: string;
}

export const INTERVALS: readonly Interval[] = [
  { id: 'P1', label: 'P1', name: 'Perfect unison', semitones: 0, degree: 1, ascendingMnemonic: 'Same note', descendingMnemonic: 'Same note' },
  { id: 'm2', label: 'm2', name: 'Minor second', semitones: 1, degree: 2, ascendingMnemonic: 'Jaws theme', descendingMnemonic: 'Für Elise' },
  { id: 'M2', label: 'M2', name: 'Major second', semitones: 2, degree: 2, ascendingMnemonic: 'Happy Birthday', descendingMnemonic: 'Mary Had a Little Lamb' },
  { id: 'm3', label: 'm3', name: 'Minor third', semitones: 3, degree: 3, ascendingMnemonic: 'Greensleeves', descendingMnemonic: 'Hey Jude' },
  { id: 'M3', label: 'M3', name: 'Major third', semitones: 4, degree: 3, ascendingMnemonic: 'Oh When the Saints', descendingMnemonic: 'Swing Low, Sweet Chariot' },
  { id: 'P4', label: 'P4', name: 'Perfect fourth', semitones: 5, degree: 4, ascendingMnemonic: 'Here Comes the Bride', descendingMnemonic: 'O Come All Ye Faithful' },
  // TT default degree 4 = augmented 4th; the diminished-5th spelling (degree 5) is selected via spellInterval's tritoneAs option.
  { id: 'TT', label: 'TT', name: 'Tritone', semitones: 6, degree: 4, ascendingMnemonic: 'The Simpsons (Maria)', descendingMnemonic: 'YYZ (Rush)' },
  { id: 'P5', label: 'P5', name: 'Perfect fifth', semitones: 7, degree: 5, ascendingMnemonic: 'Twinkle Twinkle', descendingMnemonic: 'Flintstones' },
  { id: 'm6', label: 'm6', name: 'Minor sixth', semitones: 8, degree: 6, ascendingMnemonic: 'The Entertainer', descendingMnemonic: 'Love Story theme' },
  { id: 'M6', label: 'M6', name: 'Major sixth', semitones: 9, degree: 6, ascendingMnemonic: 'My Bonnie / NBC chimes', descendingMnemonic: 'Nobody Knows the Trouble' },
  { id: 'm7', label: 'm7', name: 'Minor seventh', semitones: 10, degree: 7, ascendingMnemonic: 'Star Trek theme', descendingMnemonic: 'An American in Paris' },
  { id: 'M7', label: 'M7', name: 'Major seventh', semitones: 11, degree: 7, ascendingMnemonic: 'Take On Me', descendingMnemonic: 'I Love You (Cole Porter)' },
  { id: 'P8', label: 'P8', name: 'Perfect octave', semitones: 12, degree: 8, ascendingMnemonic: 'Somewhere Over the Rainbow', descendingMnemonic: 'Willow Weep for Me' },
];

const BY_ID = new Map<IntervalId, Interval>(INTERVALS.map((i) => [i.id, i]));
const BY_SEMITONES = new Map<number, Interval>(INTERVALS.map((i) => [i.semitones, i]));

/**
 * Distance expressed in whole/half steps — the way intervals are first taught.
 * 1 semitone = "half step", 2 = "whole step"; larger gaps read in whole-step units
 * ("2 whole steps", "2½ steps", …). A whole step is two half steps.
 */
export function stepsLabel(semitones: number): string {
  if (semitones === 0) return 'no step';
  if (semitones === 1) return 'half step';
  if (semitones === 2) return 'whole step';
  const whole = Math.floor(semitones / 2);
  const label = semitones % 2 === 1 ? `${whole}½` : `${whole}`;
  return `${label} steps`;
}

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
