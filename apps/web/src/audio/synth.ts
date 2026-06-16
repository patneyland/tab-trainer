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

function playFrequency(context: AudioContext, frequency: number, startAt: number, durationSec: number): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  // A triangle wave is softer than a sawtooth — closer to a sung vowel than a buzz.
  osc.type = 'triangle';
  osc.frequency.value = frequency;

  const peak = 0.25;
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
