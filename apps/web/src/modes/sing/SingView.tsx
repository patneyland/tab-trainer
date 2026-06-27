/**
 * Sing mode UI — two practice types that share the mic + tuner:
 *
 *  • "Match pitch" (default): hear a note, sing the SAME note, and HOLD it in tune. The
 *    simplest, most forgiving drill — and the best way to confirm the detector hears you.
 *  • "Sing interval": hear a root, sing the requested interval above it, and hold it.
 *
 * Both use captureSustainedMatch: you succeed by *sustaining* the note within tolerance for
 * about a second (a hold meter fills), not by a fragile quarter-second snapshot. The detected
 * pitch is octave-snapped to the target, so a harmonic latch no longer reads as "notes off".
 *
 * All music logic comes from @tab-trainer/core; this component owns mic capture, playback, UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SING_CONFIG,
  EAR_INTERVALS_BY_PRIORITY,
  generateSingQuestion,
  intervalById,
  midiToFrequency,
  noteName,
  selectNextInterval,
  type IntervalId,
  type ProgressStore,
  type Question,
  type SingConfig,
} from '@tab-trainer/core';
import { RefreshCw, Play, Repeat, Mic, X } from 'lucide-react';
import { playNote } from '../../audio/synth.js';
import { captureSustainedMatch, release } from '../../audio/pitchDetector.js';
import { Feedback } from '../shared/Feedback.js';
import { MicGate } from './MicGate.js';
import { Calibration } from './Calibration.js';
import { TunerNeedle } from './TunerNeedle.js';
import { loadSettings } from '../../storage/settingsStore.js';

interface Props {
  store: ProgressStore;
  /** Called after each recorded answer so the persistent stats strip refreshes. */
  onRecord: () => void;
}

type Phase = 'mic' | 'calibrate' | 'drill';
type Drill = 'match' | 'interval';

/** What the singer is aiming at this round. */
type Round =
  | { kind: 'match'; targetMidi: number }
  | { kind: 'interval'; question: Question };

type FeedbackState = { title: string; detail: string; cents: number } | null;

const MAX_LEVEL = EAR_INTERVALS_BY_PRIORITY.length;
// Forgiving by design: you have to *hold* the note, but the window is generous.
const MATCH_TOLERANCE = 45;
const MATCH_HOLD_MS = 1000;
const INTERVAL_TOLERANCE = 50;
const INTERVAL_HOLD_MS = 900;

function levelHint(level: number): string {
  if (level <= 7) return 'core choral set';
  if (level <= 9) return '+ sixths';
  if (level <= 11) return '+ sevenths';
  return 'every interval';
}

function poolForLevel(level: number): IntervalId[] {
  const clamped = Math.max(2, Math.min(Math.round(level), MAX_LEVEL));
  return [...EAR_INTERVALS_BY_PRIORITY.slice(0, clamped)];
}

/** A comfortable note inside the range, keeping a little headroom from the extremes. */
function pickMatchTarget(range: { lowMidi: number; highMidi: number }): number {
  const lo = Math.min(range.lowMidi + 2, range.highMidi);
  const hi = Math.max(range.highMidi - 2, range.lowMidi);
  const low = Math.min(lo, hi);
  const high = Math.max(lo, hi);
  return low + Math.floor(Math.random() * (high - low + 1));
}

export function SingView({ store, onRecord }: Props) {
  const [phase, setPhase] = useState<Phase>('mic');
  const [drill, setDrill] = useState<Drill>('match');
  const [vocalRange, setVocalRange] = useState(() => loadSettings().vocalRange ?? null);
  const [level, setLevel] = useState<number>(7);

  const range = vocalRange ?? DEFAULT_SING_CONFIG.vocalRange;
  const config: SingConfig = useMemo(
    () => ({ ...DEFAULT_SING_CONFIG, intervalPool: poolForLevel(level), vocalRange: range }),
    [level, range],
  );

  const [round, setRound] = useState<Round | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [liveCents, setLiveCents] = useState<number | null>(null);
  const [liveHz, setLiveHz] = useState<number | null>(null);
  const [heldRatio, setHeldRatio] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [refPlayed, setRefPlayed] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Derive the playable reference note and the target note from the current round.
  const refMidi = round ? (round.kind === 'match' ? round.targetMidi : round.question.rootMidi) : null;
  const targetMidi = round ? (round.kind === 'match' ? round.targetMidi : round.question.targetMidi) : null;

  const nextRound = useCallback(async () => {
    abortRef.current?.abort();
    setCaptureError(null);
    let r: Round;
    if (drill === 'match') {
      r = { kind: 'match', targetMidi: pickMatchTarget(range) };
    } else {
      try {
        const records = await store.getAll();
        const chosen = selectNextInterval(config.intervalPool, records, undefined, { mode: 'sing' });
        r = { kind: 'interval', question: generateSingQuestion({ ...config, intervalPool: [chosen] }) };
      } catch {
        r = { kind: 'interval', question: generateSingQuestion(config) };
      }
    }
    setRound(r);
    setFeedback(null);
    setLiveCents(null);
    setLiveHz(null);
    setHeldRatio(0);
    setRefPlayed(false);
  }, [drill, range, config, store]);

  // Start / restart the drill when entering, or when switching match↔interval.
  useEffect(() => {
    if (phase !== 'drill') return;
    void nextRound();
  }, [phase, nextRound]);

  // Release the mic when leaving the mode.
  useEffect(() => () => release(), []);

  const playReference = useCallback(async () => {
    if (refMidi === null) return;
    await playNote(refMidi, drill === 'match' ? 1.3 : 1.0);
    setRefPlayed(true);
  }, [refMidi, drill]);

  const listen = useCallback(async () => {
    if (round === null || targetMidi === null || feedback || capturing) return;
    const tolerance = round.kind === 'match' ? MATCH_TOLERANCE : INTERVAL_TOLERANCE;
    const holdMs = round.kind === 'match' ? MATCH_HOLD_MS : INTERVAL_HOLD_MS;
    setCapturing(true);
    setCaptureError(null);
    setLiveCents(null);
    setLiveHz(null);
    setHeldRatio(0);
    const startedAt = performance.now();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { cents } = await captureSustainedMatch({
        targetHz: midiToFrequency(targetMidi),
        toleranceCents: tolerance,
        holdMs,
        onFrame: (f) => {
          setLiveHz(f.hz > 0 ? f.hz : null);
          setLiveCents(f.cents);
          setHeldRatio(f.heldRatio);
        },
        signal: ctrl.signal,
      });

      // Held it → success. (You can only resolve by sustaining in tune.)
      const intervalId: IntervalId = round.kind === 'match' ? 'P1' : round.question.intervalId;
      await store.record({
        at: new Date().toISOString(),
        mode: 'sing',
        intervalId,
        chosenIntervalId: intervalId,
        correct: true,
        responseMs: Math.round(performance.now() - startedAt),
        centsError: cents,
      });

      setLiveCents(cents);
      setHeldRatio(1);
      setFeedback(
        round.kind === 'match'
          ? { title: 'Nailed it!', detail: `You held ${noteName(targetMidi)}`, cents }
          : {
              title: 'In tune!',
              detail: `${intervalById(round.question.intervalId).name} — ${noteName(round.question.rootMidi)} → ${noteName(targetMidi)}`,
              cents,
            },
      );
      onRecord();
    } catch (err) {
      // AbortError = Stop/advance/mode-switch → silent. TimeoutError = couldn't hold it in time.
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setCaptureError("No rush — press “Sing it” and take another run at it.");
      }
      setLiveCents(null);
      setLiveHz(null);
      setHeldRatio(0);
    } finally {
      setCapturing(false);
      abortRef.current = null;
    }
  }, [round, targetMidi, feedback, capturing, store, onRecord]);

  // --- Gating phases --------------------------------------------------------

  if (phase === 'mic') {
    return (
      <>
        <Header />
        <MicGate onReady={() => setPhase(vocalRange ? 'drill' : 'calibrate')} />
      </>
    );
  }

  if (phase === 'calibrate') {
    return (
      <>
        <Header />
        <Calibration
          onDone={(r) => {
            setVocalRange(r);
            setPhase('drill');
          }}
        />
      </>
    );
  }

  // --- Drill ----------------------------------------------------------------

  const isMatch = drill === 'match';
  const intervalForRound = round?.kind === 'interval' ? intervalById(round.question.intervalId) : null;

  return (
    <>
      <Header />

      {/* Drill-type toggle */}
      <div className="seg seg--wide" role="tablist" aria-label="Practice type">
        <button
          type="button"
          role="tab"
          aria-selected={isMatch}
          className={`seg__btn ${isMatch ? 'seg__btn--active' : ''}`}
          onClick={() => {
            if (drill !== 'match') {
              abortRef.current?.abort();
              setDrill('match');
            }
          }}
        >
          Match a pitch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isMatch}
          className={`seg__btn ${!isMatch ? 'seg__btn--active' : ''}`}
          onClick={() => {
            if (drill !== 'interval') {
              abortRef.current?.abort();
              setDrill('interval');
            }
          }}
        >
          Sing an interval
        </button>
      </div>

      {!isMatch && (
        <div className="level">
          <div className="level__head">
            <label htmlFor="sing-level">Difficulty</label>
            <span className="level__count">
              {level} of {MAX_LEVEL} intervals · <span className="muted">{levelHint(level)}</span>
            </span>
          </div>
          <input
            id="sing-level"
            className="level__slider"
            type="range"
            min={2}
            max={MAX_LEVEL}
            step={1}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </div>
      )}

      {round && targetMidi !== null && refMidi !== null && (
        <>
          <div className="player">
            <button
              type="button"
              className="btn btn--primary btn--big"
              onClick={() => void playReference()}
              disabled={capturing}
            >
              {refPlayed ? <Repeat size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              {isMatch ? (refPlayed ? 'Hear it again' : 'Hear the note') : refPlayed ? 'Play root again' : 'Play root'}
            </button>
          </div>

          <p className="prompt-line">
            {isMatch ? (
              <>
                Sing <strong>{noteName(targetMidi)}</strong> — match it and hold steady.
              </>
            ) : (
              <>
                Sing a <strong>{intervalForRound?.name}</strong> above{' '}
                <span className="mono">· root {noteName(refMidi)}</span>
              </>
            )}
          </p>

          <div className="score-paper">
            <TunerNeedle
              centsError={feedback ? feedback.cents : liveCents}
              detectedHz={liveHz}
              targetMidi={targetMidi}
              heldRatio={heldRatio}
            />
          </div>

          {!feedback && (
            <div className="player">
              <button
                type="button"
                className="btn btn--primary btn--big"
                onClick={() => void listen()}
                disabled={!refPlayed || capturing}
              >
                <Mic size={18} aria-hidden />
                {capturing ? 'Listening… hold the note' : 'Sing it'}
              </button>
              {capturing && (
                <button type="button" className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>
                  <X size={16} aria-hidden /> Stop
                </button>
              )}
              <button type="button" className="btn btn--ghost btn--small" onClick={() => void nextRound()} disabled={capturing}>
                Skip
              </button>
            </div>
          )}

          {captureError && !feedback && <p className="muted">{captureError}</p>}
        </>
      )}

      {feedback && (
        <Feedback
          correct
          title={feedback.title}
          onReplay={() => void playReference()}
          replayLabel={isMatch ? 'Hear it again' : 'Play root again'}
          onNext={() => void nextRound()}
        >
          <p>
            {feedback.detail}{' '}
            <span className="mono">
              (held within {Math.abs(Math.round(feedback.cents))}¢)
            </span>
            .
          </p>
        </Feedback>
      )}

      <div className="sing-tools">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            abortRef.current?.abort();
            setPhase('calibrate');
          }}
        >
          <RefreshCw size={14} aria-hidden /> Recalibrate range
        </button>
        {vocalRange && (
          <span className="muted mono">
            Range {noteName(vocalRange.lowMidi)}–{noteName(vocalRange.highMidi)}
          </span>
        )}
      </div>
    </>
  );
}

function Header() {
  return (
    <header className="view-head">
      <h1>Sing</h1>
      <p>Match a pitch by ear, or sing an interval — hold it in tune to score.</p>
    </header>
  );
}
