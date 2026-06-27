/**
 * Tiny per-user settings store (localStorage).
 *
 * The first per-user state beyond progress: vocal-range calibration for sing mode. Same
 * "swap for remote later" shape as LocalProgressStore — this foreshadows the v0.4 backend
 * storing a small user-settings document. Key: `tab-trainer:settings:v1`.
 */

import type { MidiNote } from '@tab-trainer/core';

export interface Settings {
  /** The singer's comfortable range, captured by Calibration. Absent until calibrated. */
  vocalRange?: { lowMidi: MidiNote; highMidi: MidiNote };
}

const STORAGE_KEY = 'tab-trainer:settings:v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const settings = parsed as Settings;
    // Drop a malformed vocalRange so it can't produce NaN MIDI downstream.
    const range = settings.vocalRange;
    if (
      !range ||
      !Number.isFinite(range.lowMidi) ||
      !Number.isFinite(range.highMidi) ||
      range.lowMidi >= range.highMidi
    ) {
      const { vocalRange: _drop, ...rest } = settings;
      return rest;
    }
    return settings;
  } catch {
    return {};
  }
}

/** Merge a patch into the stored settings and persist. Returns the new settings. */
export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full / unavailable — settings just won't persist */
  }
  return next;
}
