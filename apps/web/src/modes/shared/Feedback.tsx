/**
 * The feedback-panel shell, shared by every mode.
 *
 * A surface card with a 3px left bar (green correct / red wrong), a Fraunces title with a
 * Lucide check / x, the mode-specific body as `children`, and ghost "Hear it again" + primary
 * "Next →" actions. Each mode passes its own title and an optional replay handler.
 */

import type { ReactNode } from 'react';
import { ArrowRight, Check, Volume2, X } from 'lucide-react';

interface Props {
  correct: boolean;
  title: string;
  onNext: () => void;
  /** Optional "hear it again" replay (ear / sight / sing). */
  onReplay?: () => void;
  replayLabel?: string;
  children: ReactNode;
}

export function Feedback({ correct, title, onNext, onReplay, replayLabel = 'Hear it again', children }: Props) {
  return (
    <div className={`feedback feedback--${correct ? 'correct' : 'wrong'}`}>
      <h3 className="feedback__title">
        {correct ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
        {title}
      </h3>
      {children}
      <div className="feedback__actions">
        {onReplay && (
          <button type="button" className="btn btn--ghost" onClick={onReplay}>
            <Volume2 size={18} aria-hidden /> {replayLabel}
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={onNext}>
          Next <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
