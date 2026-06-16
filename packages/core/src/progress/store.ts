/**
 * The ProgressStore boundary.
 *
 * Every client persists progress through this interface and *only* this interface. The
 * web app ships with a localStorage implementation (apps/web/src/storage). When the sync
 * backend lands (see docs/backend.md), a `RemoteProgressStore` implements the same
 * methods against the API — no training or UI code changes. This is the seam that makes
 * "sign in on any device and see my progress" possible.
 */

import type { AttemptRecord, ProgressSummary } from './types.js';

export interface ProgressStore {
  /** Append one attempt to the log. */
  record(attempt: AttemptRecord): Promise<void>;
  /** All attempts, oldest first. */
  getAll(): Promise<AttemptRecord[]>;
  /** Convenience: a rolled-up summary. */
  getSummary(): Promise<ProgressSummary>;
  /** Wipe all stored attempts (e.g. a "reset progress" action). */
  clear(): Promise<void>;
}
