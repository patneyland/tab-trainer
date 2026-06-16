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

export type TrainingMode = 'ear' | 'sight' | 'sing';

/** How an interval is presented audibly. */
export type PlaybackStyle = 'harmonic' | 'melodic';

export interface EarTrainingConfig {
  /** Which intervals are eligible to be quizzed. */
  intervalPool: IntervalId[];
  /** Allowed directions for melodic playback. */
  directions: IntervalDirection[];
  playbackStyle: PlaybackStyle;
  /** Inclusive MIDI range the root note is drawn from. */
  rootRange: { lowMidi: MidiNote; highMidi: MidiNote };
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
