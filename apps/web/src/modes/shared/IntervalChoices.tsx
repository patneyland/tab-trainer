/**
 * The interval answer-button grid, shared by every mode.
 *
 * Ear training and sight reading both end the same way: a row of interval buttons the learner
 * picks from, which light up correct / wrong / reveal / dimmed once an answer is in. This
 * component owns that grid and its visual states; each mode decides when the buttons are
 * enabled. Interval labels use real musical glyphs and render in the mono face.
 */

import type { Interval, IntervalId } from '@tab-trainer/core';

interface Props {
  choices: readonly Interval[];
  /** Which interval was chosen and which was actually correct — null until an answer is in. */
  feedback: { chosen: IntervalId; actual: IntervalId } | null;
  disabled: boolean;
  onChoose: (id: IntervalId) => void;
}

export function IntervalChoices({ choices, feedback, disabled, onChoose }: Props) {
  return (
    <div className="choices">
      {choices.map((interval) => {
        const isChosen = feedback?.chosen === interval.id;
        const isActual = feedback?.actual === interval.id;
        // After an answer: the right answer is "correct" if picked, else "reveal";
        // a wrong pick is "wrong"; everything else dims.
        let state: 'idle' | 'correct' | 'wrong' | 'reveal' | 'dim' = 'idle';
        if (feedback) {
          if (isActual) state = isChosen ? 'correct' : 'reveal';
          else if (isChosen) state = 'wrong';
          else state = 'dim';
        }
        return (
          <button
            key={interval.id}
            type="button"
            className={`choice choice--${state}`}
            disabled={disabled}
            onClick={() => onChoose(interval.id)}
            title={interval.name}
          >
            <span className="choice__label">{interval.label}</span>
            <span className="choice__name">{interval.name}</span>
          </button>
        );
      })}
    </div>
  );
}
