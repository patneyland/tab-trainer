# Tab Trainer — Design System ("Conservatory Console")

The visual language for the web app. Replaces the original generic dark-navy + violet-gradient
look. **Thesis:** a serious practice *instrument* — a dark graphite console where the one place
light pools is a warm cream "score-paper" stage, with a single **brass** accent (instrument
hardware, tuning pegs, stage light). No navy, no violet, no gradient text, no emoji.

## Color (dark theme is primary / only theme in v1)

```css
:root {
  /* Console / surfaces */
  --bg-base:#101216; --bg-rail:#0B0C0F;
  --surface-1:#181B21; --surface-2:#21252D; --surface-3:#2B303A;
  --score-paper:#F4EFE3; --score-paper-ink:#23201A;

  /* Borders */
  --border:#2E333D; --border-strong:#3C434F; --border-score:#D8CFB8;

  /* Text */
  --text-primary:#ECEDF1; --text-secondary:#AEB4C0; --text-muted:#7B8290;
  --text-on-accent:#1A1206; --text-on-paper:#23201A;

  /* Accent (brass) — the single brand color */
  --accent:#E6A23C; --accent-hover:#F2B252; --accent-press:#C9882A;
  --accent-soft:rgba(230,162,60,0.14); --accent-ring:rgba(230,162,60,0.45);

  /* Semantic / musical feedback */
  --correct:#3FB984; --correct-bg:#143027; --correct-ink:#7CF0C0;
  --wrong:#F0586E;   --wrong-bg:#3A141C;   --wrong-ink:#FFB7C1;
  --active:#5AA6F0;  --warning:#E6A23C;
  --flat:#5AA6F0;    --sharp:#F0A35A;       /* tuner: cool=below, warm=above, green=in-tune */

  /* Type */
  --font-display:'Fraunces','Iowan Old Style',Georgia,serif;
  --font-body:'Mona Sans','Public Sans',system-ui,sans-serif;
  --font-mono:'Spline Sans Mono','JetBrains Mono',ui-monospace,monospace;
  --fs-display:3.5rem; --fs-h1:2.25rem; --fs-h2:1.5rem; --fs-h3:1.125rem;
  --fs-body:1rem; --fs-sm:0.875rem; --fs-label:0.75rem;
  --fs-readout:5rem; --fs-cents:1.75rem; --fs-stat-num:2rem;

  /* Space / radius / elevation / motion */
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;
  --space-6:32px;--space-7:48px;--space-8:64px;--space-9:96px;
  --radius-sm:6px;--radius-md:10px;--radius-lg:14px;--radius-xl:20px;--radius-pill:999px;
  --shadow-panel:0 1px 0 rgba(255,255,255,0.03) inset,0 8px 24px rgba(0,0,0,0.45);
  --shadow-stage:0 2px 0 var(--border-score) inset,0 18px 50px rgba(0,0,0,0.55);
  --shadow-press:0 1px 2px rgba(0,0,0,0.5) inset;
  --ease-out:cubic-bezier(0.22,0.61,0.36,1);
  --ease-spring:cubic-bezier(0.34,1.56,0.64,1);
  --dur-fast:120ms;--dur-mid:220ms;--dur-slow:340ms;
}
```

Body: `background:var(--bg-base)` (NO radial gradient), `color:var(--text-primary)`,
`font-family:var(--font-body)`.

Accuracy number color ramp: ≥85% `--correct`, 60–84% `--text-primary`, <60% `--warning`.

## Typography

- **Display/headings:** Fraunces (soft serif, weights 400–600). Never gradient-clip headings; solid `--text-primary`. The wordmark "Trainer" may take `--accent`.
- **Body/UI:** Mona Sans (fallback Public Sans). No Inter/Roboto as primary.
- **Mono:** Spline Sans Mono — note names (`F♯4`), cents (`+12¢`), all stat numbers, with `font-variant-numeric:tabular-nums`.
- Use real musical glyphs `♯ ♭ ♮` (not `#`/`b`).

Google Fonts:
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Mona+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap');
```

## Layout — app shell (NOT a centered card)

```css
.app-shell{display:grid;grid-template-columns:72px 1fr;grid-template-rows:56px 1fr 64px;
  grid-template-areas:"topbar topbar" "rail stage" "rail stats";height:100dvh;}
.topbar{grid-area:topbar;display:flex;align-items:center;justify-content:space-between;
  padding:0 var(--space-5);background:var(--bg-base);border-bottom:1px solid var(--border);}
.mode-rail{grid-area:rail;background:var(--bg-rail);display:flex;flex-direction:column;
  align-items:center;gap:var(--space-2);padding:var(--space-4) 0;border-right:1px solid var(--border);}
.stage{grid-area:stage;overflow:auto;display:flex;justify-content:center;padding:var(--space-7) var(--space-5);}
.stage__col{width:100%;max-width:760px;}
.stats-strip{grid-area:stats;background:var(--surface-1);border-top:1px solid var(--border-strong);
  display:flex;align-items:center;gap:var(--space-6);padding:0 var(--space-6);}
```

- **Topbar (56px):** wordmark left; key selector + streak pill + settings right.
- **Mode rail (72px):** Ear / Sing / Sight-Read icons; active item = 3px brass left bar + `--accent-soft` fill + brass icon + uppercase `--fs-label`. Settings pinned bottom.
- **Stage:** content column max 760px; prompt (Fraunces h1) → cream score-paper surface → transport buttons → answer grid → feedback.
- **Stats strip (64px):** persistent mono readouts — Accuracy, Streak, Session progress, (sing) Avg cents — hairline dividers between.

## Components (exact states)

**Answer button** — base `--surface-2` / `1px --border` / `--radius-md`, interval symbol in mono + name below in uppercase `--fs-label` muted, `min-height:56px`:
- hover `--surface-3` + `--border-strong` + `translateY(-1px)`; active `translateY(0)` + `--shadow-press`; focus-visible `border-color:--accent` + `0 0 0 3px --accent-ring`.
- correct `--correct-bg`/`--correct`/`--correct-ink` + single `pulse-correct` (scale 1→1.04→1, `--ease-spring`).
- wrong `--wrong-bg`/`--wrong`/`--wrong-ink` + `shake-wrong` (±4px, 180ms).
- reveal-correct (the right answer after a wrong pick): transparent bg, `2px solid --correct`, `--correct` text.
- disabled: `--surface-1`, `--text-muted`, opacity .5, pointer-events none.

**Score-paper stage:** `background:--score-paper`, `--radius-xl`, `--shadow-stage`, `1px solid --border-score`, padding `--space-6`; staff/notes rendered in `--score-paper-ink` (dark on cream). Current note highlighted brass; passed notes dim 55%.

**Tuner needle (sing):** arc gauge −50…0…+50¢ on the cream stage; ticks every 10¢; left half faint `--flat`, right faint `--sharp`, center ±10¢ window faint `--correct`. Needle 3px: `--flat` below / `--sharp` above / `--correct` within ±10¢ (and center window fills `--correct` 18% + big mono readout turns green). Readout: target note `--fs-readout` mono + live cents `--fs-cents` mono. Needle motion spring-damped (~150ms settle, no jitter).

**Difficulty slider:** 6px track, filled portion `--accent`; thumb 20px `--accent` with `2px solid --bg-base` ring; hover scale 1.1; focus-visible `0 0 0 4px --accent-ring`; tick labels mono uppercase, active tick `--accent`.

**Stats item:** mono tabular number over uppercase `--fs-label` muted, hairline dividers.

**Feedback panel:** `--surface-1`, `--radius-lg`, 3px left bar (`--correct`/`--wrong`); Fraunces h3 title + mono interval names; ghost "Hear it again" + primary "Next →"; reveal animation `translateY(8px)→0`, 220ms.

**Mic-permission gate (sing pre-roll):** centered-in-stage panel (NOT modal-over-blur), `--surface-1`/`--radius-lg`; 64px circle `--accent-soft` with `--accent` mic icon; Fraunces h2 "Let's hear your voice" + `--text-secondary` body (audio never leaves device); brass primary "Enable microphone". Denied → icon/bar `--warning`, "Try again". Granted/listening → live RMS input-level meter (`--correct` fill, `width 90ms linear`).

**Buttons:** primary brass (`--accent` / `--text-on-accent`, hover `--accent-hover`, active `--accent-press`); ghost (transparent, `1px --border`, `--text-secondary`); transport (`--surface-2` + brass play icon).

## Motion

```css
--ease-out:cubic-bezier(0.22,0.61,0.36,1);
--ease-spring:cubic-bezier(0.34,1.56,0.64,1);
--dur-fast:120ms; --dur-mid:220ms; --dur-slow:340ms;
@keyframes pulse-correct{0%{transform:scale(1)}50%{transform:scale(1.04)}100%{transform:scale(1)}}
@keyframes shake-wrong{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}50%{transform:translateX(4px)}75%{transform:translateX(-2px)}}
@keyframes reveal{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
```

- Question transition: outgoing fade/translateY(-8px) 160ms → incoming fade/translateY(8px→0) 220ms. No carousels/confetti.
- Tuner needle spring-damped; in-tune lock cross-fades readout color 120ms.
- `@media (prefers-reduced-motion:reduce)` → drop transforms/pulses/shakes; keep instant color state changes only.

## Iconography

Use **lucide-react** (1.5px stroke). No emoji. Mapping: Ear=`ear`/`music`, Sing=`mic`/`audio-waveform`, Sight-read=`music-2`, Play/Replay=`play`, Drone=`waves`/`radio`, Correct=`check`, Wrong=`x`, Streak=`zap`, Accuracy=`target`, Session=`list-checks`, Settings=`settings-2`, Key=`chevron-down`, Mic-on=`mic`, Mic-denied=`mic-off`, Next=`arrow-right`. Sizes: rail 24px, inline 18px, stats 16px. Accent/active icons use `--accent`.

## What was removed (the "AI-generated" fingerprint)

Navy `#0f1220` + radial hero glow; blue→violet `--accent`/`--accent-2` gradient; `background-clip:text` headings; `'Segoe UI'/system-ui` primary font; centered `.card`; emoji mode icons. All deleted.

> Sources informing this: Soundslice dark mode (music on its own surface), EarMaster (grey/blue/green/red status convention), GuitarTuna/Fender Tune (needle + flat/sharp), Ableton pro-audio (warm accents over flat grey), and anti-AI-slop guidance (ban Inter/violet-gradient, dominant-neutral + one sharp warm accent, high-contrast type pairing).
