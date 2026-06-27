/**
 * Sight-reading difficulty ramp.
 *
 * The question generator itself (`generateSightReadingQuestion`, `DEFAULT_SIGHT_CONFIG`,
 * `CLEF_RANGE`) lives in `session.ts` alongside ear-training generation and `gradeAnswer`.
 * This module owns the *learning progression*: an ordered list of stages and the helpers a
 * single difficulty slider uses to walk them. It imports from session.ts (one direction
 * only) so the import graph stays acyclic.
 */

import { INTERVALS, type IntervalId } from '../theory/intervals.js';
import { MAJOR_KEYS, type KeySignature } from '../theory/keySignatures.js';
import type { SightReadingConfig } from './types.js';

const CORE_INTERVALS: IntervalId[] = ['m3', 'M3', 'P5', 'P8'];
const ALL_SIMPLE: IntervalId[] = ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];

/** Major keys whose circle-of-fifths position is within `maxFifths` of C (the ramp axis). */
function keysWithin(maxFifths: number): KeySignature[] {
  return MAJOR_KEYS.filter((k) => Math.abs(k.fifths) <= maxFifths);
}

/**
 * The learning progression from docs/modes/sight-reading.md, expressed as ordered stages.
 * A single difficulty slider walks them: start narrow (treble, C major, the easiest
 * intervals), then widen the interval set, add bass clef, and ramp key signatures outward
 * along the circle of fifths. Every stage stays diatonic — chromatic spelling is a later mode.
 */
export const SIGHT_STAGES: { config: SightReadingConfig; hint: string }[] = [
  { hint: 'C major · 3rds, 5ths, octaves', config: { clefs: ['treble'], keyPool: keysWithin(0), intervalPool: CORE_INTERVALS, presentation: 'melodic', diatonicOnly: true } },
  { hint: 'C major · all intervals', config: { clefs: ['treble'], keyPool: keysWithin(0), intervalPool: ALL_SIMPLE, presentation: 'melodic', diatonicOnly: true } },
  { hint: '+ bass clef', config: { clefs: ['treble', 'bass'], keyPool: keysWithin(0), intervalPool: ALL_SIMPLE, presentation: 'melodic', diatonicOnly: true } },
  { hint: '+ one sharp / flat (G, F)', config: { clefs: ['treble', 'bass'], keyPool: keysWithin(1), intervalPool: ALL_SIMPLE, presentation: 'melodic', diatonicOnly: true } },
  { hint: '+ D, B♭', config: { clefs: ['treble', 'bass'], keyPool: keysWithin(2), intervalPool: ALL_SIMPLE, presentation: 'melodic', diatonicOnly: true } },
  { hint: '+ A, E♭', config: { clefs: ['treble', 'bass'], keyPool: keysWithin(3), intervalPool: ALL_SIMPLE, presentation: 'melodic', diatonicOnly: true } },
  { hint: '+ E, A♭', config: { clefs: ['treble', 'bass'], keyPool: keysWithin(4), intervalPool: ALL_SIMPLE, presentation: 'melodic', diatonicOnly: true } },
  { hint: 'every key signature', config: { clefs: ['treble', 'bass'], keyPool: keysWithin(7), intervalPool: ALL_SIMPLE, presentation: 'melodic', diatonicOnly: true } },
];

export const MAX_SIGHT_LEVEL = SIGHT_STAGES.length;
export const DEFAULT_SIGHT_LEVEL = 1;

/** The config for a difficulty level (1-based, clamped into range). */
export function sightConfigForLevel(level: number): SightReadingConfig {
  const clamped = Math.max(1, Math.min(Math.round(level), MAX_SIGHT_LEVEL));
  return SIGHT_STAGES[clamped - 1]!.config;
}

/** The one-line hint shown next to a difficulty level. */
export function sightHintForLevel(level: number): string {
  const clamped = Math.max(1, Math.min(Math.round(level), MAX_SIGHT_LEVEL));
  return SIGHT_STAGES[clamped - 1]!.hint;
}

/** Interval choices for a config's pool, in ascending-semitone order for natural button layout. */
export function sightChoices(config: SightReadingConfig) {
  const pool = new Set(config.intervalPool);
  return INTERVALS.filter((i) => pool.has(i.id));
}
