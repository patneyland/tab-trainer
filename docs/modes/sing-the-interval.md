# Mode: Sing the Interval 🎤 (v0.3 — planned, not built)

**Skill trained:** *producing* an interval with your voice, not just recognizing it. Hear a
root pitch, sing the requested interval above (or below) it, and get scored on how close you
land — the most audition-relevant skill of the three.

> Status: **outline only.** Nothing here is implemented. This mode introduces the only new
> device capability in the project: **microphone access + pitch detection.**

## Flow
1. `generateSingQuestion(config)` picks an interval, direction, and a root note **inside the
   user's vocal range** (configurable per user — see below).
2. Play the root pitch (reuse `audio/synth.ts`).
3. Prompt: "Sing a **perfect fifth** above." Optionally show a countdown.
4. Capture mic audio, detect the sung fundamental frequency in real time.
5. Compare the (stable) sung pitch to the target; score by cents error.
6. Log an `AttemptRecord` with `mode: 'sing'` (`correct` = within tolerance).

## Pitch detection

### Library options
- **[`pitchy`](https://github.com/ianprime0509/pitchy)** — small, McLeod Pitch Method,
  good accuracy for monophonic voice. **Recommended default.**
- Hand-rolled **autocorrelation** over `AnalyserNode.getFloatTimeDomainData` — no dependency,
  more tuning work. Good fallback / learning exercise.
- `AudioWorklet` for lower-latency processing if the main-thread approach stutters.

### Pipeline
```
getUserMedia({ audio }) ─▶ MediaStreamSource ─▶ AnalyserNode ─▶ pitchy
        ─▶ frequency + clarity ─▶ smooth/debounce ─▶ MIDI + cents ─▶ compare to target
```
- Require a **clarity threshold** (pitchy returns one) to ignore silence/noise.
- Smooth over a short window; only score once the pitch is **stable** for ~300–500 ms so a
  scoop up to the note doesn't get penalized.
- Convert detected Hz → nearest MIDI + cents offset; compare against `targetMidi`.

## Scoring
- `centsError = 1200 * log2(detectedHz / targetHz)`.
- Suggested bands: **±25¢ excellent**, **±50¢ pass**, beyond that a miss.
- `correct` (for `AttemptRecord`) = within the pass tolerance.
- Show a live tuner-style needle: flat ◀ in-tune ▶ sharp.

## Vocal range / config
Singing must stay in the user's range, so this mode needs a one-time **range calibration**:
```ts
interface SingConfig {
  intervalPool: IntervalId[];
  directions: IntervalDirection[];
  vocalRange: { lowMidi: MidiNote; highMidi: MidiNote }; // from calibration
  toleranceCents: number;   // default 50
  octaveAgnostic: boolean;  // accept the right pitch class in any octave?
}
```
- Calibration: "sing your lowest comfortable note … your highest" → store the range.
- This is the first piece of **per-user state beyond progress**, so it nudges the v0.4 backend
  to also store a small user-settings document.

## UI (`apps/web/src/modes/sing/`)
- Mic-permission gate with a clear prompt (browsers require a user gesture).
- Big target display + live tuner needle + cents readout.
- Reuse the feedback/next-question pattern from the other modes.

## Gotchas
- **Mic permission & secure context:** `getUserMedia` needs HTTPS (or `localhost`).
- **Octave errors** are the classic pitch-detection failure (detecting a harmonic). Pitchy's
  clarity score plus range constraints mitigate this; consider `octaveAgnostic` scoring early.
- **Latency / echo:** play the root, then *stop* playback before scoring the voice so the
  reference tone isn't detected as the sung pitch.
- **Mobile mics & AGC** vary a lot — test on real devices before trusting tolerances.
