/**
 * Ear-training question generation and grading.
 *
 * Pure functions over an injectable RNG so the same logic is reproducible in tests and
 * reusable by any client. No audio, no DOM — a client takes a `Question`, plays it,
 * collects a choice, and calls `gradeAnswer`.
 */

import { applyInterval, intervalById, type IntervalDirection, type IntervalId } from '../theory/intervals.js';
import type { MidiNote } from '../theory/notes.js';
import type { Answer, EarTrainingConfig, Question, Rng } from './types.js';

export const DEFAULT_EAR_CONFIG: EarTrainingConfig = {
  // Start with the bread-and-butter intervals; tritone and sevenths are toggled on later.
  intervalPool: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8'],
  directions: ['ascending'],
  playbackStyle: 'melodic',
  // Comfortable middle range: C3 (48) to C5 (72). Leaves headroom for octave leaps.
  rootRange: { lowMidi: 48, highMidi: 72 },
};

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
