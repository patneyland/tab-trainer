/**
 * VexFlow staff renderer.
 *
 * Engraves the two notes of a sight-reading prompt onto a single staff with the right clef
 * and key signature. All the musical decisions (which letters, which accidentals, which
 * octave) are made in @tab-trainer/core; this component is a thin bridge that turns spelled
 * notes into VexFlow's note strings and draws them into a container ref.
 *
 * Accidentals are applied *relative to the key signature*: a note that already lives in the
 * key shows no accidental glyph, a chromatic note shows one. VexFlow's `applyAccidentals`
 * does that bookkeeping for us, so a diatonic prompt renders as clean as real sheet music.
 */

import { useEffect, useRef } from 'react';
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import type { Clef, KeySignature, PlaybackStyle, SpelledNote } from '@tab-trainer/core';

interface Props {
  clef: Clef;
  keySignature: KeySignature;
  root: SpelledNote;
  target: SpelledNote;
  presentation: PlaybackStyle;
}

const WIDTH = 320;
const HEIGHT = 180;

/** Dark ink so the engraving reads on the cream score-paper stage. */
const INK = '#23201a';

/** Alteration in semitones → VexFlow accidental suffix. */
function suffix(alteration: number): string {
  return { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' }[String(alteration)] ?? '';
}

/** Spelled note → VexFlow key string, e.g. {E,-1,4} → "eb/4". */
function vexKey(note: SpelledNote): string {
  return `${note.letter.toLowerCase()}${suffix(note.alteration)}/${note.octave}`;
}

export function StaffView({ clef, keySignature, root, target, presentation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(WIDTH, HEIGHT);
    const context = renderer.getContext();
    // Draw dark-on-cream so the engraving is legible on the score-paper stage.
    context.setFillStyle(INK);
    context.setStrokeStyle(INK);

    const stave = new Stave(4, 24, WIDTH - 8);
    stave.addClef(clef).addKeySignature(keySignature.tonic);
    stave.setStyle({ fillStyle: INK, strokeStyle: INK });
    stave.setContext(context).draw();

    const notes =
      presentation === 'harmonic'
        ? [new StaveNote({ clef, keys: [vexKey(root), vexKey(target)], duration: 'h' })]
        : [
            new StaveNote({ clef, keys: [vexKey(root)], duration: 'q' }),
            new StaveNote({ clef, keys: [vexKey(target)], duration: 'q' }),
          ];
    notes.forEach((n) => n.setStyle({ fillStyle: INK, strokeStyle: INK }));

    // Two quarter-note beats; a half note (harmonic) fills the same span. Non-strict so a
    // single half note is accepted without padding the bar to four beats.
    const voice = new Voice({ num_beats: 2, beat_value: 4 }).setStrict(false);
    voice.addTickables(notes);
    Accidental.applyAccidentals([voice], keySignature.tonic);
    new Formatter().joinVoices([voice]).format([voice], WIDTH - 90);
    voice.draw(context, stave);

    // Let the SVG scale to the card width while keeping its aspect ratio.
    const svg = container.querySelector('svg');
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
      svg.setAttribute('width', '100%');
      svg.removeAttribute('height');
    }
  }, [clef, keySignature, root, target, presentation]);

  return <div className="staff" ref={containerRef} aria-label="Two notes on a staff to identify" />;
}
