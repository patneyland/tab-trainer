# Roadmap

The goal that anchors every decision: **be ready to audition for the Tabernacle Choir**,
where interval recognition and sight reading are the make-or-break skills. Each release adds
one of the three core skills, then ties them together with cross-device progress.

## v0.1 — Ear training MVP ✅ (shipped in this scaffold)
- [x] `@tab-trainer/core`: theory, interval table, training engine, progress model.
- [x] Web Audio interval playback (harmonic + melodic).
- [x] Ear-training UI: play → identify → grade → feedback → next.
- [x] Local progress (accuracy, streaks, per-interval) via `ProgressStore`.
- [x] Disabled tabs showing the two future modes.

## v0.2 — Sight reading 👁️ (next, target: ~1 day)
Read an interval drawn on the staff, in any key signature, and name it.
- [ ] Notation rendering (VexFlow — see [modes/sight-reading.md](modes/sight-reading.md)).
- [ ] Render two notes on a staff with a chosen key signature + clef.
- [ ] Correct enharmonic spelling driven by `keySignatures.ts`.
- [ ] Reuse the same Question/grade/Progress flow as ear training (`mode: 'sight'`).
- [ ] Key-signature selector (start in C, ramp up the circle of fifths).
**Full plan: [docs/modes/sight-reading.md](modes/sight-reading.md)**

## v0.3 — Sing the interval 🎤 ✅ (shipped)
Hear a root, sing the target interval, get scored on pitch accuracy.
- [x] Mic capture + pitch detection (`pitchy`, McLeod) with clarity/RMS gating + stable-pitch hold.
- [x] Compare sung pitch to target within a cents tolerance (`gradeSungPitch`, octave-agnostic option).
- [x] Real-time tuner needle feedback (flat ◀ in-tune ▶ sharp) + live cents readout.
- [x] One-time vocal-range calibration (lowest→highest), persisted via a settings store.
- [x] Record attempts as `mode: 'sing'` (with signed `centsError`).
**Plan: [docs/plans/audition-readiness-plan.md](plans/audition-readiness-plan.md) · design: [docs/modes/sing-the-interval.md](modes/sing-the-interval.md)**

## UI — "Conservatory Console" redesign ✅ (shipped)
Complete visual overhaul away from the generic dark-navy/violet-gradient look.
- [x] App-shell layout (topbar + mode rail + stage + persistent stats strip) — no more centered card.
- [x] Graphite chassis + warm cream "score-paper" stage + single brass accent; Fraunces/Mona Sans/Spline Sans Mono; Lucide icons (no emoji).
**Spec: [docs/design/design-system.md](design/design-system.md)**

## Tonal context for ear training ✅ (shipped)
- [x] Optional key-establishing **I–IV–V–I cadence** before each interval (default on), with the root constrained diatonic to a chosen key — intervals heard in a tonal context (per Karpinski). Isolated-interval drill still available via toggle.

## v0.4 — Accounts + cross-device sync ☁️
Sign in on web/desktop/mobile and see one unified history.
- [ ] Auth (email magic link or OAuth).
- [ ] `RemoteProgressStore` implementing the existing `ProgressStore` interface.
- [ ] Push/pull + offline queue (local store stays the offline cache).
- [ ] Progress dashboard across all three modes.
**Full plan: [docs/backend.md](backend.md)**

## v0.5+ — Audition readiness
- [x] Spaced-repetition selection (`selectNextInterval`) that resurfaces weak/unseen/stale intervals — wired into ear, sight, and sing modes.
- [ ] Scale-degree / movable-do solfège answering (full functional ear training — the one schema fork, see Phase 2 of the audition-readiness plan).
- [ ] Sight-SINGING (staff + mic scoring) and the Phase-2 assessment task types (tonal memory, major/minor, find-the-tonic, pitch-vs-rhythm).
- [ ] "Audition mode" timed drills mimicking real conditions.
- [ ] Compound intervals (beyond the octave) and interval-in-chord recognition.
- [ ] Desktop (Tauri) and mobile (React Native/Expo) clients on the shared core + backend.

## Sequencing notes
- v0.2 and v0.3 are independent of each other; either can come first. Sight reading is
  recommended next because it reuses the existing question/grade loop with no new device
  permissions (mic) to wrangle.
- v0.4 is intentionally last: the `ProgressStore` seam means none of the mode code changes
  when sync lands.
