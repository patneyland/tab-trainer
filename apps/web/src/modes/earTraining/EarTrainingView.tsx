/**
 * Ear-training mode UI.
 *
 * Flow: generate a question -> learner plays it -> learner picks an interval -> grade,
 * record the attempt through the ProgressStore, show feedback -> next question. All music
 * logic comes from @tab-trainer/core; this component only handles audio playback and UI.
 *
 * Optional "tonal context": when enabled, each question is set in a real major key, a short
 * I–IV–V–I cadence establishes that key before the interval is played, and the interval's
 * root is constrained to a diatonic note of the key. Intervals heard inside an established
 * key transfer far better than isolated atonal intervals (Karpinski). When disabled the mode
 * behaves exactly as before (plain isolated intervals).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyInterval,
  diatonicNotes,
  DEFAULT_EAR_LEVEL,
  EAR_INTERVALS_BY_PRIORITY,
  earConfigForLevel,
  gradeAnswer,
  generateEarTrainingQuestion,
  intervalById,
  MAJOR_KEYS,
  noteName,
  selectNextInterval,
  spelledToMidi,
  stepsLabel,
  type EarTrainingConfig,
  type IntervalDirection,
  type IntervalId,
  type KeySignature,
  type ProgressStore,
  type Question,
} from '@tab-trainer/core';
import { Play, Repeat, Radio, Music } from 'lucide-react';
import { playCadence, playInterval, playNote } from '../../audio/synth.js';
import { IntervalChoices } from '../shared/IntervalChoices.js';
import { Feedback } from '../shared/Feedback.js';

interface Props {
  store: ProgressStore;
  /** Called after each recorded answer so the persistent stats strip refreshes. */
  onRecord: () => void;
}

type FeedbackState = { correct: boolean; chosen: IntervalId; actual: IntervalId } | null;

const MAX_LEVEL = EAR_INTERVALS_BY_PRIORITY.length;

/** A small, friendly set of major keys for the tonal-context drill. */
const CONTEXT_KEYS: KeySignature[] = MAJOR_KEYS.filter((k) =>
  ['C', 'G', 'D', 'F', 'Bb'].includes(k.tonic),
);

/** Render a key tonic with a real flat glyph, e.g. "Bb" -> "B♭". */
function tonicLabel(key: KeySignature): string {
  return key.tonic.replace('b', '♭').replace('#', '♯');
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * The MIDI of the key's tonic to anchor the cadence on — the lowest diatonic note in the
 * comfortable cadence range whose pitch class is the tonic. Leaves headroom above for the
 * V triad (tonic + 14 semitones).
 */
function tonicMidiForKey(key: KeySignature): number {
  // C3 (48) .. C4 (60): a low-ish tonic so the whole cadence sits in a warm register.
  const candidates = diatonicNotes(key, 48, 60);
  // The tonic letter is the first character of the key name (C, G, D, F, B...).
  const tonicLetter = key.tonic[0];
  const match = candidates.find((n) => n.letter === tonicLetter);
  return spelledToMidi(match ?? candidates[0]!);
}

export function EarTrainingView({ store, onRecord }: Props) {
  const [level, setLevel] = useState<number>(DEFAULT_EAR_LEVEL);
  const config: EarTrainingConfig = useMemo(() => earConfigForLevel(level), [level]);
  const [tonalContext, setTonalContext] = useState(true);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionKey, setQuestionKey] = useState<KeySignature | null>(null);
  const [askedAt, setAskedAt] = useState<number>(0);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [hasPlayed, setHasPlayed] = useState(false);

  const choices = useMemo(() => config.intervalPool.map((id) => intervalById(id)), [config.intervalPool]);

  /**
   * Build a tonal-context question: pick a key, pick the interval to drill (preserving the
   * SRS bias), then a diatonic root whose target stays in range. The Question is assembled by
   * hand to mirror the shape `generateEarTrainingQuestion` returns. Returns null if no
   * diatonic root works (caller falls back to a plain question).
   */
  const buildContextQuestion = useCallback(
    (intervalId: IntervalId): { question: Question; key: KeySignature } | null => {
      const direction: IntervalDirection = pick(config.directions);
      const interval = intervalById(intervalId);
      const { lowMidi, highMidi } = config.rootRange;

      // Try a few keys so we don't get stuck if one key has no eligible diatonic root.
      const keys = [...CONTEXT_KEYS].sort(() => Math.random() - 0.5);
      for (const key of keys) {
        const roots = diatonicNotes(key, lowMidi, highMidi).filter((note) => {
          const rootMidi = spelledToMidi(note);
          const targetMidi = applyInterval(rootMidi, interval, direction);
          return targetMidi >= lowMidi && targetMidi <= highMidi;
        });
        if (roots.length === 0) continue;

        const rootMidi = spelledToMidi(pick(roots));
        const targetMidi = applyInterval(rootMidi, interval, direction);
        const question: Question = {
          id: `qc_${Math.floor(Math.random() * 1e9).toString(36)}`,
          mode: 'ear',
          intervalId,
          rootMidi,
          direction,
          playbackStyle: config.playbackStyle,
          targetMidi,
        };
        return { question, key };
      }
      return null;
    },
    [config],
  );

  // Bias the next interval toward weak/stale items (spaced repetition), then generate a
  // question constrained to it. Falls back to plain random generation if anything is off.
  const nextQuestion = useCallback(async () => {
    let q: Question;
    let key: KeySignature | null = null;
    try {
      const records = await store.getAll();
      const chosen = selectNextInterval(config.intervalPool, records, undefined, { mode: 'ear' });
      if (tonalContext) {
        const built = buildContextQuestion(chosen);
        if (built) {
          q = built.question;
          key = built.key;
        } else {
          q = generateEarTrainingQuestion({ ...config, intervalPool: [chosen] });
        }
      } else {
        q = generateEarTrainingQuestion({ ...config, intervalPool: [chosen] });
      }
    } catch {
      q = generateEarTrainingQuestion(config);
    }
    setQuestion(q);
    setQuestionKey(key);
    setFeedback(null);
    setHasPlayed(false);
    setAskedAt(performance.now());
  }, [config, store, tonalContext, buildContextQuestion]);

  useEffect(() => {
    void nextQuestion();
  }, [nextQuestion]);

  const play = useCallback(async () => {
    if (!question) return;
    // In tonal-context mode, establish the key with a cadence first, then a short pause,
    // before the interval is heard.
    if (questionKey) {
      await playCadence(tonicMidiForKey(questionKey));
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
    }
    await playInterval(question.rootMidi, question.targetMidi, { style: question.playbackStyle });
    setHasPlayed(true);
    // Start the response timer from the first listen, not from question creation.
    if (!hasPlayed) setAskedAt(performance.now());
  }, [question, questionKey, hasPlayed]);

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
      onRecord();
    },
    [question, feedback, askedAt, store, onRecord],
  );

  return (
    <>
      <header className="view-head">
        <h1>Ear Training</h1>
        <p>Play the interval, then name what you heard.</p>
      </header>

      <div className="level">
        <div className="level__head">
          <label htmlFor="ear-level">Difficulty</label>
          <span className="level__count">
            {level} of {MAX_LEVEL} intervals · <span className="muted">{levelHint(level)}</span>
          </span>
        </div>
        <input
          id="ear-level"
          className="level__slider"
          type="range"
          min={2}
          max={MAX_LEVEL}
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
        <span className="toggle-row__label">Tonal context</span>
        <div className="seg" role="group" aria-label="Establish a key before the interval">
          <button
            type="button"
            className={`seg__btn ${tonalContext ? 'seg__btn--active' : ''}`}
            onClick={() => setTonalContext(true)}
            aria-pressed={tonalContext}
          >
            On
          </button>
          <button
            type="button"
            className={`seg__btn ${!tonalContext ? 'seg__btn--active' : ''}`}
            onClick={() => setTonalContext(false)}
            aria-pressed={!tonalContext}
          >
            Off
          </button>
        </div>
        {tonalContext && questionKey && (
          <span className="context-key">
            <Music size={16} aria-hidden /> Key of {tonicLabel(questionKey)} major
          </span>
        )}
      </div>

      <div className="player">
        <button type="button" className="btn btn--primary btn--big" onClick={() => void play()}>
          {hasPlayed ? <Repeat size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          {hasPlayed ? 'Play again' : tonalContext ? 'Play context + interval' : 'Play interval'}
        </button>
        {question && (
          <button type="button" className="btn btn--ghost" onClick={() => void playNote(question.rootMidi)}>
            <Radio size={18} aria-hidden /> Play root only
          </button>
        )}
      </div>

      <IntervalChoices
        choices={choices}
        feedback={feedback}
        disabled={!hasPlayed || !!feedback}
        onChoose={(id) => void choose(id)}
      />

      {feedback && question && (
        <Feedback
          correct={feedback.correct}
          title={feedback.correct ? 'Correct!' : 'Not quite.'}
          onReplay={() => void play()}
          onNext={() => void nextQuestion()}
        >
          <p>
            It was a <strong>{intervalById(feedback.actual).name}</strong> —{' '}
            {stepsLabel(intervalById(feedback.actual).semitones)}{' '}
            <span className="mono">
              ({noteName(question.rootMidi)} → {noteName(question.targetMidi)})
            </span>
            .
          </p>
          {!feedback.correct && (
            <p className="muted">
              Mnemonic:{' '}
              {question.direction === 'ascending'
                ? intervalById(feedback.actual).ascendingMnemonic
                : intervalById(feedback.actual).descendingMnemonic}
            </p>
          )}
        </Feedback>
      )}
    </>
  );
}

function levelHint(level: number): string {
  if (level <= 7) return 'core choral set';
  if (level <= 9) return '+ sixths';
  if (level <= 11) return '+ sevenths';
  return 'every interval';
}
