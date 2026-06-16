# Music Theory Reference

The domain facts Tab Trainer encodes. This is the shared mental model behind
`packages/core/src/theory/`.

## Pitch as MIDI
Pitches are represented as **MIDI note numbers**: integers where 60 = middle C (C4) and 69 =
A4 = 440 Hz. Each step of 1 = one semitone.

```
frequency(midi) = 440 × 2^((midi − 69) / 12)
```
MIDI makes interval math integer arithmetic; letter-name *spelling* is derived when needed.

## Intervals (within one octave)
An interval = **quality** + **number**. Tab Trainer's table (`theory/intervals.ts`):

| Label | Name | Semitones | Asc. mnemonic |
| --- | --- | --- | --- |
| P1 | Perfect unison | 0 | same note |
| m2 | Minor second | 1 | Jaws theme |
| M2 | Major second | 2 | Happy Birthday |
| m3 | Minor third | 3 | Greensleeves |
| M3 | Major third | 4 | When the Saints |
| P4 | Perfect fourth | 5 | Here Comes the Bride |
| TT | Tritone | 6 | The Simpsons |
| P5 | Perfect fifth | 7 | Twinkle Twinkle |
| m6 | Minor sixth | 8 | The Entertainer |
| M6 | Major sixth | 9 | NBC chimes |
| m7 | Minor seventh | 10 | Star Trek theme |
| M7 | Major seventh | 11 | Take On Me |
| P8 | Perfect octave | 12 | Over the Rainbow |

**Tritone note:** 6 semitones is one *sound* with two *spellings* — augmented fourth (A4) and
diminished fifth (d5). Sound-based modes treat it as one entry; sight reading must choose the
spelling from the key context (see [modes/sight-reading.md](modes/sight-reading.md)).

## Quality + number, and why spelling matters
The interval **number** is a count of letter names (C→E spans C-D-E = a third). The interval
**quality** (major/minor/perfect/augmented/diminished) is the exact semitone size. So:
- C→E = major third (4 semitones)
- C→E♭ = minor third (3 semitones)
- C→D♯ = augmented second (3 semitones) — *same sound* as the minor third, *different spelling*

Ear training only cares about the sound (semitones). Sight reading cares about the spelling,
which is why core carries both a MIDI model and (incoming in v0.2) a spelled-note model.

## Key signatures & the circle of fifths
Encoded in `theory/keySignatures.ts` as `fifths` (circle-of-fifths position: negative = flats,
positive = sharps, 0 = C major / A minor).

- **Order of sharps:** F C G D A E B
- **Order of flats:** B E A D G C F (the reverse)
- A signature with `fifths = +2` has sharps on F and C → **D major**.
- A signature with `fifths = −2` has flats on B and E → **B♭ major**.

`accidentalLetters(fifths)` returns which letters carry an accidental, the foundation for
correctly engraving and spelling notes in the sight-reading mode.

## Directions
Intervals are trained **ascending** and **descending**. Descending recognition is a distinct
skill (and harder for most singers), so it's tracked separately via the question's
`direction` and the per-direction mnemonics in the interval table.
