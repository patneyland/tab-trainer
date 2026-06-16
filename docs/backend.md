# Backend: Accounts + Cross-Device Sync ☁️ (v0.4 — planned, not built)

**Goal:** sign in on web, desktop, or mobile and see **one** progress history. The app must
keep working offline; the network is an enhancement, not a requirement.

> Status: **outline only.** No backend code exists yet. The client is already designed for
> this: everything persists through the `ProgressStore` interface
> (`packages/core/src/progress/store.ts`), and today's `LocalProgressStore` will become the
> offline cache.

## The seam that makes this cheap

```ts
interface ProgressStore {
  record(attempt): Promise<void>;
  getAll(): Promise<AttemptRecord[]>;
  getSummary(): Promise<ProgressSummary>;
  clear(): Promise<void>;
}
```
v0.4 adds a `RemoteProgressStore` (and a `SyncedProgressStore` that wraps local + remote).
**No training or UI code changes** — they only know the interface.

## Recommended approach: managed BaaS first

For a solo project that needs auth + a database + an API across three client types, a managed
backend removes most of the work.

### Option A — Supabase (recommended)
- Postgres + Auth (email magic link / OAuth) + auto-generated REST & realtime + Row Level
  Security. Generous free tier; works from web, React Native, and Tauri.
- RLS ties every row to `auth.uid()`, so "a user only sees their own attempts" is enforced in
  the database, not app code.

### Option B — Custom Node API
- Fastify/Express + Prisma + Postgres + JWT (or Lucia/Auth.js).
- More control and no vendor lock-in; more to build, host, and secure. Choose this only if
  Supabase becomes limiting.

**Recommendation:** start with **Supabase**; the `RemoteProgressStore` abstraction means
swapping to a custom API later is contained.

## Data model

```
users (managed by auth provider)
  id            uuid (pk)

attempts
  id            uuid (pk)
  user_id       uuid (fk -> users.id, RLS scoped)
  at            timestamptz
  mode          text   -- 'ear' | 'sight' | 'sing'
  interval_id   text   -- 'P5', 'm3', ...
  chosen_id     text
  correct       boolean
  response_ms   integer
  client_id     text   -- which device created it (debugging / dedupe)

user_settings
  user_id       uuid (pk, fk)
  vocal_range   jsonb  -- { lowMidi, highMidi } for sing mode
  preferences   jsonb  -- interval pools, difficulty, etc.
```
`attempts` mirrors `AttemptRecord` 1:1 — the attempt log stays the source of truth and all
stats are derived client-side via `summarize()`, so no server-side aggregation is needed.

## Sync strategy

- **Attempts are append-only and immutable** → sync is trivial: push new local attempts, pull
  new remote ones, union by `id`. No conflict resolution needed for the log itself.
- **Offline-first:** writes go to the local cache immediately and queue for upload; a
  `SyncedProgressStore` flushes the queue when online and merges on read.
- **IDs:** generate a UUID per attempt **on the client** so offline writes are idempotent and
  dedupe cleanly on upload.
- **Settings** (`user_settings`) are last-write-wins per field — low stakes.

## Auth UX
- Email magic link is the least-friction default (no password to manage) and works uniformly
  across platforms.
- Gate sync behind sign-in; **unauthenticated users still get the full app** with local-only
  progress, and their local attempts migrate up on first sign-in.

## Rollout steps
1. Stand up Supabase project; create `attempts` + `user_settings` with RLS.
2. Add `apps/web` auth UI (sign in / out, session restore).
3. Implement `RemoteProgressStore` + `SyncedProgressStore` (local cache + remote + queue).
4. Switch `App.tsx` to construct `SyncedProgressStore` when signed in, `LocalProgressStore`
   otherwise. **(One-line change at the seam.)**
5. Migrate existing local attempts to the account on first sign-in.
6. Cross-mode progress dashboard reading from the synced store.

## Security notes
- Never trust the client for ownership — enforce per-user access with RLS / server checks.
- Store only what's needed (training stats); no audio is ever uploaded.
