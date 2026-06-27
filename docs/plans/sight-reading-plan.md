# Build Plan — Sight Reading Mode (v0.2)

**Audience:** an engineering agent executing this end-to-end.
**Design overview (read first):** [../modes/sight-reading.md](../modes/sight-reading.md)
**Architecture rules:** [../ARCHITECTURE.md](../ARCHITECTURE.md) — keep all music logic in
`packages/core` (no DOM/audio there); the web app is just a client.

## Goal

A learner sees **two notes on a staff**, in a chosen **key signature and clef**, and names
the interval. The notes must be **spelled correctly for the key** (a m3 above C is E♭, not
D♯). Grading, progress, and the answer UI **reuse the existing ear-training flow** —
`gradeAnswer`, `AttemptRecord`, `ProgressStore`, and the choice-button grid all already carry
a `mode` discriminant, so per-mode stats come for free.

## Definition of done

- [ ] Sight Reading tab is enabled in [apps/web/src/App.tsx](../../apps/web/src/App.tsx) and renders a working drill.
- [ ] A staff renders one clef + key signature + two correctly-spelled notes.
- [ ] Answering records an `AttemptRecord` with `mode: 'sight'`; stats update.
- [ ] Key-signature selector + difficulty (interval pool) control, mirroring ear training's slider.
- [ ] New core logic is covered by `node --test` tests (see Phase 1).
- [ ] `npm run build` and `npm test` both pass; `npm run dev` shows the mode working.

Work in dependency order. **Phases 1–2 are pure core (testable headless); do them first.**

---

## Phase 0 — Dependency

```bash
npm install vexflow --workspace apps/web
```

VexFlow is the notation engraver (SVG/Canvas, framework-agnostic). Pin the installed major
version in the plan's PR description. Do **not** add it to `packages/core` — core stays
DOM-free; rendering is a web-app concern.

---

## Phase 1 — Note spelling in core (the hard part)

All new files under `packages/core/src/theory/`. Export everything new from
[packages/core/src/index.ts](../../packages/core/src/index.ts).

### 1a. `SpelledNote` type + MIDI bridge — `spelling.ts`

The canonical pitch identity is MIDI ([notes.ts](../../packages/core/src/theory/notes.ts)); a *spelling* adds a
letter + accidental so notation is unambiguous.

```ts
export interface SpelledNote {
  letter: Letter;       // 'C'..'B'  (reuse LETTERS from notes.ts)
  alteration: number;   // -2..+2 semitones (negative = flats)
  octave: number;       // scientific pitch, C4 = middle C
}

export function spelledToMidi(n: SpelledNote): MidiNote;   // wrap midiFromParts()
export function spelledName(n: SpelledNote): string;       // "Eb4", "F#5" — for feedback text
```

### 1b. Generic interval size + quality on the interval table

To spell a target you need the interval's **letter-step count** (its generic number), not
just semitones. Extend `Interval` in [intervals.ts](../../packages/core/src/theory/intervals.ts):

```ts
// add to the Interval interface
degree: number;   // generic size: P1=1, 2nds=2, 3rds=3, P4=4, P5=5, 6ths=6, 7ths=7, P8=8
```

Fill `degree` for every row in `INTERVALS`. **The tritone (`TT`) is the special case:** as an
augmented 4th its degree is 4; as a diminished 5th its degree is 5. Keep the single `TT` row
but have the spelling function pick the degree from key context (see 1c).

### 1c. `spellInterval` — the core algorithm — `spelling.ts`

```ts
export function spellInterval(
  root: SpelledNote,
  intervalId: IntervalId,
  direction: IntervalDirection,
  opts?: { tritoneAs?: 'A4' | 'd5' },   // default by key in the generator (sharp keys → A4)
): SpelledNote;
```

Algorithm (ascending; mirror for descending):
1. `rootMidi = spelledToMidi(root)`.
2. `targetMidi = applyInterval(rootMidi, interval, direction)`.
3. `steps = degree - 1` letter-steps from the root letter through `LETTERS`
   (wrap C→…→B→C, incrementing `octave` on each wrap). This fixes the **target letter**.
4. `naturalMidi = midiFromParts(targetLetter, 0, targetOctave)`.
5. `alteration = targetMidi - naturalMidi`  → the accidental that makes the spelling exact.

This yields correct enharmonic spelling because the letter is chosen by generic size and the
accidental is forced to match the semitone distance. Tritone: `tritoneAs: 'A4'` → degree 4;
`'d5'` → degree 5.

**Tests (`spelling.test.ts`, follow [intervals.test.ts](../../packages/core/src/theory/intervals.test.ts) with `node:test`):**
- m3 ↑ from C4 → E♭4; M3 ↑ from C4 → E4; m3 ↑ from E♭4 → G♭4.
- P5 ↑ from C4 → G4; P4 ↓ from C4 → G3.
- TT ↑ from C4 as A4 → F♯4; as d5 → G♭4.
- `spelledToMidi(spellInterval(...))` always equals `applyInterval(rootMidi, ...)` (round-trip).

### 1d. Diatonic helpers — extend `keySignatures.ts`

```ts
export function diatonicNotes(key: KeySignature, lowMidi, highMidi): SpelledNote[];
// the 7 scale tones of the key, spelled per the signature, across the MIDI range.
export function isDiatonic(note: SpelledNote, key: KeySignature): boolean;
```

Use existing `accidentalLetters(fifths)` to know which letters are sharp/flat in the key.

---

## Phase 2 — Sight-reading question generation in core

### 2a. Config + Question extension — `training/types.ts`

```ts
export interface SightReadingConfig {
  clefs: ('treble' | 'bass')[];
  keyPool: KeySignature[];        // ramp the circle of fifths
  intervalPool: IntervalId[];
  presentation: 'harmonic' | 'melodic';
  diatonicOnly: boolean;          // start true
}
```

Add **optional** notation fields to the existing `Question` (do NOT break ear training —
keep them optional so `mode: 'ear'` questions are unchanged):

```ts
notation?: {
  clef: 'treble' | 'bass';
  key: KeySignature;
  rootSpelled: SpelledNote;
  targetSpelled: SpelledNote;
};
```

### 2b. `generateSightReadingQuestion` — `training/session.ts`

```ts
export const DEFAULT_SIGHT_CONFIG: SightReadingConfig;   // treble, C major, simple intervals, diatonicOnly
export function generateSightReadingQuestion(config: SightReadingConfig, rng?: Rng): Question;
```

Steps: pick clef + key + interval from pools; pick a **root that is diatonic** in the key and
positioned so the target stays both in MIDI range and (if `diatonicOnly`) in the key; spell
both notes via `spellInterval`; default `tritoneAs` to `'A4'` in sharp keys, `'d5'` in flat
keys. Return a `Question` with `mode: 'sight'`, `intervalId`, midis, and the `notation` block.
**Reuse `gradeAnswer` unchanged** — it only compares interval ids.

**Tests (`session.sight.test.ts`):** with a seeded RNG, generated questions are always
diatonic when `diatonicOnly`, both notes land in range, and `notation` is populated.

---

## Phase 3 — Web UI

New folder `apps/web/src/modes/sightReading/`.

### 3a. Extract shared components first (small refactor)

Pull the answer grid + feedback panel out of
[EarTrainingView.tsx](../../apps/web/src/modes/earTraining/EarTrainingView.tsx) into
`apps/web/src/modes/shared/`:
- `<IntervalChoices choices feedback disabled onChoose />`
- `<Feedback question feedback onNext />`

Refactor ear training to use them (no behavior change — verify the ear drill still works).

### 3b. `<StaffView>` — VexFlow wrapper

`apps/web/src/modes/sightReading/StaffView.tsx`: a `div` ref + `useEffect` that draws on the
`notation` block (clef, key signature via `Stave.addKeySignature`, two `StaveNote`s — a block
chord for `harmonic`, two beats for `melodic`). Clear and redraw when the question changes.
Map `SpelledNote` → VexFlow key string (`"eb/4"`, `"f#/5"`).

### 3c. `<SightReadingView store={store}>`

Mirror `EarTrainingView`'s state machine: generate → render staff → choose → grade →
`store.record({ mode: 'sight', ... })` → feedback → next. Reuse the shared components from 3a.
Add a **key-signature selector** and an interval-count control (reuse the slider pattern /
`earConfigForLevel`-style ordering if helpful). Optional "🔊 Hear it" button reusing
[audio/synth.ts](../../apps/web/src/audio/synth.ts) for cross-training.

### 3d. Enable the tab

In [App.tsx](../../apps/web/src/App.tsx): set the `sight` tab `ready: true`, import and render
`<SightReadingView store={store} />` when `mode === 'sight'`. The single shared `store`
instance already routes by `mode`, so the existing stats footer aggregates correctly.

---

## Phase 4 — Verify

- [ ] `npm test` — new core tests pass.
- [ ] `npm run build` — core + web compile.
- [ ] `npm run dev` — manually: switch to Sight Reading, confirm staves render with correct
      key signatures and **correctly spelled** notes (spot-check a flat key like E♭ and a
      sharp key like A), answers grade, stats increment, key selector works.

## Suggested learning progression (default config ramp)

1. Treble, C major, 3rds/5ths/octaves. → 2. Add 2nds/4ths/6ths/7ths. → 3. Add bass clef.
→ 4. Ramp key signatures outward (G/F, then D/B♭, …). → 5. Chromatic / non-diatonic + the
augmented/diminished tritone split.

## Gotchas

- **Don't leak DOM into core.** VexFlow lives only in `apps/web`.
- **Keep `Question.notation` optional** so ear-training questions and existing tests are untouched.
- **Spelling is letter-first, accidental-second** — never spell by nearest sharp/flat name, or
  you'll render D♯ where the key demands E♭.
- VexFlow needs a real container with width; render after mount and clear the node between
  questions to avoid stacked SVGs.
- Octave wrap when stepping letters past B (ascending) or below C (descending) is the most
  likely off-by-one — the round-trip test in 1c guards it.
