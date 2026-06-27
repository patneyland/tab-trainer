/**
 * One-time vocal-range calibration.
 *
 * "Sing your lowest comfortable note" → capture a stable pitch → "now your highest" → store
 * { lowMidi, highMidi } (rounded MIDI) via settingsStore. Re-runnable. A "use default" path
 * seeds a sane C3–C5 range so the user can skip straight into drilling. The captured range
 * feeds SingConfig.vocalRange so every generated question stays singable.
 */

import { useCallback, useRef, useState } from 'react';
import { frequencyToMidi, noteName } from '@tab-trainer/core';
import { ArrowRight, Check, X } from 'lucide-react';
import { captureStablePitch } from '../../audio/pitchDetector.js';
import { saveSettings } from '../../storage/settingsStore.js';

/** Sane fallback if the user skips calibration: C3 (48) .. C5 (72). */
export const DEFAULT_RANGE = { lowMidi: 48, highMidi: 72 };

interface Props {
  /** Called with the stored range once calibration completes (or default is chosen). */
  onDone: (range: { lowMidi: number; highMidi: number }) => void;
}

type Step = 'low' | 'high';

export function Calibration({ onDone }: Props) {
  const [step, setStep] = useState<Step>('low');
  const [lowMidi, setLowMidi] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const capture = useCallback(async () => {
    setListening(true);
    setCaptureError(null);
    setLivePitch(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const hz = await captureStablePitch(
        (frame) => setLivePitch(frame.hz > 0 ? frame.hz : null),
        ctrl.signal,
      );
      const midi = Math.round(frequencyToMidi(hz));
      if (step === 'low') {
        setLowMidi(midi);
        setStep('high');
      } else {
        // Guard against a flipped range (sang higher "low" than "high").
        const low = lowMidi ?? DEFAULT_RANGE.lowMidi;
        const range = { lowMidi: Math.min(low, midi), highMidi: Math.max(low, midi) };
        saveSettings({ vocalRange: range });
        onDone(range);
      }
    } catch (err) {
      // AbortError (user pressed Stop) → leave the step as-is, silently.
      // TimeoutError (silence/noise too long) → gentle nudge, leave the step as-is.
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        setCaptureError("Didn't catch that — try again.");
      }
    } finally {
      setListening(false);
      setLivePitch(null);
      abortRef.current = null;
    }
  }, [step, lowMidi, onDone]);

  const useDefault = useCallback(() => {
    saveSettings({ vocalRange: DEFAULT_RANGE });
    onDone(DEFAULT_RANGE);
  }, [onDone]);

  return (
    <div className="calibration">
      <h3 className="calibration__title">Calibrate your vocal range</h3>
      <p className="muted">
        We'll keep every note inside your comfortable range. Sing a steady, relaxed tone and
        hold it for about a second.
      </p>

      <ol className="calibration__steps">
        <li className={step === 'low' ? 'is-active' : lowMidi !== null ? 'is-done' : ''}>
          {lowMidi !== null && <Check size={14} aria-hidden />} Lowest comfortable note
          {lowMidi !== null && <strong> — {noteName(lowMidi)}</strong>}
        </li>
        <li className={step === 'high' ? 'is-active' : ''}>Highest comfortable note</li>
      </ol>

      <div className="calibration__prompt">
        <p>
          {step === 'low'
            ? 'Sing your lowest comfortable note.'
            : 'Now sing your highest comfortable note.'}
        </p>
        {listening && (
          <p className="muted">
            Listening… {livePitch ? `${Math.round(livePitch)} Hz` : 'hold the note steady'}
          </p>
        )}
        {captureError && !listening && <p className="muted">{captureError}</p>}
      </div>

      <div className="player">
        <button className="btn btn--primary btn--big" onClick={() => void capture()} disabled={listening}>
          {listening ? 'Listening…' : step === 'low' ? 'Capture lowest note' : 'Capture highest note'}{' '}
          {!listening && <ArrowRight size={16} aria-hidden />}
        </button>
        {listening ? (
          <button className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>
            <X size={16} aria-hidden /> Stop
          </button>
        ) : (
          <button className="btn btn--ghost" onClick={useDefault}>
            Skip / use default (C3–C5)
          </button>
        )}
      </div>
    </div>
  );
}
