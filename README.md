# Tab Trainer

Train your **ear**, **eyes**, and **voice** to know musical intervals instantly — built to prepare for a Tabernacle Choir audition, where interval memorization and sight reading matter most.

**▶ Live demo: [tab-trainer.vercel.app](https://tab-trainer.vercel.app)** — deploys automatically from `main`.

## The three skills

Tab Trainer drills the same musical intervals through three complementary modes:

| Mode | You... | Status |
| --- | --- | --- |
| 🎧 **Ear training** | Hear two notes, name the interval | ✅ Built (v0.1) |
| 👁️ **Sight reading** | See an interval on the staff in any key, name it | 📋 Planned — see [docs/modes/sight-reading.md](docs/modes/sight-reading.md) |
| 🎤 **Sing the interval** | Hear a starting pitch, sing the target | 📋 Planned — see [docs/modes/sing-the-interval.md](docs/modes/sing-the-interval.md) |

All three share one **core engine** (music theory + training logic) and one **progress store**, so your stats follow you across modes — and, eventually, across devices.

## Project layout

```
tab-trainer/
├── packages/core/      Platform-agnostic TypeScript: theory, intervals, key signatures,
│                       training-session engine, and the ProgressStore interface.
├── apps/web/           React + Vite web app. The first client. Ear training lives here.
└── docs/               Architecture, roadmap, and detailed plans for each mode + backend.
```

The logic that matters (what an interval *is*, how a session is generated and scored, how
progress is recorded) lives in `packages/core` with **no browser or DOM dependencies**. That
is deliberate: a future desktop (Tauri/Electron) or mobile (React Native) client reuses the
same core and talks to the same backend. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting started

```bash
npm install        # installs all workspaces
npm run build:core # compile the core package
npm run dev        # start the web app (Vite) at http://localhost:5173
```

> Requires Node 20+. This repo uses **npm workspaces** — no pnpm/yarn needed.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md). Short version:

1. ✅ **v0.1** — Ear training MVP, local progress (this release).
2. **v0.2** — Sight reading mode (notation rendering + key signatures).
3. **v0.3** — Sing-the-interval mode (mic + pitch detection).
4. **v0.4** — Accounts + cross-device sync backend.

## Why "Tab Trainer"

A nod to the **Tab**ernacle Choir, the goal this app was built to chase.
