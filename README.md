# Tab Trainer

A web app for ear training and vocal musicianship that I built to prepare for a real Tabernacle Choir audition, where naming intervals on the spot and sight reading are what get you in.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
[![Live demo](https://img.shields.io/badge/demo-tab--trainer.vercel.app-000000?logo=vercel&logoColor=white)](https://tab-trainer.vercel.app)

> ▶ Try it live: https://tab-trainer.vercel.app

<!--
  Add screenshots/GIFs here, then uncomment. Until the files exist, this stays
  hidden so nothing renders broken.

  ![Sing mode tuner](docs/screenshot.png)
  ![Gameplay](docs/gameplay.gif)

  Two views are worth capturing:
    - docs/screenshot.png : the live pitch tuner in Sing mode (the needle + hold meter
      tracking your voice in real time). This is the most impressive single still.
    - docs/gameplay.gif   : the VexFlow staff in Sight-reading, naming an interval and
      getting graded, or a short Sing-mode hold-the-note clip.
-->

## Why I built it

I'm an accountant who moved into applied AI, and I sing. The Tabernacle Choir audition tests interval recognition and sight reading hard, and the usual drills bored me. So I wrote my own trainer that hits the same skill from five angles: hear it, see it on the staff, sing it back, and hold your line against other voices. The practice tool and the practice became the same thing.

## Training modes

All five modes are built and reachable from the mode rail in the running app. They share one music-theory engine and one progress store, so your stats follow you across modes.

| Mode | What you do |
| --- | --- |
| 🎧 **Ear** | Hear two notes (melodic or harmonic, with an optional I–IV–V–I cadence for tonal context) and name the interval. |
| 🎤 **Sing** | Hear a note or a root, then sing the target and *hold* it in tune. A live tuner needle shows flat/sharp in cents while a meter fills as you sustain. Two drills: match a pitch, or sing a named interval above a root. |
| 🌀 **Mimic** | The app plays a short diatonic melody (after a cadence sets the key); you sing it back. Each note is scored in cents and the round reports how many you landed. |
| 🎚️ **Blend** | Several notes sound together with your target line played quieter. You pick it out of the texture and sustain it in tune. This is the closest drill to the real audition task of holding your part. |
| 👁️ **Sight-reading** | Read two notes engraved on a staff in a chosen key and clef, and name the interval. An optional "hear it" button cross-trains the ear. |

Sing, Mimic, and Blend all require microphone access and a one-time vocal-range calibration. A "settings" rail item is stubbed (disabled) for future global preferences.

## How it works

**Real-time microphone pitch detection.** Sing, Mimic, and Blend capture the mic through `getUserMedia` (echo cancellation, noise suppression, and auto-gain off so the raw pitch survives) into a Web Audio `AnalyserNode`, then run [pitchy](https://www.npmjs.com/package/pitchy) (the McLeod Pitch Method) once per animation frame. Each frame is gated on clarity and RMS so silence and consonants don't register, median-smoothed across frames to kill octave glitches, and octave-snapped to the target so a harmonic latch still reads at the right note. You score by *sustaining* a pitch within a cents tolerance for about a second, not by a fragile snapshot, so a scoop up to the note isn't penalized. All of this lives in one file (`apps/web/src/audio/pitchDetector.ts`); the core engine stays headless and just does the math.

**Music notation rendering.** Sight-reading engraves the two notes with [VexFlow](https://www.npmjs.com/package/vexflow) (SVG backend), choosing the clef and applying accidentals against the active key signature so enharmonic spelling is correct (a note already in the key shows no accidental glyph; a chromatic one does).

**A pure-TypeScript core engine.** `@tab-trainer/core` holds the interval table, key signatures, enharmonic spelling, question generation, grading, and the progress model. Question generators take an injectable RNG (`type Rng = () => number`, defaulting to `Math.random`) so a seeded function makes every test deterministic. Interval selection is adaptive: `selectNextInterval` weights toward intervals you're weak on, haven't seen, or haven't drilled recently, and it's wired into all three of Ear, Sight, and Sing.

## Architecture

It's an npm-workspaces monorepo:

```
tab-trainer/
├── packages/core/   Platform-agnostic TypeScript: notes, intervals, key signatures,
│                    enharmonic spelling, question generation + grading, adaptive
│                    selection, melody generation, and the ProgressStore interface.
└── apps/web/        Vite + React client. The five mode views, Web Audio synth + mic
                     pitch detection, VexFlow staff, and a localStorage progress store.
```

The core has no browser, DOM, or audio dependencies. What an interval *is*, how a question is generated and scored, and how progress is recorded all live there; the web app is just one client wiring playback, microphone, and UI on top. Persistence goes through a single `ProgressStore` interface (`record` / `getAll` / `getSummary` / `clear`), and the web app ships a `LocalProgressStore` backed by localStorage.

That seam is deliberate but honest about its current state: cross-device sync, accounts, and desktop (Tauri) / mobile (React Native) clients are **designed for, not yet built**. The point of separating the core now is that a future `RemoteProgressStore` or a second client reuses the same engine without touching mode or UI code. See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` for where it's headed.

## Run it locally

Requires Node 20+. Uses npm workspaces (no pnpm or yarn).

```bash
npm install         # install all workspaces
npm run build:core  # compile @tab-trainer/core (the web app imports its built output)
npm run dev         # start the web app (Vite) at http://localhost:5173
```

Run the core engine's tests:

```bash
npm test            # tsc compiles the core, then node --test runs the suite
```

Tests use Node's built-in `node:test` runner (no Jest or Vitest). The core test config compiles `src` to `dist-test/` and runs every `*.test.js`. Current coverage is the theory and training logic: intervals, enharmonic spelling, sight-reading and sing question generation, melody generation, and adaptive selection.

To build everything for production:

```bash
npm run build       # builds core, then the web app (tsc -b && vite build)
```

The live site deploys from `main` on Vercel (`vercel.json`: build with `npm run build`, serve `apps/web/dist`).

## Tech stack

- **Language:** TypeScript 5.6, `strict` plus `noUncheckedIndexedAccess` and `noImplicitOverride` in the core.
- **Web app:** Vite 5, React 18, lucide-react icons.
- **Pitch detection:** pitchy 4 (McLeod Pitch Method) over Web Audio.
- **Notation:** VexFlow 4 (SVG).
- **Core engine:** pure TypeScript, injectable RNG, tested with `node:test`.
- **Tooling:** npm workspaces, Node 20+.
- **Hosting:** Vercel.

## License

MIT. See [LICENSE](LICENSE).

## Author

Built by Patrick Neyland, [Neyland Solutions](https://neylandsolutions.com).
