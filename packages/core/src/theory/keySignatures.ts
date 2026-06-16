/**
 * Key signature data.
 *
 * This module is groundwork for the **sight-reading** mode, where the same interval must
 * be read correctly across every key signature. Ear training does not need it yet, but
 * it lives in core now so the data model is settled before notation work begins.
 *
 * The order of sharps is F C G D A E B; the order of flats is its reverse, B E A D G C F.
 */

import type { Letter } from './notes.js';

export type Accidental = 'sharp' | 'flat';

export interface KeySignature {
  /** Tonic spelled with its accidental, e.g. "C", "G", "Bb", "F#". */
  tonic: string;
  mode: 'major' | 'minor';
  /** Positive = number of sharps; negative = number of flats; 0 = C major / A minor. */
  fifths: number;
}

export const ORDER_OF_SHARPS: Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const ORDER_OF_FLATS: Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Major keys indexed by position on the circle of fifths (-7 flats .. +7 sharps). */
export const MAJOR_KEYS: KeySignature[] = [
  { tonic: 'Cb', mode: 'major', fifths: -7 },
  { tonic: 'Gb', mode: 'major', fifths: -6 },
  { tonic: 'Db', mode: 'major', fifths: -5 },
  { tonic: 'Ab', mode: 'major', fifths: -4 },
  { tonic: 'Eb', mode: 'major', fifths: -3 },
  { tonic: 'Bb', mode: 'major', fifths: -2 },
  { tonic: 'F', mode: 'major', fifths: -1 },
  { tonic: 'C', mode: 'major', fifths: 0 },
  { tonic: 'G', mode: 'major', fifths: 1 },
  { tonic: 'D', mode: 'major', fifths: 2 },
  { tonic: 'A', mode: 'major', fifths: 3 },
  { tonic: 'E', mode: 'major', fifths: 4 },
  { tonic: 'B', mode: 'major', fifths: 5 },
  { tonic: 'F#', mode: 'major', fifths: 6 },
  { tonic: 'C#', mode: 'major', fifths: 7 },
];

/**
 * The letters that carry an accidental in a given key signature.
 * @param fifths circle-of-fifths position (negative flats, positive sharps).
 */
export function accidentalLetters(fifths: number): { accidental: Accidental; letters: Letter[] } {
  if (fifths > 0) {
    return { accidental: 'sharp', letters: ORDER_OF_SHARPS.slice(0, fifths) };
  }
  if (fifths < 0) {
    return { accidental: 'flat', letters: ORDER_OF_FLATS.slice(0, -fifths) };
  }
  return { accidental: 'sharp', letters: [] };
}

/** A key signature with mostly flats reads better with flat note names. */
export function keyPrefersFlats(key: KeySignature): boolean {
  return key.fifths < 0;
}
