/**
 * A tuner gauge for sing/match mode, drawn on the cream score-paper stage.
 *
 * Shows the note you are ACTUALLY singing (big) with cents vs the target, an arc gauge whose
 * needle swings flat (cool, left) / sharp (warm, right) and goes green within ±IN_TUNE, the
 * target note you are aiming for, and a "hold" meter that fills as you sustain in tune. Seeing
 * the live detected note is what lets you confirm the detector is tracking your voice.
 */

import { frequencyToMidi, noteName } from '@tab-trainer/core';

interface Props {
  /** Signed cents error vs the target (+ sharp, - flat); null when no pitch is detected. */
  centsError: number | null;
  /** The live detected (octave-snapped) frequency in Hz, or null when silent. */
  detectedHz: number | null;
  /** MIDI of the note the singer is aiming for. */
  targetMidi: number;
  /** 0..1 progress toward the sustained-hold required to succeed. */
  heldRatio?: number;
}

const MAX_CENTS = 50;
const MAX_ANGLE = 60; // degrees the needle swings at ±50¢
const IN_TUNE = 15; // ±cents counted as "in tune" on the display

function arcPoint(angleDeg: number, r = 78): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

function arc(fromDeg: number, toDeg: number, r = 78): string {
  const [x1, y1] = arcPoint(fromDeg, r);
  const [x2, y2] = arcPoint(toDeg, r);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const sweep = toDeg > fromDeg ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

export function TunerNeedle({ centsError, detectedHz, targetMidi, heldRatio = 0 }: Props) {
  const clamped = centsError === null ? 0 : Math.max(-MAX_CENTS, Math.min(MAX_CENTS, centsError));
  const angle = (clamped / MAX_CENTS) * MAX_ANGLE;

  const inTune = centsError !== null && Math.abs(centsError) <= IN_TUNE;
  const state =
    centsError === null ? 'idle' : inTune ? 'in-tune' : centsError < 0 ? 'flat' : 'sharp';

  // The note the singer is currently producing (what the mic hears) — the key validation cue.
  const sungNote = detectedHz === null ? null : noteName(Math.round(frequencyToMidi(detectedHz)));
  const centsLabel =
    centsError === null ? '' : `${centsError > 0 ? '+' : ''}${Math.round(centsError)}¢`;

  const inTuneAngle = (IN_TUNE / MAX_CENTS) * MAX_ANGLE;
  const tip = arcPoint(angle, 70);

  return (
    <div className={`tuner tuner--${state}`}>
      <span className="tuner__target mono">target {noteName(targetMidi)}</span>

      <span className="tuner__readout-note">{sungNote ?? '—'}</span>
      <span className="tuner__cents">{detectedHz === null ? 'sing the note…' : centsLabel}</span>

      <svg className="tuner__gauge" viewBox="0 0 200 120" role="img" aria-label="Pitch tuner">
        <path className="tuner__arc tuner__arc--flat" d={arc(-MAX_ANGLE, -inTuneAngle)} />
        <path className="tuner__arc tuner__arc--center" d={arc(-inTuneAngle, inTuneAngle)} />
        <path className="tuner__arc tuner__arc--sharp" d={arc(inTuneAngle, MAX_ANGLE)} />

        {Array.from({ length: 11 }, (_, i) => {
          const a = (((-MAX_CENTS + i * 10) / MAX_CENTS) * MAX_ANGLE);
          const [x1, y1] = arcPoint(a, 78);
          const [x2, y2] = arcPoint(a, 70);
          return <line key={i} className="tuner__tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}

        <text className="tuner__ticklabel" x="18" y="110">♭</text>
        <text className="tuner__ticklabel" x="176" y="110" textAnchor="end">♯</text>

        <g
          className="tuner__needle-grp"
          transform={`rotate(${angle} 100 100)`}
          style={{ transformOrigin: '100px 100px', transition: 'transform 120ms cubic-bezier(0.22,0.61,0.36,1)' }}
        >
          <line
            className="tuner__needle"
            x1="100"
            y1="100"
            x2={arcPoint(0, 72)[0]}
            y2={arcPoint(0, 72)[1]}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
        <circle className="tuner__pivot" cx="100" cy="100" r="5" />
        <circle className="tuner__pivot" cx={tip[0]} cy={tip[1]} r="2.5" opacity={centsError === null ? 0 : 0.6} />
      </svg>

      {/* Hold meter — fills as you sustain the note in tune. */}
      <div className="tuner__hold" aria-hidden>
        <div className="tuner__hold-fill" style={{ width: `${Math.round(heldRatio * 100)}%` }} />
      </div>
      <p className="tuner__hz">
        {detectedHz === null ? 'waiting for your voice…' : `${Math.round(detectedHz)} Hz · hold it steady`}
      </p>
    </div>
  );
}
