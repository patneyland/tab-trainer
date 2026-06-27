/**
 * App shell — "Conservatory Console" layout.
 *
 * grid: topbar across the top, a 72px mode rail down the left, the active view in
 * a centered stage, and a persistent 64px stats strip pinned to the bottom. All
 * three modes (Ear, Sing, Sight-read) share one ProgressStore; the StatsStrip
 * refreshes whenever a view reports a recorded answer through `onRecord`.
 */

import { useCallback, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Ear, Mic, Music2, AudioLines, Layers, Settings2 } from 'lucide-react';
import type { ProgressStore } from '@tab-trainer/core';
import { LocalProgressStore } from './storage/localProgressStore.js';
import { EarTrainingView } from './modes/earTraining/EarTrainingView.js';
import { SightReadingView } from './modes/sightReading/SightReadingView.js';
import { SingView } from './modes/sing/SingView.js';
import { MelodyMimicView } from './modes/mimic/MelodyMimicView.js';
import { HarmonizeView } from './modes/harmonize/HarmonizeView.js';
import { StatsStrip } from './modes/shared/StatsStrip.js';

type Mode = 'ear' | 'sight' | 'sing' | 'mimic' | 'harmonize';

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: 'ear', label: 'Ear', icon: Ear },
  { id: 'sing', label: 'Sing', icon: Mic },
  { id: 'mimic', label: 'Mimic', icon: AudioLines },
  { id: 'harmonize', label: 'Blend', icon: Layers },
  { id: 'sight', label: 'Sight', icon: Music2 },
];

export function App() {
  const [mode, setMode] = useState<Mode>('ear');
  // One store instance for the app lifetime; swap LocalProgressStore for a remote one later.
  const store: ProgressStore = useMemo(() => new LocalProgressStore(), []);

  // Shared refresh signal: views call onRecord() after each store.record(), which
  // bumps the version (re-reads the strip) and the session attempt counter.
  const [version, setVersion] = useState(0);
  const [sessionAttempts, setSessionAttempts] = useState(0);
  const onRecord = useCallback(() => {
    setVersion((v) => v + 1);
    setSessionAttempts((n) => n + 1);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1 className="wordmark">
          Tab <em>Trainer</em>
        </h1>
        <div className="topbar__right">
          <span className="topbar__tagline">Hear it. See it. Sing it.</span>
        </div>
      </header>

      <nav className="mode-rail" aria-label="Training modes">
        {MODES.map(({ id, label, icon: Icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              className={`rail-item ${active ? 'rail-item--active' : ''}`}
              aria-pressed={active}
              aria-current={active ? 'page' : undefined}
              title={`${label} training`}
              onClick={() => setMode(id)}
            >
              <Icon size={24} aria-hidden strokeWidth={1.5} />
              <span className="rail-item__label">{label}</span>
            </button>
          );
        })}

        <span className="mode-rail__spacer" />

        <button
          type="button"
          className="rail-item"
          title="Settings (coming soon)"
          aria-label="Settings"
          disabled
        >
          <Settings2 size={24} aria-hidden strokeWidth={1.5} />
          <span className="rail-item__label">Set</span>
        </button>
      </nav>

      <main className="stage">
        <div className="stage__col">
          {mode === 'ear' && <EarTrainingView store={store} onRecord={onRecord} />}
          {mode === 'sight' && <SightReadingView store={store} onRecord={onRecord} />}
          {mode === 'sing' && <SingView store={store} onRecord={onRecord} />}
          {mode === 'mimic' && <MelodyMimicView store={store} onRecord={onRecord} />}
          {mode === 'harmonize' && <HarmonizeView store={store} onRecord={onRecord} />}
        </div>
      </main>

      <StatsStrip store={store} version={version} sessionAttempts={sessionAttempts} />
    </div>
  );
}
