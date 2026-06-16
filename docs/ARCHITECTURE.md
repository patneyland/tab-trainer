# Architecture

Tab Trainer is a **monorepo** built so that one codebase can serve web today and desktop +
mobile tomorrow, all backed by one account and one progress history.

## Guiding principle: the core knows no platform

```
                ┌──────────────────────────────────────────────┐
                │            @tab-trainer/core                   │
                │  music theory · training engine · progress     │
                │  model · ProgressStore interface               │
                │  (pure TypeScript — no DOM, audio, or React)   │
                └──────────────────────────────────────────────┘
                       ▲              ▲                ▲
            ┌──────────┘     ┌────────┘      ┌─────────┘
   ┌────────┴───────┐ ┌──────┴────────┐ ┌────┴──────────────┐
   │  apps/web      │ │ apps/desktop  │ │  apps/mobile      │
   │  React + Vite  │ │ Tauri (later) │ │  React Native     │
   │  Web Audio     │ │               │ │  (later)          │
   └────────┬───────┘ └──────┬────────┘ └────┬──────────────┘
            │                │               │
            └────────────────┼───────────────┘
                             ▼
                  ┌────────────────────────┐
                  │   Sync backend (v0.4)  │  ← see backend.md
                  │   auth + progress API  │
                  └────────────────────────┘
```

The hard-won, correctness-critical logic — what an interval is, how a question is
generated and graded, how progress rolls up — lives **once** in `packages/core`. Every
client is a thin shell that:

1. asks core for a question,
2. presents it (audio / notation / mic),
3. collects an answer,
4. asks core to grade it,
5. persists the attempt through the `ProgressStore` interface.

Because clients only touch progress through `ProgressStore`, moving from local storage to a
synced backend never touches training or UI code. That seam is the whole reason "sign in on
any device and see my progress" is cheap to deliver later.

## Packages

### `packages/core`
| Area | Files | Responsibility |
| --- | --- | --- |
| Theory | `theory/notes.ts` | MIDI ↔ frequency, note naming, octaves |
| | `theory/intervals.ts` | Interval table, lookup, transposition |
| | `theory/keySignatures.ts` | Circle of fifths, accidentals (for sight reading) |
| Training | `training/types.ts` | Question / Answer / config shapes |
| | `training/session.ts` | Question generation + grading (pure, RNG-injectable) |
| Progress | `progress/types.ts` | `AttemptRecord`, `summarize()` |
| | `progress/store.ts` | `ProgressStore` interface (the persistence seam) |

Design rules for core:
- **No side effects at import time.** Pure data + pure functions.
- **RNG is injected** (`Rng = () => number`) so generation is testable/seedable.
- **The attempt log is the source of truth.** All stats are derived via `summarize()`, never
  stored pre-aggregated — so sync stays simple and lossless.

### `apps/web`
React + Vite. Owns everything platform-specific:
- `audio/synth.ts` — Web Audio interval playback.
- `storage/localProgressStore.ts` — `ProgressStore` backed by `localStorage`.
- `modes/earTraining/` — the v0.1 trainer UI.

## Why a monorepo with npm workspaces

- One `npm install`, shared TypeScript config conventions, atomic cross-package changes.
- npm workspaces (not pnpm/yarn) so there's **zero extra tooling** to install — important for
  a project meant to be picked up and run on any machine with Node 20+.
- Future `apps/desktop` (Tauri) and `apps/mobile` (React Native/Expo) drop in as new
  workspaces that depend on `@tab-trainer/core` exactly as `apps/web` does.

## Data flow for one ear-training question

```
EarTrainingView ──generateEarTrainingQuestion(config)──▶ core
        │ ◀──────────────── Question ──────────────────
        ├─ playInterval(root, target)         (web audio)
        ├─ user clicks an interval
        ├─ gradeAnswer(question, choice, ms) ─▶ core ──▶ Answer
        └─ store.record(attempt)              (ProgressStore)
                    │
                    ▼
        LocalProgressStore  (today)
        RemoteProgressStore (v0.4 — same interface)
```

## Conventions

- TypeScript everywhere, `strict` + `noUncheckedIndexedAccess`.
- ESM modules; intra-package imports use explicit `.js` extensions (NodeNext/Bundler-friendly).
- Core is built (`npm run build:core`) before the web app consumes it via the workspace symlink.
