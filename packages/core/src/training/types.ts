/**
 * Shared training types.
 *
 * These describe a single question/answer cycle and are intentionally mode-agnostic: an
 * ear-training question, a sight-reading question, and a sing-the-interval question all
 * resolve to "which interval was it?" so they share one shape. The `mode` discriminant
 * lets progress reporting break results down per skill.
 */

import type { IntervalDirection, IntervalId } from '../theory/intervals.js';
import type { MidiNote } from '../theory/notes.js';
import type { KeySignature } from '../theory/keySignatures.js';
import type { SpelledNote } from '../theory/spelling.js';

export type TrainingMode = 'ear' | 'sight' | 'sing' | 'mimic' | 'harmonize';

/** How an interval is presented audibly. */
export type PlaybackStyle = 'harmonic' | 'melodic';

/** Staff clef. Sight reading starts on treble and ramps in bass. */
export type Clef = 'treble' | 'bass';

export interface EarTrainingConfig {
  /** Which intervals are eligible to be quizzed. */
  intervalPool: IntervalId[];
  /** Allowed directions for melodic playback. */
  directions: IntervalDirection[];
  playbackStyle: PlaybackStyle;
  /** Inclusive MIDI range the root note is drawn from. */
  rootRange: { lowMidi: MidiNote; highMidi: MidiNote };
}

export interface SightReadingConfig {
  /** Clefs the prompt may be rendered on. */
  clefs: Clef[];
  /** Key signatures to draw from — ramp outward along the circle of fifths. */
  keyPool: KeySignature[];
  /** Which intervals are eligible to be quizzed. */
  intervalPool: IntervalId[];
  /** Two stacked notes (harmonic) or two successive notes (melodic). */
  presentation: PlaybackStyle;
  /** Start true: only intervals whose notes both sit in the key. */
  diatonicOnly: boolean;
}

export interface SingConfig {
  /** Which intervals are eligible to be sung. */
  intervalPool: IntervalId[];
  /** Allowed directions for the sung interval. */
  directions: IntervalDirection[];
  /** From calibration — keep both root and target inside this so the user can sing both. */
  vocalRange: { lowMidi: MidiNote; highMidi: MidiNote };
  /** Pass band in cents. Default 50 (±50¢). */
  toleranceCents: number;
  /** Accept the right pitch class in any octave (recommended early — see plan Gotchas). */
  octaveAgnostic: boolean;
}

export interface Question {
  id: string;
  mode: TrainingMode;
  /** The interval the learner must identify. */
  intervalId: IntervalId;
  rootMidi: MidiNote;
  direction: IntervalDirection;
  playbackStyle: PlaybackStyle;
  /** Convenience: the second note's MIDI value. */
  targetMidi: MidiNote;
  /**
   * Sight-reading-only notation block (present when `mode === 'sight'`). Optional so
   * `mode: 'ear'` questions stay unchanged.
   */
  notation?: {
    /** Clef the notes are written on. */
    clef: Clef;
    /** Key signature drawn on the staff. */
    key: KeySignature;
    /** The lower/first note, spelled for the key. */
    rootSpelled: SpelledNote;
    /** The note an interval away, correctly spelled. */
    targetSpelled: SpelledNote;
  };
}

export interface Answer {
  questionId: string;
  chosenIntervalId: IntervalId;
  correct: boolean;
  /** Milliseconds from question presented to answer chosen. */
  responseMs: number;
}

/** A deterministic-friendly RNG: pass Math.random, or a seeded fn for tests. */
export type Rng = () => number;
