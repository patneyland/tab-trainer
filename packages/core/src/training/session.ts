/**
 * Ear-training question generation and grading.
 *
 * Pure functions over an injectable RNG so the same logic is reproducible in tests and
 * reusable by any client. No audio, no DOM — a client takes a `Question`, plays it,
 * collects a choice, and calls `gradeAnswer`.
 */

import {
  applyInterval,
  INTERVALS,
  intervalBetween,
  intervalById,
  type IntervalDirection,
  type IntervalId,
} from '../theory/intervals.js';
import { frequencyToMidi, midiToFrequency, type MidiNote } from '../theory/notes.js';
import { MAJOR_KEYS, type KeySignature } from '../theory/keySignatures.js';
import {
  diatonicNotes,
  isDiatonic,
  spelledToMidi,
  spellInterval,
  type SpelledNote,
  type TritoneSpelling,
} from '../theory/spelling.js';
import type { Answer, Clef, EarTrainingConfig, Question, Rng, SightReadingConfig, SingConfig } from './types.js';

export const DEFAULT_EAR_CONFIG: EarTrainingConfig = {
  // All simple intervals within the octave (unison excluded — nothing to "hear").
  intervalPool: ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'],
  directions: ['ascending'],
  playbackStyle: 'melodic',
  // Comfortable middle range: C3 (48) to C5 (72). Leaves headroom for octave leaps.
  rootRange: { lowMidi: 48, highMidi: 72 },
};

/**
 * Intervals ordered by how much they matter to a choral (especially tenor) singer —
 * most common / easiest to hear first, rarest / hardest last. The difficulty slider grows
 * the drill pool along this order: level 7 is the core choral set (2nds, 3rds, P4, P5,
 * octave), level 9 adds the sixths, level 12 is every simple interval.
 */
export const EAR_INTERVALS_BY_PRIORITY: readonly IntervalId[] = [
  'M2', 'm2', 'M3', 'm3', 'P5', 'P4', 'P8', 'M6', 'm6', 'm7', 'M7', 'TT',
];

/** Sensible starting difficulty: exactly the intervals a choral singer actually needs. */
export const DEFAULT_EAR_LEVEL = 7;

/**
 * Build an ear-training config whose pool is the `level` most useful intervals. The pool is
 * returned in musical (ascending-semitone) order so the answer buttons read naturally,
 * regardless of the priority order the levels are unlocked in.
 */
export function earConfigForLevel(level: number, base: EarTrainingConfig = DEFAULT_EAR_CONFIG): EarTrainingConfig {
  const clamped = Math.max(2, Math.min(Math.round(level), EAR_INTERVALS_BY_PRIORITY.length));
  const chosen = new Set<IntervalId>(EAR_INTERVALS_BY_PRIORITY.slice(0, clamped));
  const intervalPool = INTERVALS.filter((i) => chosen.has(i.id)).map((i) => i.id);
  return { ...base, intervalPool };
}

function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  const index = Math.floor(rng() * items.length);
  return items[Math.min(index, items.length - 1)]!;
}

function randomIntInclusive(low: number, high: number, rng: Rng): number {
  return low + Math.floor(rng() * (high - low + 1));
}

/** A short unique-ish id without pulling in a uuid dependency. */
function questionId(rng: Rng): string {
  return `q_${Math.floor(rng() * 1e9).toString(36)}`;
}

/**
 * Generate one ear-training question. Picks a random interval from the pool, a random
 * direction, and a root note such that the target note stays within MIDI bounds.
 */
export function generateEarTrainingQuestion(config: EarTrainingConfig, rng: Rng = Math.random): Question {
  const intervalId = pick<IntervalId>(config.intervalPool, rng);
  const interval = intervalById(intervalId);
  const direction = pick<IntervalDirection>(config.directions, rng);

  // Constrain the root so the target stays inside [0, 127] and ideally the configured range.
  const { lowMidi, highMidi } = config.rootRange;
  const safeLow = direction === 'descending' ? lowMidi + interval.semitones : lowMidi;
  const safeHigh = direction === 'ascending' ? highMidi - interval.semitones : highMidi;
  const rootMidi: MidiNote = randomIntInclusive(Math.min(safeLow, safeHigh), Math.max(safeLow, safeHigh), rng);
  const targetMidi = applyInterval(rootMidi, interval, direction);

  return {
    id: questionId(rng),
    mode: 'ear',
    intervalId,
    rootMidi,
    direction,
    playbackStyle: config.playbackStyle,
    targetMidi,
  };
}

/** Grade a learner's choice against the question. */
export function gradeAnswer(question: Question, chosenIntervalId: IntervalId, responseMs: number): Answer {
  return {
    questionId: question.id,
    chosenIntervalId,
    correct: chosenIntervalId === question.intervalId,
    responseMs: Math.max(0, Math.round(responseMs)),
  };
}

// --- Sing the interval -----------------------------------------------------
//
// Singing produces a *continuous* pitch rather than a button press, so it can't reuse
// `gradeAnswer`'s discrete comparison. Generation mirrors ear training but clamps both
// notes into the singer's vocal range (you must be able to sing both). Grading is pure math
// over a frequency the client's mic pipeline hands in — no audio/DOM here — and maps the
// sung pitch back onto an `IntervalId` so the existing per-interval breakdown still works.

/**
 * Default sing config: the core choral interval set (ascending), a C3–C5 vocal range, ±50¢
 * tolerance, octave-agnostic scoring. Reuses `EAR_INTERVALS_BY_PRIORITY` ordering so the
 * pool matches the choir-weighted difficulty progression.
 */
export const DEFAULT_SING_CONFIG: SingConfig = {
  intervalPool: [...EAR_INTERVALS_BY_PRIORITY.slice(0, 7)],
  directions: ['ascending'],
  vocalRange: { lowMidi: 48, highMidi: 72 }, // C3 .. C5
  toleranceCents: 50,
  octaveAgnostic: true,
};

/**
 * Generate one sing-the-interval question. Picks an interval + direction, then a root such
 * that *both* the root and the target land inside `vocalRange` (mirrors the safeLow/safeHigh
 * clamp in `generateEarTrainingQuestion`, but clamps to the vocal range so the singer can
 * reach both notes). No notation block.
 */
export function generateSingQuestion(config: SingConfig, rng: Rng = Math.random): Question {
  const intervalId = pick<IntervalId>(config.intervalPool, rng);
  const interval = intervalById(intervalId);
  const direction = pick<IntervalDirection>(config.directions, rng);

  const { lowMidi, highMidi } = config.vocalRange;
  const safeLow = direction === 'descending' ? lowMidi + interval.semitones : lowMidi;
  const safeHigh = direction === 'ascending' ? highMidi - interval.semitones : highMidi;
  const rootMidi: MidiNote = randomIntInclusive(Math.min(safeLow, safeHigh), Math.max(safeLow, safeHigh), rng);
  const targetMidi = applyInterval(rootMidi, interval, direction);

  return {
    id: questionId(rng),
    mode: 'sing',
    intervalId,
    rootMidi,
    direction,
    playbackStyle: 'melodic',
    targetMidi,
  };
}

export interface SungResult {
  /** Answer in the same shape `gradeAnswer` returns, so it logs as an `AttemptRecord`. */
  answer: Answer;
  /** Signed cents error of the sung pitch vs the target: + sharp, - flat. */
  centsError: number;
  /** Nearest-MIDI of the sung pitch (fractional). */
  detectedMidi: number;
}

/**
 * Grade a sung pitch against a sing question. The client hands in the detected frequency
 * (its mic + pitch-detection pipeline lives in the web app); this is pure math.
 *
 * `centsError = 1200 * log2(detectedHz / targetHz)`. When `octaveAgnostic`, the error is
 * folded into [-600, 600] so the right pitch class in any octave counts as correct. The sung
 * pitch is mapped back to an `IntervalId` via `intervalBetween` so per-interval stats reflect
 * what was actually sung (e.g. a m6 sung when a M6 was asked shows up in the breakdown).
 */
export function gradeSungPitch(
  question: Question,
  detectedHz: number,
  responseMs: number,
  opts: { toleranceCents: number; octaveAgnostic: boolean },
): SungResult {
  const targetHz = midiToFrequency(question.targetMidi);
  let centsError = 1200 * Math.log2(detectedHz / targetHz);
  if (opts.octaveAgnostic) {
    // Reduce modulo 1200 into [-600, 600], choosing the representative nearest 0.
    centsError = centsError - 1200 * Math.round(centsError / 1200);
  }
  const correct = Math.abs(centsError) <= opts.toleranceCents;

  const detectedMidi = frequencyToMidi(detectedHz);
  const chosenIntervalId = intervalBetween(question.rootMidi, Math.round(detectedMidi)).id;

  const answer: Answer = {
    questionId: question.id,
    chosenIntervalId,
    correct,
    responseMs: Math.max(0, Math.round(responseMs)),
  };
  return { answer, centsError, detectedMidi };
}

// --- Sight reading ---------------------------------------------------------
//
// The eye-training counterpart. Where ear training only needs a semitone count, sight
// reading needs *spelled* notes so the staff renders correctly for the chosen key (see
// docs/modes/sight-reading.md). This stays pure — it produces a `Question` carrying the
// spelled notes, clef, and key in its `notation` block; a client engraves it and collects
// the answer. Grading reuses `gradeAnswer` above unchanged.

/** Comfortable note range per clef — mostly on the staff, a few ledger lines at the edges. */
export const CLEF_RANGE: Record<Clef, { lowMidi: MidiNote; highMidi: MidiNote }> = {
  treble: { lowMidi: 60, highMidi: 81 }, // C4 .. A5
  bass: { lowMidi: 40, highMidi: 60 }, //  E2 .. C4
};

/** Default sight-reading config: treble, C major, simple intervals, diatonic only. */
export const DEFAULT_SIGHT_CONFIG: SightReadingConfig = {
  clefs: ['treble'],
  keyPool: MAJOR_KEYS.filter((k) => k.fifths === 0),
  intervalPool: ['m3', 'M3', 'P5', 'P8'],
  presentation: 'melodic',
  diatonicOnly: true,
};

/** Flat keys read more naturally with the diminished-fifth tritone; otherwise augmented fourth. */
function tritoneForKey(key: KeySignature): TritoneSpelling {
  return key.fifths < 0 ? 'd5' : 'A4';
}

/**
 * All roots in `range` from which `intervalId` (ascending) lands on another note that is
 * still on the staff — and, in diatonic mode, still in the key. This is what keeps a "P5"
 * prompt from secretly being a diminished fifth: only roots where the *correctly spelled*
 * target matches the key survive.
 */
function eligibleRoots(
  intervalId: IntervalId,
  key: KeySignature,
  range: { lowMidi: MidiNote; highMidi: MidiNote },
  diatonicOnly: boolean,
  tritoneAs: TritoneSpelling,
): SpelledNote[] {
  const candidates = diatonicNotes(key, range.lowMidi, range.highMidi);
  return candidates.filter((root) => {
    const target = spellInterval(root, intervalId, 'ascending', { tritoneAs });
    const targetMidi = spelledToMidi(target);
    if (targetMidi < range.lowMidi || targetMidi > range.highMidi) return false;
    return diatonicOnly ? isDiatonic(target, key) : true;
  });
}

/**
 * Generate one sight-reading question. Picks a clef, key, and interval, then a root that
 * keeps both notes on the staff (and in the key, when `diatonicOnly`). If the first interval
 * has no valid root in the chosen key (e.g. a tritone in a key where it would leave the
 * range), it re-rolls the interval a few times before giving up on that key.
 */
export function generateSightReadingQuestion(config: SightReadingConfig, rng: Rng = Math.random): Question {
  const clef = pick<Clef>(config.clefs, rng);
  const key = pick<KeySignature>(config.keyPool, rng);
  const range = CLEF_RANGE[clef];
  const tritoneAs = tritoneForKey(key);

  let intervalId = pick<IntervalId>(config.intervalPool, rng);
  let roots = eligibleRoots(intervalId, key, range, config.diatonicOnly, tritoneAs);
  for (let tries = 0; roots.length === 0 && tries < 8; tries++) {
    intervalId = pick<IntervalId>(config.intervalPool, rng);
    roots = eligibleRoots(intervalId, key, range, config.diatonicOnly, tritoneAs);
  }
  // Last resort: any interval that has a home in this key, regardless of the pool order.
  if (roots.length === 0) {
    for (const id of config.intervalPool) {
      roots = eligibleRoots(id, key, range, config.diatonicOnly, tritoneAs);
      if (roots.length > 0) {
        intervalId = id;
        break;
      }
    }
  }
  if (roots.length === 0) {
    throw new Error(`No renderable interval for key ${key.tonic} on ${clef} clef`);
  }

  const rootSpelled = pick(roots, rng);
  const targetSpelled = spellInterval(rootSpelled, intervalId, 'ascending', { tritoneAs });

  return {
    id: questionId(rng),
    mode: 'sight',
    intervalId,
    direction: 'ascending',
    playbackStyle: config.presentation,
    rootMidi: spelledToMidi(rootSpelled),
    targetMidi: spelledToMidi(targetSpelled),
    notation: { clef, key, rootSpelled, targetSpelled },
  };
}
