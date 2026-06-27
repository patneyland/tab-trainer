/**
 * Microphone capture + monophonic pitch detection (web-only).
 *
 * Pipeline: getUserMedia → MediaStreamSource → AnalyserNode → pitchy (McLeod Pitch Method)
 * once per requestAnimationFrame. Each frame yields { hz, clarity, rms }; frames below the
 * clarity/volume gates are dropped so silence and consonants don't register.
 *
 * This file is the *only* place the mic lives — core stays headless and just does math on the
 * stable Hz this module hands it (see gradeSungPitch). Mirrors audio/synth.ts: the
 * AudioContext is created lazily from a user gesture, and the mic stream is opened on demand.
 */

import { PitchDetector } from 'pitchy';

/** A single analysed frame of mic audio. */
export interface PitchFrame {
  /** Detected fundamental in Hz (0 when no pitch found). */
  hz: number;
  /** pitchy clarity 0..1 — how confident the detection is. */
  clarity: number;
  /** Root-mean-square of the time-domain buffer — an input-level meter. */
  rms: number;
}

export type FrameCallback = (frame: PitchFrame) => void;

/**
 * Frames below this clarity are treated as noise/silence and dropped before scoring.
 * Real sung vowels usually land 0.85–0.98; 0.9 was rejecting too many valid frames.
 */
const CLARITY_THRESHOLD = 0.85;
/** RMS noise floor — ignore very quiet frames. */
const RMS_FLOOR = 0.01;
/** Median-smoothing window (frames). Kills transient octave/harmonic glitches in the readout. */
const SMOOTH_N = 5;
/** A pitch must hold within this many cents to count toward stability. */
const STABLE_CENTS = 30;
/** ...for at least this long (ms) before it's accepted as the sung pitch. */
const STABLE_MS = 350;
/** Hard ceiling on a single capture so silence/noise can't hang the promise forever. */
const CAPTURE_TIMEOUT_MS = 10_000;

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let detector: PitchDetector<Float32Array> | null = null;
// Explicitly ArrayBuffer-backed so the DOM lib's getFloatTimeDomainData signature accepts it.
let buffer: Float32Array<ArrayBuffer> | null = null;
let rafId: number | null = null;
/** Recent valid Hz readings, for median smoothing. Cleared on silence and on stop(). */
let hzHistory: number[] = [];

/** Median of the recent valid readings — robust to a single harmonic/octave glitch frame. */
function smoothHz(hz: number): number {
  hzHistory.push(hz);
  if (hzHistory.length > SMOOTH_N) hzHistory.shift();
  const sorted = [...hzHistory].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * Shift `hz` by whole octaves until it sits within ±600¢ of `refHz`. When we know what note the
 * singer is aiming for, this neutralises the classic detector failure of latching onto a
 * harmonic (2×, 3×…) or sub-harmonic an octave (or more) away from the true fundamental.
 */
export function snapOctaveTo(hz: number, refHz: number): number {
  if (hz <= 0 || refHz <= 0) return hz;
  let out = hz;
  while (out / refHz > Math.SQRT2) out /= 2;
  while (refHz / out > Math.SQRT2) out *= 2;
  return out;
}

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

function centsBetween(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

/**
 * Ask the browser for mic access. Must be called from a user gesture. Disables the browser's
 * voice-processing (echo cancel / noise suppression / AGC) so the raw pitch is detected.
 * Returns 'granted' or 'denied'; resolving the permission keeps the stream open for start().
 */
export async function requestMic(): Promise<'granted' | 'denied'> {
  if (!navigator.mediaDevices?.getUserMedia) return 'denied';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    return 'granted';
  } catch {
    return 'denied';
  }
}

/** True once the mic stream is live. */
export function micReady(): boolean {
  return stream !== null && stream.active;
}

/**
 * Start the per-frame analysis loop, invoking `onFrame` for every gated frame. Lazily wires up
 * the AudioContext + AnalyserNode the first time. Safe to call repeatedly; a prior loop is
 * stopped first.
 */
export async function start(onFrame: FrameCallback): Promise<void> {
  // Re-acquire the mic if we've never had one, or the OS revoked the stream
  // (stream present but no longer active) — otherwise we'd loop over a dead analyser.
  if (!stream || !stream.active) {
    const result = await requestMic();
    if (result === 'denied' || !stream) throw new Error('Microphone not available');
  }
  stop();

  const context = audioContext();
  if (context.state === 'suspended') await context.resume();

  source = context.createMediaStreamSource(stream);
  analyser = context.createAnalyser();
  // 4096 gives better low-frequency resolution (matters for bass/tenor voices) at ~85ms latency.
  analyser.fftSize = 4096;
  source.connect(analyser);
  hzHistory = [];

  detector = PitchDetector.forFloat32Array(analyser.fftSize);
  buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));

  const loop = () => {
    if (!analyser || !detector || !buffer) return;
    analyser.getFloatTimeDomainData(buffer);

    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i]! * buffer[i]!;
    const rms = Math.sqrt(sumSquares / buffer.length);

    const [hz, clarity] = detector.findPitch(buffer, context.sampleRate);

    // Gate: only surface frames that are loud and clear enough to be a sung note.
    if (clarity >= CLARITY_THRESHOLD && rms >= RMS_FLOOR && hz > 0) {
      onFrame({ hz: smoothHz(hz), clarity, rms });
    } else {
      hzHistory = []; // dropped the note — don't blend the old pitch into the next one
      onFrame({ hz: 0, clarity, rms });
    }

    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

/** Stop the analysis loop and disconnect nodes (keeps the mic stream for a future start). */
export function stop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (source) {
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    source = null;
  }
  analyser = null;
  detector = null;
  buffer = null;
  hzHistory = [];
}

/** Fully release the mic (stops the hardware indicator). Call when leaving the mode. */
export function release(): void {
  stop();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  // Also tear down the AudioContext so leaving the tab releases all audio resources;
  // it's re-created lazily by audioContext() on re-entry. Guard against double-close.
  if (ctx) {
    if (ctx.state !== 'closed') void ctx.close();
    ctx = null;
  }
}

/**
 * Resolve a *stable* sung pitch: run the detection loop and accept a frequency only once it
 * has held within ~±30¢ for ~350ms (so a scoop up to the note isn't penalised). The returned
 * Hz is what you hand to gradeSungPitch.
 *
 * `onFrame` is invoked for every frame too, so callers can drive a live tuner needle while
 * waiting. Pass an AbortSignal to cancel (e.g. when the user advances early).
 */
export function captureStablePitch(
  onFrame?: FrameCallback,
  signal?: AbortSignal,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let anchorHz = 0;
    let anchorSince = 0;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = (hz: number) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      stop();
      resolve(hz);
    };

    // Give up after CAPTURE_TIMEOUT_MS of no stable pitch so the promise can't hang forever.
    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      stop();
      reject(new DOMException('Capture timed out', 'TimeoutError'));
    }, CAPTURE_TIMEOUT_MS);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
          stop();
          reject(new DOMException('Capture aborted', 'AbortError'));
        },
        { once: true },
      );
    }

    void start((frame) => {
      onFrame?.(frame);
      if (settled) return;
      if (frame.hz <= 0) {
        // Lost the note — reset the stability window.
        anchorHz = 0;
        anchorSince = 0;
        return;
      }
      const now = performance.now();
      if (anchorHz === 0 || Math.abs(centsBetween(frame.hz, anchorHz)) > STABLE_CENTS) {
        anchorHz = frame.hz;
        anchorSince = now;
        return;
      }
      // Track the running pitch (slow drift) but require the window to hold.
      anchorHz = anchorHz * 0.7 + frame.hz * 0.3;
      if (now - anchorSince >= STABLE_MS) {
        finish(anchorHz);
      }
    }).catch((err) => {
      if (!settled) {
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        reject(err);
      }
    });
  });
}

/** A live frame while sustaining a note toward a target (drives the tuner + hold meter). */
export interface MatchFrame {
  /** Octave-snapped detected Hz (0 when silent). */
  hz: number;
  /** Signed cents vs the target (+ sharp), or null when silent. */
  cents: number | null;
  /** Whether this frame is within tolerance of the target. */
  inTune: boolean;
  /** 0..1 progress toward the required sustained hold. */
  heldRatio: number;
  rms: number;
}

export interface SustainOptions {
  /** Hz of the note to match. Detected pitch is octave-snapped to this before scoring. */
  targetHz: number;
  /** Cents window counted as in-tune. */
  toleranceCents: number;
  /** How long (ms) the singer must hold within tolerance to succeed. */
  holdMs: number;
  /** Give up after this long with no successful hold (default 30s). */
  timeoutMs?: number;
  onFrame?: (frame: MatchFrame) => void;
  signal?: AbortSignal;
}

/**
 * Resolve once the singer *sustains* a pitch within `toleranceCents` of `targetHz` for
 * `holdMs` continuously. This replaces the old "grab the first 350ms snapshot and judge"
 * behaviour: the score reflects what you can hold, a scoop or a momentary harmonic glitch
 * can't fail you, and brief dropouts (< grace) don't reset the hold. Detected pitch is
 * octave-snapped to the target so a harmonic latch reads at the right note.
 *
 * Resolves with the final snapped Hz and cents. Rejects with TimeoutError / AbortError.
 */
export function captureSustainedMatch(opts: SustainOptions): Promise<{ hz: number; cents: number }> {
  const { targetHz, toleranceCents, holdMs } = opts;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const GRACE_MS = 180; // tolerate this much silence/dropout without resetting the hold

  return new Promise<{ hz: number; cents: number }>((resolve, reject) => {
    let settled = false;
    let inTuneSince = 0; // when the current in-tune run started (0 = not holding)
    let lastSeen = 0; // last time we had any valid pitch
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      stop();
    };
    const finish = (hz: number, cents: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ hz, cents });
    };
    const fail = (name: 'TimeoutError' | 'AbortError') => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException(name === 'TimeoutError' ? 'Capture timed out' : 'Capture aborted', name));
    };

    timeoutId = setTimeout(() => fail('TimeoutError'), timeoutMs);
    opts.signal?.addEventListener('abort', () => fail('AbortError'), { once: true });

    void start((frame) => {
      if (settled) return;
      const now = performance.now();

      if (frame.hz <= 0) {
        // Lost the note. Keep the hold alive briefly so a flicker of silence doesn't reset it.
        if (inTuneSince && now - lastSeen > GRACE_MS) inTuneSince = 0;
        opts.onFrame?.({
          hz: 0,
          cents: null,
          inTune: false,
          heldRatio: inTuneSince ? Math.min(1, (lastSeen - inTuneSince) / holdMs) : 0,
          rms: frame.rms,
        });
        return;
      }

      lastSeen = now;
      const hz = snapOctaveTo(frame.hz, targetHz);
      const cents = 1200 * Math.log2(hz / targetHz);
      const inTune = Math.abs(cents) <= toleranceCents;

      if (inTune) {
        if (!inTuneSince) inTuneSince = now;
      } else {
        inTuneSince = 0; // genuinely off pitch — restart the hold
      }
      const heldMs = inTuneSince ? now - inTuneSince : 0;
      opts.onFrame?.({ hz, cents, inTune, heldRatio: Math.min(1, heldMs / holdMs), rms: frame.rms });
      if (heldMs >= holdMs) finish(hz, cents);
    }).catch((err) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });
  });
}

/** Options for walking a sequence of target notes and scoring each one (melody mimic). */
export interface MelodyCaptureOptions {
  /** MIDI notes to match, in order. */
  targets: number[];
  /** Cents window counted as in-tune (e.g. 50). */
  toleranceCents: number;
  /** How long (ms) the singer must hold the current target in tune (e.g. 600). */
  holdMs: number;
  /** Give up on a note after this long and move on, so it never hangs (default 6000). */
  perNoteTimeoutMs?: number;
  /** Per-frame progress while walking the sequence. */
  onProgress?: (p: {
    index: number;
    cents: number | null;
    hz: number;
    heldRatio: number;
    landed: boolean[];
  }) => void;
  signal?: AbortSignal;
}

/**
 * Walk `targets` in order, scoring each note like a forgiving `captureSustainedMatch`: the
 * detected pitch is octave-snapped to the *current* target, and the note is "landed" once it's
 * held within `toleranceCents` for `holdMs`. If a note isn't landed within `perNoteTimeoutMs`
 * it's marked `landed[i] = false` and we advance — so a missed note never hangs the whole
 * melody. A single detection loop runs for the entire sequence (one `start()`); each frame
 * updates the live readout via `onProgress`. Resolves when every target is processed; rejects
 * on abort.
 */
export function captureMelody(
  opts: MelodyCaptureOptions,
): Promise<{ landed: boolean[]; centsPerNote: (number | null)[] }> {
  const { targets, toleranceCents, holdMs } = opts;
  const perNoteTimeoutMs = opts.perNoteTimeoutMs ?? 6000;
  const GRACE_MS = 180;

  return new Promise((resolve, reject) => {
    const landed: boolean[] = targets.map(() => false);
    const centsPerNote: (number | null)[] = targets.map(() => null);
    let index = 0;
    let inTuneSince = 0; // when the current in-tune run started (0 = not holding)
    let lastSeen = 0; // last time we saw any valid pitch
    let noteStartedAt = performance.now(); // when the current target began being attempted
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      stop();
    };
    const finishAll = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ landed, centsPerNote });
    };
    const fail = (name: 'AbortError') => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Capture aborted', name));
    };

    // Reset per-note timers and advance the cursor; finish when past the last note.
    const advance = () => {
      index += 1;
      inTuneSince = 0;
      noteStartedAt = performance.now();
      if (index >= targets.length) {
        finishAll();
        return false;
      }
      return true;
    };

    if (targets.length === 0) {
      finishAll();
      return;
    }

    opts.signal?.addEventListener('abort', () => fail('AbortError'), { once: true });

    void start((frame) => {
      if (settled) return;
      const now = performance.now();
      const targetHz = midiToFrequencyLocal(targets[index]!);

      // Give up on this note after the timeout, marking it missed, then move on.
      if (now - noteStartedAt >= perNoteTimeoutMs) {
        landed[index] = false;
        opts.onProgress?.({ index, cents: null, hz: 0, heldRatio: 0, landed: [...landed] });
        if (!advance()) return;
        return;
      }

      if (frame.hz <= 0) {
        if (inTuneSince && now - lastSeen > GRACE_MS) inTuneSince = 0;
        opts.onProgress?.({
          index,
          cents: null,
          hz: 0,
          heldRatio: inTuneSince ? Math.min(1, (lastSeen - inTuneSince) / holdMs) : 0,
          landed: [...landed],
        });
        return;
      }

      lastSeen = now;
      const hz = snapOctaveTo(frame.hz, targetHz);
      const cents = 1200 * Math.log2(hz / targetHz);
      const inTune = Math.abs(cents) <= toleranceCents;

      if (inTune) {
        if (!inTuneSince) inTuneSince = now;
      } else {
        inTuneSince = 0;
      }
      const heldMs = inTuneSince ? now - inTuneSince : 0;
      opts.onProgress?.({
        index,
        cents,
        hz,
        heldRatio: Math.min(1, heldMs / holdMs),
        landed: [...landed],
      });

      if (heldMs >= holdMs) {
        landed[index] = true;
        centsPerNote[index] = cents;
        opts.onProgress?.({ index, cents, hz, heldRatio: 1, landed: [...landed] });
        if (!advance()) return;
      }
    }).catch((err) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });
  });
}

/** Local MIDI→Hz so this module stays dependency-light (mirrors core's midiToFrequency). */
function midiToFrequencyLocal(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
