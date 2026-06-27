/**
 * Minimal Web Audio interval player.
 *
 * Browsers require an AudioContext to be created/resumed from a user gesture, so the
 * context is lazily created on first play (always triggered by a button click here).
 * Notes use a short attack/decay envelope to avoid clicks and sound vaguely choral.
 */

import { midiToFrequency, type MidiNote } from '@tab-trainer/core';

let ctx: AudioContext | null = null;

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

function playFrequency(
  context: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
  peak = 0.25,
): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  // A triangle wave is softer than a sawtooth — closer to a sung vowel than a buzz.
  osc.type = 'triangle';
  osc.frequency.value = frequency;

  const attack = 0.02;
  const release = 0.12;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + attack);
  gain.gain.setValueAtTime(peak, startAt + Math.max(attack, durationSec - release));
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);

  osc.connect(gain).connect(context.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.02);
}

export interface PlayOptions {
  style: 'harmonic' | 'melodic';
  /** Seconds each note sounds. */
  noteDuration?: number;
  /** Seconds between note onsets in melodic mode. */
  gap?: number;
}

/** Play two MIDI notes either together (harmonic) or in sequence (melodic). */
export async function playInterval(rootMidi: MidiNote, targetMidi: MidiNote, options: PlayOptions): Promise<void> {
  const context = audioContext();
  if (context.state === 'suspended') await context.resume();

  const noteDuration = options.noteDuration ?? 0.8;
  const gap = options.gap ?? 0.9;
  const now = context.currentTime + 0.05;

  if (options.style === 'harmonic') {
    playFrequency(context, midiToFrequency(rootMidi), now, noteDuration);
    playFrequency(context, midiToFrequency(targetMidi), now, noteDuration);
  } else {
    playFrequency(context, midiToFrequency(rootMidi), now, noteDuration);
    playFrequency(context, midiToFrequency(targetMidi), now + gap, noteDuration);
  }
}

/** Play a single reference pitch (used for "play the root again"). */
export async function playNote(midi: MidiNote, durationSec = 0.8): Promise<void> {
  const context = audioContext();
  if (context.state === 'suspended') await context.resume();
  playFrequency(context, midiToFrequency(midi), context.currentTime + 0.05, durationSec);
}

/**
 * Play a short I–IV–V–I cadence in the major key whose tonic is `tonicMidi`, to establish a
 * tonal context before the interval is heard. Each chord is a block triad (three notes
 * sounded together). The returned promise resolves when the whole cadence has finished, so a
 * caller can `await playCadence(...)` and then play the interval into the established key.
 *
 * Pedagogical basis: intervals heard inside an established key are internalised far better
 * than isolated, atonal intervals (Karpinski).
 */
export async function playCadence(tonicMidi: MidiNote, opts?: { chordDuration?: number }): Promise<void> {
  const context = audioContext();
  if (context.state === 'suspended') await context.resume();

  const chordDuration = opts?.chordDuration ?? 0.5;
  // I – IV – V – I as semitone offsets from the tonic.
  const chords: number[][] = [
    [0, 4, 7], // I
    [5, 9, 12], // IV
    [7, 11, 14], // V
    [0, 4, 7], // I
  ];

  const start = context.currentTime + 0.05;
  chords.forEach((offsets, i) => {
    const at = start + i * chordDuration;
    for (const offset of offsets) {
      playFrequency(context, midiToFrequency(tonicMidi + offset), at, chordDuration);
    }
  });

  const totalSec = chords.length * chordDuration;
  await new Promise<void>((resolve) => setTimeout(resolve, totalSec * 1000));
}

/** Sustain the tonic as a drone for `durationSec` (an alternative key-establishing aid). */
export async function playDrone(tonicMidi: MidiNote, durationSec = 1.5): Promise<void> {
  const context = audioContext();
  if (context.state === 'suspended') await context.resume();
  playFrequency(context, midiToFrequency(tonicMidi), context.currentTime + 0.05, durationSec);
}

export interface SequenceOptions {
  /** Seconds each note sounds. */
  noteDuration?: number;
  /** Seconds between successive note onsets (defaults to noteDuration + a small gap). */
  gap?: number;
}

/**
 * Play a melody: each MIDI note in `midis` in order, evenly spaced. Resolves when the last
 * note has finished — so a caller can `await playSequence(...)` then start listening for the
 * sung echo. Used by the melody-mimic trainer.
 */
export async function playSequence(midis: MidiNote[], opts?: SequenceOptions): Promise<void> {
  const context = audioContext();
  if (context.state === 'suspended') await context.resume();

  const noteDuration = opts?.noteDuration ?? 0.55;
  const gap = opts?.gap ?? noteDuration + 0.1;
  const start = context.currentTime + 0.05;
  midis.forEach((midi, i) => {
    playFrequency(context, midiToFrequency(midi), start + i * gap, noteDuration);
  });

  const totalSec = 0.05 + Math.max(0, midis.length - 1) * gap + noteDuration;
  await new Promise<void>((resolve) => setTimeout(resolve, totalSec * 1000));
}

export interface MixVoice {
  midi: MidiNote;
  /** 0..1 amplitude for this voice. Lower the target voice so the singer must pick it out. */
  gain?: number;
}

/**
 * Sound several notes together with independent per-voice gain — e.g. a triad where the line
 * you must sing is quieter than the rest. Resolves when the chord finishes. Used by the
 * harmonize / hold-your-line trainer.
 */
export async function playChordMix(voices: MixVoice[], opts?: { duration?: number }): Promise<void> {
  const context = audioContext();
  if (context.state === 'suspended') await context.resume();

  const duration = opts?.duration ?? 2.2;
  const at = context.currentTime + 0.05;
  for (const v of voices) {
    playFrequency(context, midiToFrequency(v.midi), at, duration, (v.gain ?? 1) * 0.25);
  }
  await new Promise<void>((resolve) => setTimeout(resolve, (0.05 + duration) * 1000));
}
