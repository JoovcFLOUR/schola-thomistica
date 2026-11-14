import type { VocabularyEntry } from './vocabulary-store';

export type FSRSRating = 1 | 2 | 3 | 4; // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
export type FSRSState = 'new' | 'learning' | 'review' | 'relearning';

export interface FSRSCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: FSRSState;
  lastReview?: string;
}

export interface FSRSReviewLog {
  rating: FSRSRating;
  state: FSRSState;
  reviewedAt: string;
  elapsedDays: number;
  scheduledDays: number;
  stabilityBefore: number;
  stabilityAfter: number;
  difficultyAfter: number;
}

// Standard FSRS v4.5/v5 default parameters (17 weights)
const W = [
  0.4072, // w0: initial stability Again
  1.1829, // w1: initial stability Hard
  3.1262, // w2: initial stability Good
  15.4722, // w3: initial stability Easy
  7.2102, // w4: initial difficulty base
  0.5316, // w5: initial difficulty slope
  1.0651, // w6: difficulty update delta
  0.0046, // w7: difficulty mean reversion
  1.5418, // w8: stability recall growth factor
  0.1367, // w9: stability damping
  1.0405, // w10: retrievability exponent
  1.9395, // w11: lapse stability base
  0.11, // w12: lapse difficulty exponent
  0.296, // w13: lapse stability exponent
  2.2697, // w14: lapse retrievability factor
  0.2315, // w15: Hard penalty
  2.9898, // w16: Easy bonus
];

const REQUEST_RETENTION = 0.9;
const DECAY = -0.5;
const FACTOR = 19 / 81; // (0.9^(1/-0.5) - 1) = 19/81

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function createEmptyFSRSCard(now: Date = new Date()): FSRSCard {
  return {
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
  };
}

export function computeRetrievability(card: FSRSCard, now: Date = new Date()): number {
  if (card.state === 'new' || card.stability <= 0 || !card.lastReview) {
    return 0;
  }
  const last = new Date(card.lastReview).getTime();
  const elapsedDays = Math.max(0, (now.getTime() - last) / 86400_000);
  return Math.pow(1 + (FACTOR * elapsedDays) / card.stability, DECAY);
}

function nextIntervalDays(stability: number, desiredRetention = REQUEST_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
  return Math.max(1, Math.min(36500, Math.round(raw)));
}

function initStability(rating: FSRSRating): number {
  return Math.max(0.1, W[rating - 1]);
}

function initDifficulty(rating: FSRSRating): number {
  const d0 = W[4] - Math.exp(W[5] * (rating - 1)) + 1;
  return clamp(d0, 1, 10);
}

function nextDifficulty(d: number, rating: FSRSRating): number {
  const nextD = d - W[6] * (rating - 3);
  const meanReverted = W[7] * initDifficulty(4) + (1 - W[7]) * nextD;
  return clamp(meanReverted, 1, 10);
}

function nextRecallStability(d: number, s: number, r: number, rating: FSRSRating): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const growth =
    1 +
    Math.exp(W[8]) *
      (11 - d) *
      Math.pow(s, -W[9]) *
      (Math.exp((1 - r) * W[10]) - 1) *
      hardPenalty *
      easyBonus;
  return Math.max(0.1, s * growth);
}

function nextForgetStability(d: number, s: number, r: number): number {
  const sMin = s / Math.exp(W[15] * W[16]);
  const sForget =
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp((1 - r) * W[14]);
  return clamp(Math.min(sForget, sMin), 0.1, s);
}

export function scheduleFSRSReview(
  card: FSRSCard,
  rating: FSRSRating,
  now: Date = new Date()
): { card: FSRSCard; log: FSRSReviewLog } {
  const prevState = card.state;
  const prevStability = card.stability;
  const lastMs = card.lastReview ? new Date(card.lastReview).getTime() : now.getTime();
  const elapsedDays = card.state === 'new' ? 0 : Math.max(0, (now.getTime() - lastMs) / 86400_000);

  let stability: number;
  let difficulty: number;
  let scheduledDays: number;
  let state: FSRSState;
  let lapses = card.lapses;

  if (card.state === 'new') {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
    if (rating === 1) {
      scheduledDays = 0; // Re-show within session / 10 minutes
      state = 'learning';
    } else if (rating === 2) {
      scheduledDays = 1;
      state = 'learning';
    } else {
      scheduledDays = nextIntervalDays(stability);
      state = 'review';
    }
  } else {
    const r = computeRetrievability(card, now) || 0.85;
    difficulty = nextDifficulty(card.difficulty, rating);
    if (rating === 1) {
      lapses += 1;
      stability = nextForgetStability(difficulty, card.stability, r);
      scheduledDays = 0;
      state = 'relearning';
    } else {
      stability = nextRecallStability(difficulty, card.stability, r, rating);
      scheduledDays = nextIntervalDays(stability);
      state = 'review';
    }
  }

  const dueMs =
    scheduledDays === 0
      ? now.getTime() + 10 * 60 * 1000 // 10 minutes for Again
      : now.getTime() + scheduledDays * 86400_000;

  const updatedCard: FSRSCard = {
    due: new Date(dueMs).toISOString(),
    stability: Number(stability.toFixed(4)),
    difficulty: Number(difficulty.toFixed(4)),
    elapsedDays: Number(elapsedDays.toFixed(2)),
    scheduledDays,
    reps: card.reps + 1,
    lapses,
    state,
    lastReview: now.toISOString(),
  };

  return {
    card: updatedCard,
    log: {
      rating,
      state: prevState,
      reviewedAt: now.toISOString(),
      elapsedDays: updatedCard.elapsedDays,
      scheduledDays,
      stabilityBefore: prevStability,
      stabilityAfter: updatedCard.stability,
      difficultyAfter: updatedCard.difficulty,
    },
  };
}

export type PhrasePumpExerciseType =
  | 'phrasepump-cloze'
  | 'la-to-en'
  | 'en-to-la'
  | 'grammar-context';

export interface PhrasePumpExercise {
  id: string;
  entryId: string;
  type: PhrasePumpExerciseType;
  promptTitle: string;
  latinWord: string;
  lemma: string;
  headword: string;
  originalSentence: string;
  clozeSentence: string;
  sentenceTranslation: string;
  expectedAnswer: string;
  acceptableAnswers: string[];
  translationHint: string;
  grammarHint: string;
  contextualMeaning: string;
  userNotes?: string;
  sourceCitation: string;
  sourceWork: string;
  entry: VocabularyEntry;
}

export function buildClozeSentence(sentence: string, targetWord: string): string {
  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  if (regex.test(sentence)) {
    return sentence.replace(regex, '[ _____ ]');
  }
  return `${sentence} ([ _____ ])`;
}

export function generatePhrasePumpSession(
  entries: VocabularyEntry[],
  options: {
    mode?: 'mixed' | PhrasePumpExerciseType;
    limit?: number;
    dueOnly?: boolean;
    now?: Date;
  } = {}
): { exercises: PhrasePumpExercise[]; dueCount: number; totalSaved: number } {
  const now = options.now || new Date();
  const limit = options.limit || 20;
  const mode = options.mode || 'mixed';

  const dueEntries = entries.filter(
    (e) => e.familiarity < 4 && new Date(e.fsrsCard.due).getTime() <= now.getTime()
  );

  const pool =
    options.dueOnly && dueEntries.length > 0
      ? dueEntries
      : dueEntries.length > 0
      ? [
          ...dueEntries,
          ...entries.filter((e) => !dueEntries.includes(e) && e.familiarity < 4),
        ]
      : entries;

  const exercises: PhrasePumpExercise[] = [];
  const typesCycle: PhrasePumpExerciseType[] =
    mode === 'mixed'
      ? ['phrasepump-cloze', 'la-to-en', 'en-to-la', 'grammar-context']
      : [mode];

  for (const entry of pool) {
    const cloze = buildClozeSentence(entry.originalSentence, entry.word);
    const typesForEntry =
      pool.length < 4 && mode === 'mixed'
        ? typesCycle
        : [typesCycle[exercises.length % typesCycle.length]];

    for (const exType of typesForEntry) {
      if (exercises.length >= limit) break;
      const effectiveMeaning = entry.customDefinition?.trim() || entry.translation;
      const userNotes = entry.notes?.trim() || undefined;

      if (exType === 'phrasepump-cloze') {
        exercises.push({
          id: `${entry.id}-cloze`,
          entryId: entry.id,
          type: 'phrasepump-cloze',
          promptTitle: 'PhrasePump Contextual Cloze — Complete the Thomistic Sentence',
          latinWord: entry.word,
          lemma: entry.lemma,
          headword: entry.headword,
          originalSentence: entry.originalSentence,
          clozeSentence: cloze,
          sentenceTranslation: entry.sentenceTranslation,
          expectedAnswer: entry.word,
          acceptableAnswers: [entry.word.toLowerCase(), entry.lemma.toLowerCase()],
          translationHint: effectiveMeaning,
          grammarHint: entry.morphologySummary,
          contextualMeaning: entry.customDefinition?.trim() || entry.contextualMeaning,
          userNotes,
          sourceCitation: entry.sourceCitation,
          sourceWork: entry.sourceWork,
          entry,
        });
      } else if (exType === 'la-to-en') {
        exercises.push({
          id: `${entry.id}-la-en`,
          entryId: entry.id,
          type: 'la-to-en',
          promptTitle: 'Latin → English Recognition in Context',
          latinWord: entry.word,
          lemma: entry.lemma,
          headword: entry.headword,
          originalSentence: entry.originalSentence,
          clozeSentence: cloze,
          sentenceTranslation: entry.sentenceTranslation,
          expectedAnswer: effectiveMeaning,
          acceptableAnswers: [effectiveMeaning, entry.translation]
            .join(';')
            .toLowerCase()
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
          translationHint: entry.customDefinition?.trim() || entry.contextualMeaning,
          grammarHint: entry.morphologySummary,
          contextualMeaning: entry.customDefinition?.trim() || entry.contextualMeaning,
          userNotes,
          sourceCitation: entry.sourceCitation,
          sourceWork: entry.sourceWork,
          entry,
        });
      } else if (exType === 'en-to-la') {
        exercises.push({
          id: `${entry.id}-en-la`,
          entryId: entry.id,
          type: 'en-to-la',
          promptTitle: 'English → Latin Active Recall',
          latinWord: entry.word,
          lemma: entry.lemma,
          headword: entry.headword,
          originalSentence: entry.originalSentence,
          clozeSentence: cloze,
          sentenceTranslation: entry.sentenceTranslation,
          expectedAnswer: entry.lemma,
          acceptableAnswers: [entry.lemma.toLowerCase(), entry.word.toLowerCase()],
          translationHint: effectiveMeaning,
          grammarHint: entry.morphologySummary,
          contextualMeaning: entry.customDefinition?.trim() || entry.contextualMeaning,
          userNotes,
          sourceCitation: entry.sourceCitation,
          sourceWork: entry.sourceWork,
          entry,
        });
      } else {
        exercises.push({
          id: `${entry.id}-grammar`,
          entryId: entry.id,
          type: 'grammar-context',
          promptTitle: 'Scholastic Grammar & Morphological Analysis',
          latinWord: entry.word,
          lemma: entry.lemma,
          headword: entry.headword,
          originalSentence: entry.originalSentence,
          clozeSentence: cloze,
          sentenceTranslation: entry.sentenceTranslation,
          expectedAnswer: entry.morphologySummary,
          acceptableAnswers: [entry.morphologySummary.toLowerCase()],
          translationHint: effectiveMeaning,
          grammarHint: entry.morphologySummary,
          contextualMeaning: entry.customDefinition?.trim() || entry.contextualMeaning,
          userNotes,
          sourceCitation: entry.sourceCitation,
          sourceWork: entry.sourceWork,
          entry,
        });
      }
    }
    if (exercises.length >= limit) break;
  }

  return {
    exercises,
    dueCount: dueEntries.length,
    totalSaved: entries.length,
  };
}
