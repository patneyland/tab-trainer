/**
 * Melody-mimic generation (Phase 6 — sing-back / tonal memory).
 *
 * Builds a short, *singable* diatonic melody from a key and a vocal range so the user can
 * hear it and sing it back. Pure and RNG-injectable like the rest of `training/` — no audio,
 * no DOM. A client plays the returned MIDI sequence (after establishing the key) and scores
 * each sung note; the spellings ride along for any future notation.
 *
 * Design (pedagogy): melodies move *mostly by step* with the occasional small leap (a third
 * at most), stay inside the singer's range, start near the tonic, and end on a stable tone
 * (tonic / 3rd / 5th) — this is what makes a line easy to retain and reproduce, the audition's
 * "musical memory" skill.
 */

import { pitchClass, type MidiNote } from '../theory/notes.js';
import type { KeySignature } from '../theory/keySignatures.js';
import { diatonicNotes, spelledToMidi, type SpelledNote } from '../theory/spelling.js';
import type { Rng } from './types.js';

/** One note of a generated melody: its MIDI value and its spelling in the key. */
export interface MelodyNote {
  midi: MidiNote;
  spelled: SpelledNote;
}

/** Largest leap (in semitones) we allow between adjacent melody notes — up to a major third. */
const MAX_LEAP_SEMITONES = 4;
const MIN_LENGTH = 3;
const MAX_LENGTH = 8;

function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  const index = Math.floor(rng() * items.length);
  return items[Math.min(index, items.length - 1)]!;
}

/**
 * Generate a singable diatonic melody of `length` notes (clamped to 3..8).
 *
 * Candidate notes are the diatonic scale tones of `key` inside `[lowMidi, highMidi]`. The line
 * starts near the tonic, moves mostly by step with occasional small leaps (≤ a third), keeps
 * every note in range, and ends on a stable tone (tonic / 3rd / 5th). Deterministic for a
 * given seeded `rng` — every choice flows through `pick`, mirroring `session.ts`.
 */
export function generateMelody(
  key: KeySignature,
  range: { lowMidi: MidiNote; highMidi: MidiNote },
  length: number,
  rng: Rng = Math.random,
): MelodyNote[] {
  const len = Math.max(MIN_LENGTH, Math.min(Math.round(length), MAX_LENGTH));

  const scale = diatonicNotes(key, range.lowMidi, range.highMidi).map(
    (spelled): MelodyNote => ({ midi: spelledToMidi(spelled), spelled }),
  );
  if (scale.length === 0) {
    throw new Error(`No diatonic notes for key ${key.tonic} in the given range`);
  }

  // Pitch class of the tonic — used to find stable degrees (tonic, 3rd, 5th) for start/end.
  const tonicPc = tonicPitchClass(key);
  const stablePcs = new Set([tonicPc, (tonicPc + 4) % 12, (tonicPc + 3) % 12, (tonicPc + 7) % 12]);
  const stableNotes = scale.filter((n) => stablePcs.has(pitchClass(n.midi)));

  // Start near the tonic: prefer a stable tone in the lower-middle of the range.
  const startPool = stableNotes.length > 0 ? stableNotes : scale;
  const lowerHalf = startPool.filter((n) => n.midi <= range.lowMidi + (range.highMidi - range.lowMidi) / 2);
  const melody: MelodyNote[] = [pick(lowerHalf.length > 0 ? lowerHalf : startPool, rng)];

  // Does some stable tone sit within a small leap of `note`? Used to keep the penultimate
  // note somewhere a stable final note is reachable without a big jump.
  const stableReachable = (note: MelodyNote): boolean =>
    stableNotes.some((s) => s.midi !== note.midi && Math.abs(s.midi - note.midi) <= MAX_LEAP_SEMITONES);

  // Each subsequent note: prefer stepwise motion, allow a small leap (≤ a third), stay in range.
  for (let i = 1; i < len; i++) {
    const prev = melody[i - 1]!;
    const isLast = i === len - 1;
    const isPenultimate = i === len - 2;

    let candidates = scale.filter((n) => {
      if (n.midi === prev.midi) return false; // keep the line moving — no repeats
      const leap = Math.abs(n.midi - prev.midi);
      if (leap > MAX_LEAP_SEMITONES) return false;
      if (isLast) return stablePcs.has(pitchClass(n.midi)); // land on a stable tone
      // Keep the penultimate note where a stable final tone is reachable by a small leap.
      if (isPenultimate) return stableReachable(n);
      return true;
    });

    if (candidates.length === 0) {
      // Relax the constraints in order of importance, but always stay within a small leap.
      candidates = scale.filter((n) => {
        if (n.midi === prev.midi) return false;
        if (Math.abs(n.midi - prev.midi) > MAX_LEAP_SEMITONES) return false;
        return isLast ? stablePcs.has(pitchClass(n.midi)) : true;
      });
      if (candidates.length === 0) candidates = scale.filter((n) => n.midi !== prev.midi);
      if (candidates.length === 0) candidates = scale;
    }

    // Weight toward stepwise motion: a step (≤ 2 semitones) appears twice as often as a leap.
    const steps = candidates.filter((n) => Math.abs(n.midi - prev.midi) <= 2);
    const weighted = steps.length > 0 ? [...candidates, ...steps] : candidates;
    melody.push(pick(weighted, rng));
  }

  return melody;
}

/** Pitch class (0-11) of the key's tonic letter + accidental, from its `fifths`. */
function tonicPitchClass(key: KeySignature): number {
  // Major-key tonic pitch class = (fifths * 7) mod 12 relative to C. (C=0, G=7, D=2, F=5…)
  return ((key.fifths * 7) % 12 + 12) % 12;
}
