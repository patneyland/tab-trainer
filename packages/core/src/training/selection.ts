/**
 * Spaced-repetition / adaptive interval selection.
 *
 * Selection was previously pure `Math.random` over the pool. This biases toward the
 * intervals a learner most needs to practise — weak (low accuracy), unseen, or stale (not
 * drilled recently) — instead of picking uniformly. It's a pure function over the existing
 * `AttemptRecord[]`, so every mode benefits with no UI change (see plan Phase 5).
 */

import type { IntervalId } from '../theory/intervals.js';
import type { AttemptRecord } from '../progress/types.js';
import type { Rng, TrainingMode } from './types.js';

interface IntervalWeightStats {
  attempts: number;
  correct: number;
  /** Index of the most recent attempt in the (filtered) log, or -1 if never seen. */
  lastSeenIndex: number;
}

/**
 * Pick the next interval to drill from `pool`, weighting toward weak/unseen/stale intervals.
 *
 * Weight per interval = 1 (base)
 *   + 2 * (1 - accuracy)        — weak intervals practised more
 *   + 3 if unseen               — surface intervals never drilled
 *   + staleness term            — small bump for intervals not seen recently
 *
 * Sampling is proportional to weight using `rng`. The result is always a member of `pool`.
 */
export function selectNextInterval(
  pool: IntervalId[],
  records: AttemptRecord[],
  rng: Rng = Math.random,
  opts: { mode?: TrainingMode } = {},
): IntervalId {
  if (pool.length === 0) throw new Error('Cannot select from an empty pool');
  if (pool.length === 1) return pool[0]!;

  const relevant = opts.mode ? records.filter((r) => r.mode === opts.mode) : records;

  const stats = new Map<IntervalId, IntervalWeightStats>();
  relevant.forEach((r, index) => {
    const bucket = stats.get(r.intervalId) ?? { attempts: 0, correct: 0, lastSeenIndex: -1 };
    bucket.attempts += 1;
    if (r.correct) bucket.correct += 1;
    bucket.lastSeenIndex = index;
    stats.set(r.intervalId, bucket);
  });

  const total = relevant.length;
  const weights = pool.map((id) => {
    const s = stats.get(id);
    if (!s || s.attempts === 0) {
      // Unseen: base + the full unseen bonus + max staleness.
      return 1 + 3 + 1;
    }
    const accuracy = s.correct / s.attempts;
    // Staleness: 0 (just seen) .. ~1 (seen long ago), based on questions since last seen.
    const sinceLastSeen = total - 1 - s.lastSeenIndex;
    const staleness = total <= 1 ? 0 : Math.min(1, sinceLastSeen / total);
    return 1 + 2 * (1 - accuracy) + staleness;
  });

  const sum = weights.reduce((a, b) => a + b, 0);
  let threshold = rng() * sum;
  for (let i = 0; i < pool.length; i++) {
    threshold -= weights[i]!;
    if (threshold < 0) return pool[i]!;
  }
  // Floating-point fallback: return the last item.
  return pool[pool.length - 1]!;
}
