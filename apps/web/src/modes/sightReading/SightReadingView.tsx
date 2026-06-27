/**
 * Sight-reading mode UI.
 *
 * Flow: generate a question -> engrave the two notes on a staff -> learner names the
 * interval -> grade, record the attempt, show feedback -> next. Mirrors EarTrainingView so
 * the two modes feel like one app; the only real difference is eyes instead of ears (and an
 * optional "hear it" button that cross-trains the two). All music logic lives in core.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SIGHT_LEVEL,
  MAX_SIGHT_LEVEL,
  gradeAnswer,
  generateSightReadingQuestion,
  intervalById,
  selectNextInterval,
  sightChoices,
  sightConfigForLevel,
  sightHintForLevel,
  spelledName,
  type IntervalId,
  type KeySignature,
  type PlaybackStyle,
  type ProgressStore,
  type Question,
  type SightReadingConfig,
} from '@tab-trainer/core';
import { Volume2, Music, Music2, ChevronDown } from 'lucide-react';
import { playInterval } from '../../audio/synth.js';
import { StaffView } from './StaffView.js';
import { IntervalChoices } from '../shared/IntervalChoices.js';
import { Feedback } from '../shared/Feedback.js';

interface Props {
  store: ProgressStore;
  /** Called after each recorded answer so the persistent stats strip refreshes. */
  onRecord: () => void;
}

type FeedbackState = { correct: boolean; chosen: IntervalId; actual: IntervalId } | null;

const clefLabel: Record<string, string> = { treble: 'Treble', bass: 'Bass' };

/** Sentinel for "Auto (ramp)" — generate from the stage config rather than a fixed key. */
const AUTO_KEY = '__auto__';

export function SightReadingView({ store, onRecord }: Props) {
  const [level, setLevel] = useState<number>(DEFAULT_SIGHT_LEVEL);
  // Singing practice wants the notes one after the other; "together" (a chord) is opt-in.
  const [presentation, setPresentation] = useState<PlaybackStyle>('melodic');
  // "Auto" follows the difficulty ramp's key pool; a specific tonic pins generation to one key.
  const [keyChoice, setKeyChoice] = useState<string>(AUTO_KEY);
  const stageConfig: SightReadingConfig = useMemo(() => sightConfigForLevel(level), [level]);

  // The key the user pinned (if any), drawn from the current stage's pool.
  const pinnedKey: KeySignature | null = useMemo(
    () => stageConfig.keyPool.find((k) => k.tonic === keyChoice) ?? null,
    [stageConfig, keyChoice],
  );

  // Generation config: the stage as-is for "Auto", or a single-key override when pinned.
  const config: SightReadingConfig = useMemo(
    () => (pinnedKey ? { ...stageConfig, keyPool: [pinnedKey] } : stageConfig),
    [stageConfig, pinnedKey],
  );

  const [question, setQuestion] = useState<Question | null>(null);
  const [askedAt, setAskedAt] = useState<number>(0);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const choices = useMemo(() => sightChoices(config), [config]);

  // If the chosen key isn't in the new stage's pool (slider moved), fall back to Auto.
  useEffect(() => {
    if (keyChoice !== AUTO_KEY && !stageConfig.keyPool.some((k) => k.tonic === keyChoice)) {
      setKeyChoice(AUTO_KEY);
    }
  }, [stageConfig, keyChoice]);

  // Bias toward weak/stale intervals (spaced repetition): float the chosen interval to the
  // front of the pool so the generator prefers it but can still re-roll if that interval has
  // no renderable root in the current key/clef. Falls back to the plain config on any error.
  const nextQuestion = useCallback(async () => {
    let q: Question;
    try {
      const records = await store.getAll();
      const chosen = selectNextInterval(config.intervalPool, records, undefined, { mode: 'sight' });
      const reordered = [chosen, ...config.intervalPool.filter((id) => id !== chosen)];
      q = generateSightReadingQuestion({ ...config, intervalPool: reordered });
    } catch {
      q = generateSightReadingQuestion(config);
    }
    setQuestion(q);
    setFeedback(null);
    setAskedAt(performance.now());
  }, [config, store]);

  useEffect(() => {
    void nextQuestion();
  }, [nextQuestion]);

  const hear = useCallback(async () => {
    if (!question) return;
    await playInterval(question.rootMidi, question.targetMidi, { style: presentation });
  }, [question, presentation]);

  const choose = useCallback(
    async (chosen: IntervalId) => {
      if (!question || feedback) return;
      const answer = gradeAnswer(question, chosen, performance.now() - askedAt);
      await store.record({
        at: new Date().toISOString(),
        mode: 'sight',
        intervalId: question.intervalId,
        chosenIntervalId: chosen,
        correct: answer.correct,
        responseMs: answer.responseMs,
      });
      setFeedback({ correct: answer.correct, chosen, actual: question.intervalId });
      onRecord();
    },
    [question, feedback, askedAt, store, onRecord],
  );

  return (
    <>
      <header className="view-head">
        <h1>Sight Reading</h1>
        <p>Read the two notes on the staff and name the interval.</p>
      </header>

      <div className="level">
        <div className="level__head">
          <label htmlFor="sight-level">Difficulty</label>
          <span className="level__count">
            Stage {level} of {MAX_SIGHT_LEVEL} ·{' '}
            <span className="muted">{sightHintForLevel(level)}</span>
          </span>
        </div>
        <input
          id="sight-level"
          className="level__slider"
          type="range"
          min={1}
          max={MAX_SIGHT_LEVEL}
          step={1}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
        />
        <div className="level__chips">
          {config.intervalPool.map((id) => (
            <span key={id} className="chip" title={intervalById(id).name}>
              {intervalById(id).label}
            </span>
          ))}
        </div>
      </div>

      <div className="toggle-row">
        <span className="toggle-row__label">Notes</span>
        <div className="seg" role="group" aria-label="How the notes are shown and played">
          <button
            type="button"
            className={`seg__btn ${presentation === 'melodic' ? 'seg__btn--active' : ''}`}
            onClick={() => setPresentation('melodic')}
          >
            <Music size={16} aria-hidden /> One at a time
          </button>
          <button
            type="button"
            className={`seg__btn ${presentation === 'harmonic' ? 'seg__btn--active' : ''}`}
            onClick={() => setPresentation('harmonic')}
          >
            <Music2 size={16} aria-hidden /> Together
          </button>
        </div>

        <div className="key-select-wrap">
          <select
            id="sight-key"
            className="key-select"
            aria-label="Key signature"
            value={keyChoice}
            onChange={(e) => setKeyChoice(e.target.value)}
          >
            <option value={AUTO_KEY}>Auto (ramp)</option>
            {stageConfig.keyPool.map((k) => (
              <option key={k.tonic} value={k.tonic}>
                {k.tonic} major
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden />
        </div>
      </div>

      {question?.notation && (
        <div className="score-paper staff-block">
          <p className="score-paper__caption">
            {clefLabel[question.notation.clef]} clef · {question.notation.key.tonic} major
          </p>
          <StaffView
            clef={question.notation.clef}
            keySignature={question.notation.key}
            root={question.notation.rootSpelled}
            target={question.notation.targetSpelled}
            presentation={presentation}
          />
          <div className="player" style={{ marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn--transport" onClick={() => void hear()}>
              <Volume2 size={18} aria-hidden /> Hear it
            </button>
          </div>
        </div>
      )}

      <IntervalChoices
        choices={choices}
        feedback={feedback}
        disabled={!!feedback}
        onChoose={(id) => void choose(id)}
      />

      {feedback && question?.notation && (
        <Feedback
          correct={feedback.correct}
          title={feedback.correct ? 'Correct!' : 'Not quite.'}
          onReplay={() => void hear()}
          onNext={() => void nextQuestion()}
        >
          <p>
            It was a <strong>{intervalById(feedback.actual).name}</strong> —{' '}
            <span className="mono">
              {spelledName(question.notation.rootSpelled)} →{' '}
              {spelledName(question.notation.targetSpelled)}
            </span>{' '}
            in {question.notation.key.tonic} major.
          </p>
        </Feedback>
      )}
    </>
  );
}
