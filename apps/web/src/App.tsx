/**
 * App shell + mode navigation.
 *
 * Only Ear Training is implemented in v0.1. Sight Reading and Sing the Interval appear as
 * disabled tabs so the intended shape of the app is visible from day one — their plans
 * live in docs/modes/.
 */

import { useMemo, useState } from 'react';
import type { ProgressStore } from '@tab-trainer/core';
import { LocalProgressStore } from './storage/localProgressStore.js';
import { EarTrainingView } from './modes/earTraining/EarTrainingView.js';

type Mode = 'ear' | 'sight' | 'sing';

const TABS: { id: Mode; label: string; ready: boolean }[] = [
  { id: 'ear', label: '🎧 Ear Training', ready: true },
  { id: 'sight', label: '👁️ Sight Reading', ready: false },
  { id: 'sing', label: '🎤 Sing the Interval', ready: false },
];

export function App() {
  const [mode, setMode] = useState<Mode>('ear');
  // One store instance for the app lifetime; swap LocalProgressStore for a remote one later.
  const store: ProgressStore = useMemo(() => new LocalProgressStore(), []);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Tab Trainer</h1>
        <p className="app__tagline">Hear it. See it. Sing it.</p>
      </header>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${mode === tab.id ? 'tab--active' : ''}`}
            disabled={!tab.ready}
            onClick={() => tab.ready && setMode(tab.id)}
            title={tab.ready ? tab.label : 'Coming soon'}
          >
            {tab.label}
            {!tab.ready && <span className="tab__soon">soon</span>}
          </button>
        ))}
      </nav>

      <main className="app__main">
        {mode === 'ear' && <EarTrainingView store={store} />}
      </main>

      <footer className="app__footer muted">
        v0.1 · progress saved in this browser · sync coming in v0.4
      </footer>
    </div>
  );
}
