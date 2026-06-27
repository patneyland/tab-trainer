/**
 * Harmonize / hold-your-line mode — the most audition-authentic drill.
 *
 * Two (or more) notes sound together, but the note the singer must produce — the TARGET — is
 * played *quieter* than the rest. The user has to pick the quiet line out of the texture and
 * SUSTAIN it in tune while the louder part(s) ring. This mirrors the real audition task: "sing
 * your part while the other parts play."
 *
 * Audio: synth.playChordMix() sounds the voices with per-voice gain (target ~0.45, others 1).
 * The mic + pitchy track the *singer's* voice (monophonic), and captureSustainedMatch octave-
 * snaps to the target so a harmonic latch still reads at the right note. All music maths comes
 * from @tab-trainer/core; this component owns playback, mic capture, and UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAJOR_KEYS,
  diatonicNotes,
  intervalBetween,
  intervalById,
  midiToFrequency,
  noteName,
  spelledToMidi,
  type IntervalId,
  type ProgressStore,
  type SpelledNote,
} from '@tab-trainer/core';
import { Play, Repeat, Mic, X, Volume2 } from 'lucide-react';
import { playChordMix, playNote } from '../../audio/synth.js';
import { captureSustainedMatch, release } from '../../audio/pitchDetector.js';
import { Feedback } from '../shared/Feedback.js';
import { MicGate } from '../sing/MicGate.js';
import { TunerNeedle } from '../sing/TunerNeedle.js';
import { loadSettings } from '../../storage/settingsStore.js';
import './harmonize.css';

interface Props {
  store: ProgressStore;
  /** Called after each recorded answer so the persistent stats strip refreshes. */
  onRecord: () => void;
}

type Phase = 'mic' | 'drill';

/** A built round: a chord of voices, one of which is the (quieter) target to sustain. */
interface Round {
  /** Every voice in the chord, low → high. */
  voices: number[];
  /** MIDI of the voice the singer must find and hold (the quiet one). */
  targetMidi: number;
  /** The louder reference voice we name the held interval against (the chord root). */
  referenceMidi: number;
  /** How many voices sounded — surfaced in copy. */
  voiceCount: number;
}

/** Fallback range when the singer hasn't calibrated: C3..C5, comfortably singable. */
const DEFAULT_RANGE = { lowMidi: 48, highMidi: 72 } as const;

// Forgiving by design: holding the quiet line is the hard part, so the pitch window is generous.
const TOLERANCE_CENTS = 45;
const HOLD_MS = 1000;
const TARGET_GAIN = 0.45; // ~ −7 dB vs the background voices (spec: target audible but secondary)
const CHORD_DURATION = 2.4;

const MAX_LEVEL = 3;

function levelHint(level: number): string {
  if (level <= 1) return '2 voices · open interval, target on top';
  if (level === 2) return '2 voices · closer harmony';
  return '3-voice triad · target is an inner line';
}

/** Pick a uniformly-random element. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Build a round: choose a pleasant diatonic chord (in C major) inside the vocal range, then mark
 * one voice as the quiet TARGET. Difficulty controls voice count and which voice is the target.
 *
 *  • level 1 — two voices a 3rd/5th/6th apart, target = the upper voice (easiest to isolate).
 *  • level 2 — two voices, closer harmony (3rds), target = either voice.
 *  • level 3 — a three-note diatonic triad, target = an inner/lower voice (hardest to pick out).
 */
function buildRound(range: { lowMidi: number; highMidi: number }, level: number): Round | null {
  const key = MAJOR_KEYS.find((k) => k.tonic === 'C')!;
  // Diatonic notes inside the singable range — the pool both the chord and target are drawn from.
  const scale: SpelledNote[] = diatonicNotes(key, range.lowMidi, range.highMidi);
  const midis = [...new Set(scale.map(spelledToMidi))].sort((a, b) => a - b);
  if (midis.length < 3) return null;

  // Choose a root low enough to stack pleasant intervals above without leaving the range.
  const inRange = (m: number) => m >= range.lowMidi && m <= range.highMidi && midis.includes(m);

  for (let attempt = 0; attempt < 24; attempt++) {
    const root = pick(midis);

    if (level >= 3) {
      // Diatonic triad: root + a diatonic third + a diatonic fifth above it.
      const third = pick([root + 3, root + 4]).valueOf();
      const fifth = root + 7;
      if (!inRange(third) || !inRange(fifth)) continue;
      const voices = [root, third, fifth];
      // Target an inner/lower line (root or third) so it must be picked out of the texture.
      const targetMidi = pick([root, third]);
      const referenceMidi = voices.find((v) => v !== targetMidi)!;
      return { voices, targetMidi, referenceMidi, voiceCount: 3 };
    }

    // Two voices. Level 1 favours open intervals (5th/6th); level 2 favours closer 3rds.
    const offsets = level <= 1 ? [7, 9, 8] : [3, 4, 5];
    const offset = pick(offsets);
    const upper = root + offset;
    if (!inRange(upper)) continue;
    const voices = [root, upper];
    // Level 1: the target is the upper voice (sits above, easiest to isolate). Level 2: either.
    const targetMidi = level <= 1 ? upper : pick(voices);
    const referenceMidi = voices.find((v) => v !== targetMidi)!;
    return { voices, targetMidi, referenceMidi, voiceCount: 2 };
  }
  return null;
}

type FeedbackState = { title: string; detail: string; cents: number } | null;

export function HarmonizeView({ store, onRecord }: Props) {
  const [phase, setPhase] = useState<Phase>('mic');
  const [level, setLevel] = useState(1);
  const vocalRange = useMemo(() => loadSettings().vocalRange ?? DEFAULT_RANGE, []);

  const [round, setRound] = useState<Round | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [liveCents, setLiveCents] = useState<number | null>(null);
  const [liveHz, setLiveHz] = useState<number | null>(null);
  const [heldRatio, setHeldRatio] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [played, setPlayed] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const nextRound = useCallback(() => {
    abortRef.current?.abort();
    setCaptureError(null);
    setRound(buildRound(vocalRange, level));
    setFeedback(null);
    setLiveCents(null);
    setLiveHz(null);
    setHeldRatio(0);
    setPlayed(false);
  }, [vocalRange, level]);

  // (Re)start the drill on entering, or when the difficulty changes.
  useEffect(() => {
    if (phase !== 'drill') return;
    nextRound();
  }, [phase, nextRound]);

  // Release the mic when leaving the mode.
  useEffect(() => () => release(), []);

  const playChord = useCallback(async () => {
    if (!round) return;
    const voices = round.voices.map((midi) => ({
      midi,
      gain: midi === round.targetMidi ? TARGET_GAIN : 1,
    }));
    await playChordMix(voices, { duration: CHORD_DURATION });
    setPlayed(true);
  }, [round]);

  const playTargetAlone = useCallback(async () => {
    if (!round) return;
    await playNote(round.targetMidi, 1.2);
  }, [round]);

  const listen = useCallback(async () => {
    if (!round || feedback || capturing) return;
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
        targetHz: midiToFrequency(round.targetMidi),
        toleranceCents: TOLERANCE_CENTS,
        holdMs: HOLD_MS,
        onFrame: (f) => {
          setLiveHz(f.hz > 0 ? f.hz : null);
          setLiveCents(f.cents);
          setHeldRatio(f.heldRatio);
        },
        signal: ctrl.signal,
      });

      // Held it → success. Name the held interval from the louder reference voice to the target.
      // intervalBetween reduces mod 12, so voice order doesn't matter.
      const intervalId: IntervalId = intervalBetween(round.referenceMidi, round.targetMidi).id;
      await store.record({
        at: new Date().toISOString(),
        mode: 'harmonize',
        intervalId,
        chosenIntervalId: intervalId,
        correct: true,
        responseMs: Math.round(performance.now() - startedAt),
        centsError: cents,
      });

      setLiveCents(cents);
      setHeldRatio(1);
      setFeedback({
        title: 'Held your line!',
        detail: `${intervalById(intervalId).name} against the chord — your ${noteName(round.targetMidi)} held steady.`,
        cents,
      });
      onRecord();
    } catch (err) {
      // AbortError = Stop / Skip / unmount → silent. TimeoutError = couldn't hold it in time.
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setCaptureError('No rush — press “Sing it” and take another run at it.');
      }
      setLiveCents(null);
      setLiveHz(null);
      setHeldRatio(0);
    } finally {
      setCapturing(false);
      abortRef.current = null;
    }
  }, [round, feedback, capturing, store, onRecord]);

  // --- Gating ---------------------------------------------------------------

  if (phase === 'mic') {
    return (
      <>
        <Header />
        <MicGate onReady={() => setPhase('drill')} />
      </>
    );
  }

  // --- Drill ----------------------------------------------------------------

  return (
    <>
      <Header />

      <div className="level">
        <div className="level__head">
          <label htmlFor="harmonize-level">Difficulty</label>
          <span className="level__count">
            Level {level} of {MAX_LEVEL} · <span className="muted">{levelHint(level)}</span>
          </span>
        </div>
        <input
          id="harmonize-level"
          className="level__slider"
          type="range"
          min={1}
          max={MAX_LEVEL}
          step={1}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
        />
      </div>

      {round && (
        <>
          <div className="player">
            <button
              type="button"
              className="btn btn--primary btn--big"
              onClick={() => void playChord()}
              disabled={capturing}
            >
              {played ? <Repeat size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              {played ? 'Hear the chord again' : 'Hear the chord'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => void playTargetAlone()}
              disabled={capturing}
            >
              <Volume2 size={16} aria-hidden /> Hear my note alone
            </button>
          </div>

          <p className="prompt-line harmonize-prompt">
            Sing the <strong>quieter note</strong> and hold it{' '}
            <span className="mono">· {round.voiceCount} voices</span>
          </p>

          <div className="score-paper">
            <TunerNeedle
              centsError={feedback ? feedback.cents : liveCents}
              detectedHz={liveHz}
              targetMidi={round.targetMidi}
              heldRatio={heldRatio}
            />
          </div>

          {!feedback && (
            <div className="player">
              <button
                type="button"
                className="btn btn--primary btn--big"
                onClick={() => void listen()}
                disabled={!played || capturing}
              >
                <Mic size={18} aria-hidden />
                {capturing ? 'Listening… hold your line' : 'Sing it'}
              </button>
              {capturing && (
                <button type="button" className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>
                  <X size={16} aria-hidden /> Stop
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => nextRound()}
                disabled={capturing}
              >
                Skip
              </button>
            </div>
          )}

          {captureError && !feedback && <p className="muted harmonize-hint">{captureError}</p>}
        </>
      )}

      {feedback && (
        <Feedback
          correct
          title={feedback.title}
          onReplay={() => void playChord()}
          replayLabel="Hear the chord again"
          onNext={() => nextRound()}
        >
          <p>
            {feedback.detail}{' '}
            <span className="mono">(held within {Math.abs(Math.round(feedback.cents))}¢)</span>.
          </p>
        </Feedback>
      )}

      <div className="sing-tools">
        <span className="muted mono">
          Range {noteName(vocalRange.lowMidi)}–{noteName(vocalRange.highMidi)}
        </span>
      </div>
    </>
  );
}

function Header() {
  return (
    <header className="view-head">
      <h1>Harmonize</h1>
      <p>Two or more notes sound together — find the quieter line and hold it, just like singing your part in the audition.</p>
    </header>
  );
}
