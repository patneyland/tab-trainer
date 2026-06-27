/**
 * Persistent stats strip (app-shell bottom row).
 *
 * Reads store.getSummary() and shows Accuracy (with a color ramp), Streak, and
 * session / total attempts as mono tabular readouts with hairline dividers. It
 * re-reads whenever `version` changes — App bumps that counter through a shared
 * refresh callback the views already call on every recorded answer.
 */

import { useEffect, useState } from 'react';
import { Target, Zap, ListChecks } from 'lucide-react';
import type { ProgressStore, ProgressSummary } from '@tab-trainer/core';

interface Props {
  store: ProgressStore;
  /** Bumped by App after each recorded answer so the strip refreshes. */
  version: number;
  /** Attempts recorded in this browser session (since mount). */
  sessionAttempts: number;
}

/** Accuracy color ramp: >=85% green, 60-84% primary, <60% warning. */
function accuracyColor(pct: number): string {
  if (pct >= 85) return 'var(--correct)';
  if (pct >= 60) return 'var(--text-primary)';
  return 'var(--warning)';
}

export function StatsStrip({ store, version, sessionAttempts }: Props) {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);

  useEffect(() => {
    let live = true;
    void store.getSummary().then((s) => {
      if (live) setSummary(s);
    });
    return () => {
      live = false;
    };
  }, [store, version]);

  const total = summary?.totalAttempts ?? 0;
  const pct = summary ? Math.round(summary.accuracy * 100) : 0;
  const streak = summary?.currentStreak ?? 0;

  return (
    <div className="stats-strip">
      <div className="stat">
        <span
          className="stat__value"
          style={total ? { color: accuracyColor(pct) } : undefined}
        >
          <Target size={16} aria-hidden />
          {total ? `${pct}%` : '—'}
        </span>
        <span className="stat__label">Accuracy</span>
      </div>

      <div className="stat">
        <span className="stat__value">
          <Zap size={16} aria-hidden />
          {streak}
        </span>
        <span className="stat__label">Streak</span>
      </div>

      <div className="stat">
        <span className="stat__value">
          <ListChecks size={16} aria-hidden />
          {sessionAttempts}
          <span className="muted" style={{ fontSize: '0.875rem' }}>
            /{total}
          </span>
        </span>
        <span className="stat__label">Session · Total</span>
      </div>

      <span className="stats-strip__note">
        v0.1 · progress saved in this browser · sync coming in v0.4
      </span>
    </div>
  );
}
