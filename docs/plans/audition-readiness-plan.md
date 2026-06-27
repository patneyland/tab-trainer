# Build Plan — Audition Readiness (Sing first, then the functional pivot)

**Audience:** an engineering agent executing this end-to-end.
**Why this plan exists:** research into the actual Tabernacle Choir audition (the official
June 2025 Application Guide) and into aural-skills pedagogy (Karpinski, Gordon, Demorest &
May, Sheldon) found that the app's current strength — *isolated, out-of-context interval
recognition* — is the **weakest** of the audition-relevant skills. The audition's decisive
components are **singing in tune, pitch-matching, tonal memory, and sight-singing**, all
*functional and key-anchored*. This plan closes that gap, **starting with the one
audition-critical capability that isn't built at all: singing + microphone pitch detection.**

**Design rules:** [../ARCHITECTURE.md](../ARCHITECTURE.md) — all music logic stays in
`packages/core` (no DOM, no audio, no mic). Microphone capture, pitch detection, and the
tuner UI are **web-app concerns** and live only in `apps/web`, exactly as `audio/synth.ts`
and VexFlow already do.

**Mode design overview:** [../modes/sing-the-interval.md](../modes/sing-the-interval.md)
(the outline this plan operationalizes).

---

## The work, in priority order

1. **Phase 1 — Sing the Interval (mic + pitch detection).** v0.3. The headline fix. ← start here
2. **Phase 2 — Functional / tonal context for ear training.** Anchor every prompt to a key.
3. **Phase 3 — Sight-SINGING** (fuse the staff with mic scoring).
4. **Phase 4 — The real Phase-2 audition task types** (tonal memory, major/minor, find the tonic…).
5. **Phase 5 — Spaced repetition / adaptive selection.**

Phases 2–5 are sketched at the end; **Phase 1 is specified in full.** Do Phase 1 first and
ship it before starting the others.

---

# PHASE 1 — Sing the Interval 🎤 (v0.3)

## Goal

Hear a root pitch, sing the requested interval, and get scored on how close you land — in
cents — with a live tuner needle. Record the attempt so per-interval stats show **where the
learner sings flat/sharp**, not just pass/fail.

## Definition of done

- [ ] Sing tab is enabled in [apps/web/src/App.tsx](../../apps/web/src/App.tsx) and runs a working drill.
- [ ] One-time **vocal-range calibration** (sing lowest → highest) persists locally.
- [ ] A question plays the root, prompts "sing a **P5** above," captures the mic, and scores cents error.
- [ ] A live tuner needle shows flat ◀ in-tune ▶ sharp while the user sings.
- [ ] Answering records an `AttemptRecord` with `mode: 'sing'`; the stats footer updates.
- [ ] New **core** logic (question generation + sung-pitch grading) is covered by `node --test`.
- [ ] `npm run build` and `npm test` pass; `npm run dev` shows the mode working end-to-end.

Work in dependency order. **Phases 1.1–1.2 are pure core (testable headless); do them first.**

---

## Phase 1.1 — Core: the sung-pitch data-model seam (the hard part)

The existing model assumes a **discrete choice**: `gradeAnswer` does
`correct = chosenIntervalId === question.intervalId`, and `AttemptRecord` stores a
`chosenIntervalId`. Singing produces a **continuous pitch**, not a button press. Resolve this
without breaking ear/sight by mapping the sung pitch back onto the existing interval-shaped
record and adding one optional field.

### 1.1a — `SingConfig` + extend `Question`/`AttemptRecord` — `training/types.ts` & `progress/types.ts`

```ts
// training/types.ts
export interface SingConfig {
  intervalPool: IntervalId[];
  directions: IntervalDirection[];
  /** From calibration — keep both root and target inside this. */
  vocalRange: { lowMidi: MidiNote; highMidi: MidiNote };
  /** Pass band in cents. Default 50 (±50¢). */
  toleranceCents: number;
  /** Accept the right pitch class in any octave (recommended early — see Gotchas). */
  octaveAgnostic: boolean;
}
```

`Question` already carries everything a sing question needs (`intervalId`, `rootMidi`,
`targetMidi`, `direction`). Reuse it with `mode: 'sing'`; set `playbackStyle: 'melodic'`
(unused but required). **Do not** add a notation block.

Add **one optional** field to `AttemptRecord` so sing feedback/stats are richer without
touching ear/sight:

```ts
// progress/types.ts
export interface AttemptRecord {
  // ...existing fields unchanged...
  /** Sing mode only: signed cents error of the sung pitch vs the target (+ = sharp). */
  centsError?: number;
}
```

Keep it optional so `summarize()` and existing tests are unaffected. (Optionally surface an
`avgCentsError` later; not required for DoD.)

### 1.1b — `generateSingQuestion` — `training/session.ts`

```ts
export const DEFAULT_SING_CONFIG: SingConfig;            // core choral intervals, ascending, ±50¢
export function generateSingQuestion(config: SingConfig, rng?: Rng): Question;
```

- Pick interval + direction from the pools.
- Pick a `rootMidi` such that **both** the root and the target land inside `vocalRange`
  (mirror the `safeLow`/`safeHigh` clamp in `generateEarTrainingQuestion`, but clamp to the
  *vocal* range, not the listening range — you must be able to sing both notes).
- Reuse `earConfigForLevel`'s priority ordering for a difficulty slider
  (`EAR_INTERVALS_BY_PRIORITY` is already exported and choir-weighted — share it).

### 1.1c — `gradeSungPitch` — `training/session.ts` (pure, the key new function)

```ts
export interface SungResult {
  answer: Answer;          // questionId, chosenIntervalId, correct, responseMs
  centsError: number;      // signed: + sharp, - flat
  detectedMidi: number;    // nearest-MIDI of the sung pitch (fractional ok)
}

export function gradeSungPitch(
  question: Question,
  detectedHz: number,
  responseMs: number,
  opts: { toleranceCents: number; octaveAgnostic: boolean },
): SungResult;
```

Algorithm (no DOM — just math over the detected Hz the client hands in):
1. `targetHz = midiToFrequency(question.targetMidi)`.
2. `centsError = 1200 * log2(detectedHz / targetHz)`. If `octaveAgnostic`, fold onto the
   nearest octave first: reduce the cents difference modulo 1200 into `[-600, 600]`.
3. `correct = abs(centsError) <= toleranceCents`.
4. **Map back to an interval** so per-interval stats stay meaningful: take the nearest MIDI
   to the sung pitch and `chosenIntervalId = intervalBetween(question.rootMidi, sungMidi)`
   (already in `intervals.ts`). This makes "you keep singing a m6 when asked for a M6"
   visible in the existing per-interval breakdown.
5. Return `{ answer, centsError, detectedMidi }`. The client logs an `AttemptRecord` with
   `mode: 'sing'`, the existing fields, **plus `centsError`**.

**Tests (`session.sing.test.ts`, `node:test` like the others):**
- Exact target Hz → `centsError ≈ 0`, `correct true`.
- +49¢ / +51¢ around a ±50 tolerance → pass / fail boundary.
- `octaveAgnostic`: target one octave high → still correct; with it off → fail.
- `chosenIntervalId` reflects the *sung* interval (e.g. sing a P4 when asked for P5).
- `generateSingQuestion` with a seeded RNG keeps both notes inside `vocalRange`.

Export all new symbols from [packages/core/src/index.ts](../../packages/core/src/index.ts).

---

## Phase 1.2 — Web: mic capture + pitch detection (apps/web only)

### 1.2a — Dependency

```bash
npm install pitchy --workspace apps/web
```

`pitchy` (McLeod Pitch Method) is monophonic-voice-accurate and returns a **clarity** score
for gating silence/noise. Do **not** add it to `packages/core`.

### 1.2b — `audio/pitchDetector.ts` — the capture pipeline

```
getUserMedia({audio}) → MediaStreamSource → AnalyserNode → pitchy
  → { hz, clarity } per frame → gate on clarity → smooth → stable? → hand hz to core
```

- Lazy-init like `synth.ts` (mic needs a user gesture + secure context: HTTPS or localhost).
- Expose `start()`, `stop()`, and a subscribe/callback emitting `{ hz, clarity }` per `rAF`.
- **Gate** on a clarity threshold (~0.9) so silence/consonants don't register.
- **Stability gate before scoring:** only finalize once the detected pitch holds within
  ~±30¢ for ~300–500 ms, so a scoop up to the note isn't penalized. Hand that stable Hz to
  `gradeSungPitch`.
- Add a `playNote` cross-import: **stop the reference tone before scoring** so the synth
  isn't detected as the voice.

### 1.2c — Vocal-range calibration + a tiny settings store

Singing must stay in range, so this is the **first per-user state beyond progress**.

- `storage/settingsStore.ts`: localStorage doc (key `tab-trainer:settings:v1`) holding
  `{ vocalRange?: { lowMidi; highMidi } }`. Same "swap for remote later" shape as
  `LocalProgressStore` — this foreshadows the v0.4 backend storing a user-settings document.
- Calibration flow (one-time, re-runnable from a "recalibrate" link): "sing your lowest
  comfortable note" → detect a stable pitch → "now your highest" → store the range. Seed
  `SingConfig.vocalRange` from it; fall back to a sane default (e.g. C3–C5) if unset.

### 1.2d — UI: `apps/web/src/modes/sing/`

- **Mic-permission gate** with a clear prompt and a graceful denied state.
- `<TunerNeedle centsError detectedHz />` — flat ◀ | ▶ sharp, green inside tolerance.
- `<SingView store={store}>` — mirror `EarTrainingView`'s state machine: generate → play
  root (reuse `synth.playNote`) → "Sing a **P5** above" → capture → stabilize →
  `gradeSungPitch` → `store.record({ mode: 'sing', centsError, ... })` → feedback → next.
- Reuse the shared `<Feedback>` panel from `modes/shared/`. The answer is sung, not clicked,
  so there are **no `<IntervalChoices>` buttons** here — the needle + cents readout replace them.
- Difficulty slider reusing the `EAR_INTERVALS_BY_PRIORITY` ordering.

### 1.2e — Enable the tab

In [App.tsx](../../apps/web/src/App.tsx): flip the `sing` tab to `ready: true`, import and
render `<SingView store={store} />` when `mode === 'sing'`. The shared `store` already routes
by `mode`, so the stats footer aggregates sing attempts automatically.

---

## Phase 1.3 — Verify

- [ ] `npm test` — new core tests (`session.sing.test.ts`) pass.
- [ ] `npm run build` — core + web compile.
- [ ] `npm run dev` (over localhost so `getUserMedia` works): calibrate range; sing a few
      intervals; confirm the needle tracks pitch, cents scoring feels right, attempts log,
      and the per-interval breakdown shows sung-vs-asked intervals.

## Phase 1 gotchas

- **Secure context:** `getUserMedia` needs HTTPS or `localhost`. Vite dev is localhost — fine.
- **Octave errors** are *the* classic pitch-detection failure (a detected harmonic). Pitchy's
  clarity score + the vocal-range clamp + `octaveAgnostic` scoring early all mitigate it.
- **Reference-tone bleed:** stop the synth before scoring the voice (see 1.2b).
- **Don't leak the mic into core.** All capture/detection is `apps/web`; core only does math
  on a number you pass it. This keeps `gradeSungPitch` headless-testable.
- **Keep `AttemptRecord.centsError` optional** so ear/sight records and `summarize()` tests
  are untouched.
- **Mobile mics / AGC** vary; don't over-trust a tight tolerance — default ±50¢, make it
  configurable.

---

# BEYOND SINGING — Phases 2–5 (sketches; plan in full when Phase 1 ships)

These address the rest of the research findings: the audition is *functional and tonal*, and
isolated interval drilling transfers poorly. Each is a separate PR.

## Phase 2 — Functional / tonal context for ear training

**Why:** Karpinski — *"little connection between identifying intervals acontextually and in a
tonal context."* Every real audition task has a tonic.

- Core: `establishKey` helper + a `FunctionalEarConfig` (key, scale-degree pool). The answer
  vocabulary becomes **scale degree / movable-do solfège (1–7 / do–re–mi)**, *not* interval
  names — this is a genuine fork from the `IntervalId`-based record, so introduce a
  `ScaleDegree` answer type and a parallel attempt shape (or generalize `AttemptRecord`'s
  answer to a union). Decide this seam deliberately; it's the one real schema change.
- Web: before each question, play a **I–IV–V–I cadence** or sustain a **tonic drone**
  (extend `synth.ts`); answer on a scale-degree / solfège pad.
- Keep the current isolated-interval ear drill as an explicit *secondary* mode.

## Phase 3 — Sight-SINGING (fuse Phase 1 + the staff)

**Why:** the audition asks you to *sing* a line, not silently name the interval on it.

- Reuse `StaffView` (render a short diatonic line) + the Phase 1 mic pipeline: the user
  **sings the notes**, scored per-note in cents. Add rhythm-first / pitch-only practice modes.

## Phase 4 — The real Phase-2 assessment task types

The official Music Skills Assessment maps almost 1:1 onto trainable modules — build them as
new modes (each a small generator in core + a view in web):

- **Tonal memory** — block chord then arpeggio; "which note (1st–4th) changed?"
- **Melody-in-texture** — is the melody the top / middle / bottom voice?
- **Major/minor discrimination** — classify chords/phrases.
- **Find the tonal center** — given chords then 3 tones, pick the key tone.
- **Pitch-vs-rhythm error detection** — hear vs. read 4 bars, flag the differing measures.
- **Written theory quiz** — scales, key signatures, triads, rhythm/rest values, intervals.

## Phase 5 — Spaced repetition / adaptive selection

**Why:** selection is currently pure `Math.random`. The attempt log already records
per-interval accuracy and response time — feed it back in.

- Core: a `selectNext(records, pool)` that weights toward weak/slow/overdue items
  (per-item difficulty/stability, SM/FSRS-style) instead of uniform random. Pure function
  over the existing `AttemptRecord[]`; every mode benefits with no UI change.

## Phase 6 — Melody mimic (sing-back / tonal memory)  ← requested

**Why:** the audition's Phase-3 **"musical memory"** task is literally hear-retain-reproduce,
and Phase-2 **tonal memory** is the same skill. This is the highest-value next sing feature.

- Flow: play a short melody (start ~4 notes, ramp to **8**), the user **sings it back**; score
  each note in cents and report how many were landed (e.g. "6 / 8"). Establish the key first
  (tonic/cadence) so it's tonal, not random pitches; draw melodies diatonically from a key and
  the user's vocal range.
- Build on what now exists: `synth.playNote`/`playCadence` for playback, and the hardened
  `pitchDetector` — generalise `captureSustainedMatch` into a **multi-note** capture that walks
  a target sequence, advancing each time a note is held briefly in tune (octave-snapped to the
  current target). Core: a small `generateMelody(key, range, length, rng)` returning MIDI +
  spellings; record an `AttemptRecord` per note (or a summary) under a new `mode: 'mimic'`.
- UI: light up the notes as you nail them; a "play again" and "octave-shift to my range" control.

## Phase 7 — Harmonize / hold-your-line (match the quieter note)  ← requested

**Why:** maps **directly** onto the audition's decisive Phase-3 task — *sing your line while
the other three parts play* — and Phase-2 **melody-in-texture**. This is the most
audition-authentic drill of all.

- Flow: play **two (later three/four) notes together**, with the **target note quieter** than
  the rest; the user must find and **sustain the quieter line** while the louder part(s) sound.
  Score by holding the target in tune against the distractor(s).
- Build: extend `synth.ts` to play a **mix with per-note gain** (target at lower amplitude);
  reuse `captureSustainedMatch` with `targetHz` = the quiet note. The detector must reject the
  louder pitch — lean on octave-snap-to-target + median smoothing already added, and tune the
  gain ratio so the quiet note is audible but secondary (start ~target −6 dB).
- Progression: 2 notes → full triad/4-part; target moves between soprano/alto/tenor/bass lines;
  optionally drop the target's sound mid-hold so the user must keep their pitch unaided
  (a-cappella-against-parts, exactly the audition's second sight-singing format).
- Gotcha: with multiple simultaneous pitches, a monophonic detector (pitchy) tracks the
  *singer's* voice via the mic, not the playback — keep playback in the speakers and the voice
  in the mic; if echo bleeds, the existing "stop reference before scoring" pattern and a short
  in-tune hold mitigate it.

---

## Sequencing notes

- Phase 1 ships independently and is the highest-leverage single change (the only
  audition-critical skill with **zero** current coverage).
- Phase 2's scale-degree answer type is the one schema decision worth pausing on — it's why
  it's a separate phase, not folded into Phase 1.
- Update [../ROADMAP.md](../ROADMAP.md) as each phase lands (v0.3 = Phase 1; fold 2–5 into a
  reframed v0.5 "audition readiness").
