# Mode: Ear Training 🎧 (v0.1 — built)

**Skill trained:** hearing two pitches and instantly naming the interval between them.

## How it works today
1. `generateEarTrainingQuestion(config)` picks an interval from the pool, a direction, and a
   root note that keeps both pitches in range.
2. The web app plays the interval via Web Audio (`audio/synth.ts`) — melodic by default.
3. The learner clicks the interval they heard.
4. `gradeAnswer()` scores it; the attempt is logged via the `ProgressStore`.
5. Feedback shows the correct interval, the actual notes, and (on a miss) a song mnemonic.

## Configuration (`DEFAULT_EAR_CONFIG`)
- `intervalPool` — which intervals can be quizzed. Default starts with the common ones
  (`m2, M2, m3, M3, P4, P5, P8`) and omits the tritone and sevenths until they're earned.
- `directions` — `ascending` by default; add `descending` to drill both.
- `playbackStyle` — `melodic` (one after another) or `harmonic` (together).
- `rootRange` — MIDI window the root is drawn from (default C3–C5).

## Planned enhancements
- [ ] **Difficulty tiers / level select** — start with 4 intervals, unlock more as accuracy
      passes a threshold (e.g. 85% over the last 20).
- [ ] **Harmonic vs melodic toggle** in the UI (engine already supports both).
- [ ] **Ascending + descending toggle** in the UI.
- [ ] **"Set the key" mode** — play a tonic drone first so intervals are heard in a tonal
      context (closer to choral sight-singing).
- [ ] **Adaptive selection** — weight the pool toward the learner's weakest intervals using
      `ProgressSummary.perInterval`.
- [ ] **Replay-limit / first-try scoring** for audition-realistic pressure.

## Design notes
- The response timer starts on first **play**, not on question creation, so think-time is
  measured fairly.
- The same `Question`/`gradeAnswer`/`AttemptRecord` shapes are reused by sight reading and
  singing — only the *presentation* differs. Keep it that way.
