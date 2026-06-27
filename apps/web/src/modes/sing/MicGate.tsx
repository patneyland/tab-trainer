/**
 * Microphone-permission gate for sing mode.
 *
 * Browsers require a user gesture (and a secure context — HTTPS or localhost) before
 * getUserMedia, so nothing captures audio until the user clicks "Enable microphone". Three
 * states: idle (explain + enable), denied (how to re-enable + retry), granted (live input
 * meter from rms). Audio never leaves the device — and we say so. Rendered as a centered-in-
 * stage panel (not a modal-over-blur).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { requestMic, start, stop } from '../../audio/pitchDetector.js';

type GateState = 'idle' | 'requesting' | 'denied' | 'granted';

interface Props {
  /** Called once the mic is granted and the user is ready to drill. */
  onReady: () => void;
}

export function MicGate({ onReady }: Props) {
  const [state, setState] = useState<GateState>('idle');
  const [level, setLevel] = useState(0);
  const meterRunning = useRef(false);

  const enable = useCallback(async () => {
    setState('requesting');
    const result = await requestMic();
    if (result === 'granted') {
      setState('granted');
    } else {
      setState('denied');
    }
  }, []);

  // While granted (and previewing), show a live input-level meter from RMS.
  useEffect(() => {
    if (state !== 'granted') return;
    meterRunning.current = true;
    void start((frame) => {
      if (!meterRunning.current) return;
      // Map a small RMS range onto 0..1 for the meter bar.
      setLevel(Math.min(1, frame.rms * 6));
    });
    return () => {
      meterRunning.current = false;
      stop();
    };
  }, [state]);

  if (state === 'granted') {
    return (
      <div className="mic-gate mic-gate--granted">
        <div className="mic-gate__icon">
          <Mic size={28} aria-hidden strokeWidth={1.5} />
        </div>
        <h2 className="mic-gate__title">Microphone ready</h2>
        <p>Say or sing something — the meter should move.</p>
        <div
          className="mic-meter"
          role="meter"
          aria-label="Input level"
          aria-valuenow={Math.round(level * 100)}
        >
          <div className="mic-meter__fill" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
        <p className="mic-gate__privacy">
          <ShieldCheck size={16} aria-hidden /> Audio is analysed on your device and never leaves it.
        </p>
        <button type="button" className="btn btn--primary btn--big" onClick={onReady}>
          Start singing <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="mic-gate mic-gate--denied">
        <div className="mic-gate__icon">
          <MicOff size={28} aria-hidden strokeWidth={1.5} />
        </div>
        <h2 className="mic-gate__title">Microphone blocked</h2>
        <p>
          Sing mode needs your mic to hear the note you sing. Allow microphone access in your
          browser's site settings (the icon in the address bar), then try again.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => void enable()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mic-gate">
      <div className="mic-gate__icon">
        <Mic size={28} aria-hidden strokeWidth={1.5} />
      </div>
      <h2 className="mic-gate__title">Let's hear your voice</h2>
      <p>
        This mode plays a note, then listens to you sing the interval back and scores how close
        you land. Your browser will ask permission to use the mic.
      </p>
      <p className="mic-gate__privacy">
        <ShieldCheck size={16} aria-hidden /> Audio is analysed on your device and never leaves it.
      </p>
      <button
        type="button"
        className="btn btn--primary btn--big"
        onClick={() => void enable()}
        disabled={state === 'requesting'}
      >
        <Mic size={18} aria-hidden />
        {state === 'requesting' ? 'Requesting…' : 'Enable microphone'}
      </button>
    </div>
  );
}
