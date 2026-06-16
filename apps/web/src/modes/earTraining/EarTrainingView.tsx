/**
 * Ear-training mode UI.
 *
 * Flow: generate a question -> learner plays it -> learner picks an interval -> grade,
 * record the attempt through the ProgressStore, show feedback -> next question. All music
 * logic comes from @tab-trainer/core; this component only handles audio playback and UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_EAR_CONFIG,
  gradeAnswer,
  generateEarTrainingQuestion,
  intervalById,
  noteName,
  type EarTrainingConfig,
  type IntervalId,
  type ProgressStore,
  type ProgressSummary,
  type Question,
} from '@tab-trainer/core';
import { playInterval, playNote } from '../../audio/synth.js';

interface Props {
  store: ProgressStore;
}

type Feedback = { correct: boolean; chosen: IntervalId; actual: IntervalId } | null;

export function EarTrainingView({ store }: Props) {
  const config: EarTrainingConfig = DEFAULT_EAR_CONFIG;
  const [question, setQuestion] = useState<Question | null>(null);
  const [askedAt, setAskedAt] = useState<number>(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);

  const choices = useMemo(() => config.intervalPool.map((id) => intervalById(id)), [config.intervalPool]);

  const refreshSummary = useCallback(async () => {
    setSummary(await store.getSummary());
  }, [store]);

  const nextQuestion = useCallback(() => {
    const q = generateEarTrainingQuestion(config);
    setQuestion(q);
    setFeedback(null);
    setHasPlayed(false);
    setAskedAt(performance.now());
  }, [config]);

  useEffect(() => {
    nextQuestion();
    void refreshSummary();
  }, [nextQuestion, refreshSummary]);

  const play = useCallback(async () => {
    if (!question) return;
    await playInterval(question.rootMidi, question.targetMidi, { style: question.playbackStyle });
    setHasPlayed(true);
    // Start the response timer from the first listen, not from question creation.
    if (!hasPlayed) setAskedAt(performance.now());
  }, [question, hasPlayed]);

  const choose = useCallback(
    async (chosen: IntervalId) => {
      if (!question || feedback) return;
      const answer = gradeAnswer(question, chosen, performance.now() - askedAt);
      await store.record({
        at: new Date().toISOString(),
        mode: 'ear',
        intervalId: question.intervalId,
        chosenIntervalId: chosen,
        correct: answer.correct,
        responseMs: answer.responseMs,
      });
      setFeedback({ correct: answer.correct, chosen, actual: question.intervalId });
      await refreshSummary();
    },
    [question, feedback, askedAt, store, refreshSummary],
  );

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>🎧 Ear Training</h2>
        <p className="muted">Play the interval, then name what you heard.</p>
      </header>

      <div className="player">
        <button className="btn btn--primary btn--big" onClick={play}>
          {hasPlayed ? '🔁 Play again' : '▶ Play interval'}
        </button>
        {question && (
          <button className="btn btn--ghost" onClick={() => void playNote(question.rootMidi)}>
            Play root only
          </button>
        )}
      </div>

      <div className="choices">
        {choices.map((interval) => {
          const isChosen = feedback?.chosen === interval.id;
          const isActual = feedback?.actual === interval.id;
          const state = feedback
            ? isActual
              ? 'correct'
              : isChosen
                ? 'wrong'
                : 'dim'
            : 'idle';
          return (
            <button
              key={interval.id}
              className={`btn choice choice--${state}`}
              disabled={!hasPlayed || !!feedback}
              onClick={() => void choose(interval.id)}
              title={interval.name}
            >
              <span className="choice__label">{interval.label}</span>
              <span className="choice__name">{interval.name}</span>
            </button>
          );
        })}
      </div>

      {feedback && question && (
        <div className={`feedback feedback--${feedback.correct ? 'correct' : 'wrong'}`}>
          <p>
            {feedback.correct ? '✅ Correct!' : '❌ Not quite.'} It was a{' '}
            <strong>{intervalById(feedback.actual).name}</strong>{' '}
            ({noteName(question.rootMidi)} → {noteName(question.targetMidi)}).
          </p>
          {!feedback.correct && (
            <p className="muted">
              Mnemonic:{' '}
              {question.direction === 'ascending'
                ? intervalById(feedback.actual).ascendingMnemonic
                : intervalById(feedback.actual).descendingMnemonic}
            </p>
          )}
          <button className="btn btn--primary" onClick={nextQuestion}>
            Next →
          </button>
        </div>
      )}

      {summary && <ProgressBar summary={summary} />}
    </section>
  );
}

function ProgressBar({ summary }: { summary: ProgressSummary }) {
  const pct = Math.round(summary.accuracy * 100);
  return (
    <footer className="stats">
      <div className="stat">
        <span className="stat__value">{summary.totalAttempts}</span>
        <span className="stat__label">attempts</span>
      </div>
      <div className="stat">
        <span className="stat__value">{summary.totalAttempts ? `${pct}%` : '—'}</span>
        <span className="stat__label">accuracy</span>
      </div>
      <div className="stat">
        <span className="stat__value">{summary.currentStreak}</span>
        <span className="stat__label">streak</span>
      </div>
      <div className="stat">
        <span className="stat__value">{summary.bestStreak}</span>
        <span className="stat__label">best</span>
      </div>
    </footer>
  );
}
