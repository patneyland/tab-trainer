import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frequencyToMidi, midiToFrequency, MIDDLE_C_MIDI } from './notes.js';
import { applyInterval, intervalById, intervalBetween } from './intervals.js';

test('A4 is 440 Hz and middle C is ~261.63 Hz', () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(MIDDLE_C_MIDI) - 261.6256) < 0.001);
});

test('frequencyToMidi inverts midiToFrequency', () => {
  assert.equal(frequencyToMidi(440), 69);
  for (const midi of [48, 60, 67, 72, 81]) {
    assert.ok(Math.abs(frequencyToMidi(midiToFrequency(midi)) - midi) < 1e-9);
  }
});

test('a perfect fifth above middle C is G4 (MIDI 67)', () => {
  const p5 = intervalById('P5');
  assert.equal(applyInterval(MIDDLE_C_MIDI, p5, 'ascending'), 67);
});

test('a major third below A4 is F4 (MIDI 65)', () => {
  const m3 = intervalById('M3');
  assert.equal(applyInterval(69, m3, 'descending'), 65);
});

test('intervalBetween reduces into one octave', () => {
  assert.equal(intervalBetween(60, 67).id, 'P5');
  assert.equal(intervalBetween(60, 72).id, 'P8');
  assert.equal(intervalBetween(60, 64).id, 'M3');
});
