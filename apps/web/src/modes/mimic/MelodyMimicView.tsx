/**
 * Melody Mimic UI (Phase 6 — sing-back / tonal memory).
 *
 * The trainer plays a short, tonal, diatonic melody and the user sings it back; each note is
 * scored in cents and the round reports how many were landed ("6 / 8"). The key is established
 * with a I–IV–V–I cadence first so the line is *tonal*, not a string of random pitches.
 *
 * Flow per round: pick a friendly major key → generate a melody inside the user's vocal range →
 * play cadence + melody → "Sing it back" walks the targets with captureMelody, lighting each
 * note green as it's landed → on finish, record ONE summary attempt and show the score.
 *
 * All music logic comes from @tab-trainer/core; this component owns mic capture, playback, UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAJOR_KEYS,
  generateMelody,
  noteName,
  type KeySignature,
  type MelodyNote,
  type ProgressStore,
} from '@tab-trainer/core';
import { Play, Repeat, Mic, X, Music } from 'lucide-react';
import { playCadence, playSequence } from '../../audio/synth.js';
import { captureMelody, release } from '../../audio/pitchDetector.js';
import { MicGate } from '../sing/MicGate.js';
import { loadSettings } from '../../storage/settingsStore.js';
import './mimic.css';

interface Props {
  store: ProgressStore;
  /** Called after the recorded summary attempt so the persistent stats strip refreshes. */
  onRecord: () => void;
}

type Phase = 'mic' | 'drill';

/** Friendly, easy-to-sing major keys to draw rounds from. */
const FRIENDLY_KEYS: KeySignature[] = MAJOR_KEYS.filter((k) => ['C', 'G', 'F'].includes(k.tonic));

const DEFAULT_RANGE = { lowMidi: 48, highMidi: 72 }; // C3 .. C5
const TOLERANCE_CENTS = 50;
const HOLD_MS = 600;
const PER_NOTE_TIMEOUT_MS = 6000;
const PASS_RATIO = 0.75;

function pickKey(): KeySignature {
  return FRIENDLY_KEYS[Math.floor(Math.random() * FRIENDLY_KEYS.length)]!;
}

/** The tonic MIDI nearest the bottom of the range — what the cadence is built on. */
function tonicMidiInRange(key: KeySignature, range: { lowMidi: number; highMidi: number }): number {
  const tonicPc = ((key.fifths * 7) % 12 + 12) % 12;
  // First MIDI at or above the range floor whose pitch class is the tonic.
  for (let m = range.lowMidi; m <= range.highMidi; m++) {
    if (((m % 12) + 12) % 12 === tonicPc) return m;
  }
  return range.lowMidi;
}

type Round = { key: KeySignature; melody: MelodyNote[]; tonicMidi: number };

export function MelodyMimicView({ store, onRecord }: Props) {
  const [phase, setPhase] = useState<Phase>('mic');
  const range = useMemo(() => loadSettings().vocalRange ?? DEFAULT_RANGE, []);
  const [length, setLength] = useState(4);

  const [round, setRound] = useState<Round | null>(null);
  const [landed, setLanded] = useState<boolean[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [liveCents, setLiveCents] = useState<number | null>(null);
  const [heldRatio, setHeldRatio] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState<{ landedCount: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const newMelody = useCallback(() => {
    abortRef.current?.abort();
    const key = pickKey();
    const melody = generateMelody(key, range, length, Math.random);
    setRound({ key, melody, tonicMidi: tonicMidiInRange(key, range) });
    setLanded(melody.map(() => false));
    setActiveIndex(null);
    setLiveCents(null);
    setHeldRatio(0);
    setScore(null);
  }, [range, length]);

  // Start a round when entering the drill; regenerate when the length slider changes.
  useEffect(() => {
    if (phase !== 'drill') return;
    newMelody();
  }, [phase, newMelody]);

  // Release the mic when leaving the mode.
  useEffect(() => () => release(), []);

  const hearMelody = useCallback(async () => {
    if (round === null || capturing) return;
    setPlaying(true);
    try {
      await playCadence(round.tonicMidi);
      await playSequence(round.melody.map((n) => n.midi));
    } finally {
      setPlaying(false);
    }
  }, [round, capturing]);

  const singBack = useCallback(async () => {
    if (round === null || capturing || playing) return;
    setCapturing(true);
    setScore(null);
    setLanded(round.melody.map(() => false));
    setActiveIndex(0);
    setLiveCents(null);
    setHeldRatio(0);
    const startedAt = performance.now();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await captureMelody({
        targets: round.melody.map((n) => n.midi),
        toleranceCents: TOLERANCE_CENTS,
        holdMs: HOLD_MS,
        perNoteTimeoutMs: PER_NOTE_TIMEOUT_MS,
        onProgress: (p) => {
          setActiveIndex(p.index);
          setLiveCents(p.cents);
          setHeldRatio(p.heldRatio);
          setLanded(p.landed);
        },
        signal: ctrl.signal,
      });

      const total = round.melody.length;
      const landedCount = result.landed.filter(Boolean).length;
      const landedCents = result.centsPerNote.filter((c): c is number => c !== null);
      const avgCents =
        landedCents.length > 0
          ? landedCents.reduce((s, c) => s + Math.abs(c), 0) / landedCents.length
          : 0;

      // Record ONE summary attempt for the round (mimic mode uses P1 as a placeholder interval).
      await store.record({
        at: new Date().toISOString(),
        mode: 'mimic',
        intervalId: 'P1',
        chosenIntervalId: 'P1',
        correct: landedCount >= Math.ceil(total * PASS_RATIO),
        responseMs: Math.round(performance.now() - startedAt),
        centsError: Math.round(avgCents),
      });

      setLanded(result.landed);
      setActiveIndex(null);
      setLiveCents(null);
      setHeldRatio(0);
      setScore({ landedCount, total });
      onRecord();
    } catch {
      // AbortError (Stop / new melody) → silent reset of the live readout.
      setActiveIndex(null);
      setLiveCents(null);
      setHeldRatio(0);
    } finally {
      setCapturing(false);
      abortRef.current = null;
    }
  }, [round, capturing, playing, store, onRecord]);

  if (phase === 'mic') {
    return (
      <>
        <Header />
        <MicGate onReady={() => setPhase('drill')} />
      </>
    );
  }

  return (
    <>
      <Header />

      <div className="level">
        <div className="level__head">
          <label htmlFor="mimic-length">Melody length</label>
          <span className="level__count">
            {length} notes
          </span>
        </div>
        <input
          id="mimic-length"
          className="level__slider"
          type="range"
          min={3}
          max={8}
          step={1}
          value={length}
          disabled={capturing}
          onChange={(e) => setLength(Number(e.target.value))}
        />
      </div>

      {round && (
        <>
          <div className="player">
            <button
              type="button"
              className="btn btn--primary btn--big"
              onClick={() => void hearMelody()}
              disabled={capturing || playing}
            >
              {score || landed.some(Boolean) ? <Repeat size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              {playing ? 'Playing…' : 'Hear it again'}
            </button>
          </div>

          <p className="prompt-line">
            Sing the melody back in <strong>{round.key.tonic} major</strong>{' '}
            <span className="mono">· {round.melody.length} notes</span>
          </p>

          <div className="score-paper mimic-stage">
            <div className="mimic-dots" role="list" aria-label="Melody notes">
              {round.melody.map((note, i) => {
                const state = landed[i]
                  ? 'landed'
                  : capturing && i === activeIndex
                    ? 'active'
                    : 'idle';
                return (
                  <div key={i} className={`mimic-dot mimic-dot--${state}`} role="listitem">
                    <span className="mimic-dot__name mono">{noteName(note.midi)}</span>
                  </div>
                );
              })}
            </div>

            {capturing && (
              <div className="mimic-live">
                <span className="mimic-live__cents mono">
                  {liveCents === null
                    ? 'sing the note…'
                    : `${liveCents > 0 ? '+' : ''}${Math.round(liveCents)}¢`}
                </span>
                <div className="mimic-hold" aria-hidden>
                  <div className="mimic-hold__fill" style={{ width: `${Math.round(heldRatio * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {score ? (
            <div className="mimic-result">
              <p className="mimic-result__score">
                You landed <strong>{score.landedCount}</strong> / {score.total}
              </p>
              <div className="player">
                <button type="button" className="btn btn--ghost" onClick={() => void hearMelody()} disabled={playing}>
                  <Repeat size={18} aria-hidden /> Hear it again
                </button>
                <button type="button" className="btn btn--primary" onClick={() => newMelody()}>
                  <Music size={18} aria-hidden /> New melody
                </button>
              </div>
            </div>
          ) : (
            <div className="player">
              <button
                type="button"
                className="btn btn--primary btn--big"
                onClick={() => void singBack()}
                disabled={capturing || playing}
              >
                <Mic size={18} aria-hidden />
                {capturing ? 'Listening… sing the melody' : 'Sing it back'}
              </button>
              {capturing && (
                <button type="button" className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>
                  <X size={16} aria-hidden /> Stop
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => newMelody()}
                disabled={capturing}
              >
                <Music size={14} aria-hidden /> New melody
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Header() {
  return (
    <header className="view-head">
      <h1>Melody Mimic</h1>
      <p>Hear a short melody, then sing it back — each note lights up as you land it.</p>
    </header>
  );
}
