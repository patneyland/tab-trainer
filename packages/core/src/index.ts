/**
 * @tab-trainer/core — the platform-agnostic engine.
 *
 * Music theory, the training-session logic, and the progress model. No browser, DOM, or
 * audio APIs live here, so this package is consumed identically by the web app today and
 * by future desktop/mobile clients.
 */

// Theory
export * from './theory/notes.js';
export * from './theory/intervals.js';
export * from './theory/keySignatures.js';
export * from './theory/spelling.js';

// Training
export * from './training/types.js';
export * from './training/session.js';
export * from './training/sightReading.js';
export * from './training/selection.js';
export * from './training/melody.js';

// Progress
export * from './progress/types.js';
export * from './progress/store.js';
