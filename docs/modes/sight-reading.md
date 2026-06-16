# Mode: Sight Reading 👁️ (v0.2 — planned, not built)

**Skill trained:** seeing two notes on the staff — in *any* key signature — and naming the
interval instantly. This is the half of the audition that ear training can't cover, and the
explicit reason the project exists.

> Status: **outline only.** Nothing in this mode is implemented yet. The core groundwork
> (`packages/core/src/theory/keySignatures.ts`) is already in place.

## The core challenge: spelling, not just distance

In ear training an interval is just a semitone count. On the page, the **same sound is
spelled differently depending on the key**, and the learner must read the *notation*, not the
pitch. A minor third from C can appear as C→E♭ (key of E♭) or C→D♯ (key of B). Sight reading
must:

1. Choose a key signature.
2. Choose a diatonic (or chromatic) interval valid in that key.
3. Spell both notes correctly **for that key** (letter + accidental), so the rendered
   notation is musically correct.
4. Render them on a staff with the proper clef and key signature.
5. Accept the learner's interval-name answer and grade it.

## Proposed implementation

### Rendering
- **Library: [VexFlow](https://github.com/0xfe/vexflow)** — mature, framework-agnostic music
  notation engraving for the web. Renders to SVG/Canvas; works in React via a ref + effect.
  - Alternative considered: OpenSheetMusicDisplay (heavier, MusicXML-oriented — overkill for
    two-note prompts).
- Render: one staff, chosen clef (treble/bass), key signature, two notes (block chord for a
  harmonic interval, or two beats for melodic).

### New core work (`packages/core/src/theory/`)
The current `notes.ts` is MIDI-first. Sight reading needs **spelled** notes:
- [ ] A `SpelledNote` type: `{ letter: Letter; alteration: number; octave: number }`.
- [ ] `spellInterval(rootSpelled, intervalId, direction)` → correctly spelled target note
      (e.g. M3 above E♭ is G; m3 above C in E♭ major is E♭). Interval *number* maps to letter
      steps; *quality* maps to the accidental.
- [ ] `noteInKey(letter, octave, keySignature)` → applies the key's accidentals.
- [ ] Map `SpelledNote` ↔ MIDI (reuse `midiFromParts`) so audio playback can be offered as a
      "hear it" hint and to bridge with the other modes.
- [ ] Extend the interval table with explicit augmented/diminished spellings where the
      tritone splits (A4 vs d5) — only needed for full chromatic spelling.

### New training config
```ts
interface SightReadingConfig {
  clefs: ('treble' | 'bass')[];
  keyPool: KeySignature[];      // ramp along the circle of fifths
  intervalPool: IntervalId[];
  presentation: 'harmonic' | 'melodic';
  diatonicOnly: boolean;        // start true: only intervals that fit the key
}
```
`generateSightReadingQuestion(config, rng)` produces a `Question` with `mode: 'sight'` plus
the spelled notes needed to render. **Grading and progress reuse the existing flow** —
`gradeAnswer` and `AttemptRecord` already carry `mode`, so per-mode stats come for free.

### UI (`apps/web/src/modes/sightReading/`)
- `<StaffView>` wrapping VexFlow in a `useEffect` over a container ref.
- Key-signature selector (default C major; "ramp the circle of fifths" progression).
- Same choice-button grid + feedback panel as ear training (extract shared `<IntervalChoices>`
  and `<Feedback>` components during this work).
- Optional "play it" button reusing `audio/synth.ts` to cross-train ear + eye.

## Suggested learning progression
1. Treble clef, C major, simple intervals (3rds/5ths/octaves).
2. Add 2nds, 4ths, 6ths, 7ths.
3. Add bass clef.
4. Ramp key signatures outward along the circle of fifths (G/F, then D/B♭, …).
5. Chromatic / non-diatonic intervals; augmented & diminished spellings.

## Open questions
- Should the answer be the *generic* interval name (e.g. "third") or *specific* quality
  ("major third")? Recommendation: specific, to match ear training and audition standards.
- Timed mode for audition realism? Defer to v0.5 "audition mode".
