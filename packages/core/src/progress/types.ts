/**
 * Progress data model.
 *
 * One `AttemptRecord` is logged per answered question. Everything else (accuracy,
 * per-interval mastery, streaks) is derived from the attempt log, so the raw log is the
 * single source of truth — easy to sync to a backend later without lossy aggregation.
 */

import type { IntervalId } from '../theory/intervals.js';
import type { TrainingMode } from '../training/types.js';

export interface AttemptRecord {
  /** ISO 8601 timestamp of when the answer was submitted. */
  at: string;
  mode: TrainingMode;
  intervalId: IntervalId;
  chosenIntervalId: IntervalId;
  correct: boolean;
  responseMs: number;
}

export interface IntervalStat {
  intervalId: IntervalId;
  attempts: number;
  correct: number;
  /** 0-1 accuracy; 0 when there are no attempts. */
  accuracy: number;
  /** Average response time over correct answers, in ms; null when none. */
  avgResponseMs: number | null;
}

export interface ProgressSummary {
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number;
  /** Current run of consecutive correct answers, most recent first. */
  currentStreak: number;
  bestStreak: number;
  perInterval: IntervalStat[];
}

/** Roll an attempt log up into a summary. Pure, so it runs anywhere. */
export function summarize(records: AttemptRecord[]): ProgressSummary {
  const byInterval = new Map<IntervalId, { attempts: number; correct: number; totalMs: number; correctMs: number }>();
  let totalCorrect = 0;
  let bestStreak = 0;
  let running = 0;

  for (const r of records) {
    const bucket = byInterval.get(r.intervalId) ?? { attempts: 0, correct: 0, totalMs: 0, correctMs: 0 };
    bucket.attempts += 1;
    if (r.correct) {
      bucket.correct += 1;
      bucket.correctMs += r.responseMs;
      totalCorrect += 1;
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
    byInterval.set(r.intervalId, bucket);
  }

  // Current streak = trailing run of correct answers.
  let currentStreak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i]!.correct) currentStreak += 1;
    else break;
  }

  const perInterval: IntervalStat[] = [...byInterval.entries()].map(([intervalId, b]) => ({
    intervalId,
    attempts: b.attempts,
    correct: b.correct,
    accuracy: b.attempts === 0 ? 0 : b.correct / b.attempts,
    avgResponseMs: b.correct === 0 ? null : Math.round(b.correctMs / b.correct),
  }));

  return {
    totalAttempts: records.length,
    totalCorrect,
    accuracy: records.length === 0 ? 0 : totalCorrect / records.length,
    currentStreak,
    bestStreak,
    perInterval,
  };
}
