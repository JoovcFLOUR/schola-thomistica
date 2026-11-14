import { cleanLatinString } from './normalizer';
import { analyzeWord } from './dictionaries';
import { isLexicalDataLoaded, quickResolveTokenLemma } from './data-loader';
import { VocabularyStore } from './vocabulary-store';
import type { FSRSRating } from './fsrs';

export interface TextCoverageReport {
  totalWords: number;
  uniqueLemmas: number;
  knownWords: number;
  learningWords: number;
  unfamiliarWords: number;
  knownPercentage: number;
  learningPercentage: number;
  unfamiliarPercentage: number;
}

export type ProgressiveReadingStage =
  | 'Stage 1: Assisted Scholastic Reading (Full Glosses & Highlights)'
  | 'Stage 2: Guided Thomistic Reading (Learning Highlights + Context Cues)'
  | 'Stage 3: Advanced Scholastic Reader (Unfamiliar Terms Only)'
  | 'Stage 4: Independent Thomistic Scholar (Minimal Distraction)';

export interface ReadingStatsSnapshot {
  totalWordsEncountered: number;
  encounteredLemmas: string[];
  pagesRead: string[];
  dailyActivity: Record<string, { wordsRead: number; wordsLearned: number; reviewsDone: number }>;
  totalReviews: number;
  correctReviews: number;
}

export interface StatsSummary {
  totalWordsEncountered: number;
  uniqueLemmasEncountered: number;
  knownLemmasCount: number;
  learningLemmasCount: number;
  totalReviews: number;
  reviewAccuracy: number;
  readingDaysCount: number;
  progressiveStage: ProgressiveReadingStage;
  dailyActivity: Record<string, { wordsRead: number; wordsLearned: number; reviewsDone: number }>;
}

const CORE_HIGH_FREQ_LATIN_PARTICLES = new Set([
  'et',
  'in',
  'ad',
  'non',
  'est',
  'sunt',
  'de',
  'ex',
  'ab',
  'a',
  'per',
  'cum',
  'sed',
  'aut',
  'vel',
  'ut',
  'si',
]);

export class StatsTracker {
  private vocabStore: VocabularyStore;
  private totalWordsEncountered = 0;
  private encounteredLemmas: Set<string> = new Set();
  private pagesRead: Set<string> = new Set();
  private dailyActivity: Record<string, { wordsRead: number; wordsLearned: number; reviewsDone: number }> = {};
  private totalReviews = 0;
  private correctReviews = 0;

  constructor(vocabStore: VocabularyStore, initial?: ReadingStatsSnapshot) {
    this.vocabStore = vocabStore;
    if (initial) {
      this.loadSnapshot(initial);
    }
  }

  public loadSnapshot(snapshot: ReadingStatsSnapshot): void {
    this.totalWordsEncountered = snapshot.totalWordsEncountered || 0;
    this.encounteredLemmas = new Set(snapshot.encounteredLemmas || []);
    this.pagesRead = new Set(snapshot.pagesRead || []);
    this.dailyActivity = { ...(snapshot.dailyActivity || {}) };
    this.totalReviews = snapshot.totalReviews || 0;
    this.correctReviews = snapshot.correctReviews || 0;
  }

  public mergeSnapshot(snapshot?: ReadingStatsSnapshot | null): boolean {
    if (!snapshot) return false;
    let changed = false;

    if ((snapshot.totalWordsEncountered || 0) > this.totalWordsEncountered) {
      this.totalWordsEncountered = snapshot.totalWordsEncountered;
      changed = true;
    }
    for (const l of snapshot.encounteredLemmas || []) {
      if (!this.encounteredLemmas.has(l)) {
        this.encounteredLemmas.add(l);
        changed = true;
      }
    }
    for (const p of snapshot.pagesRead || []) {
      if (!this.pagesRead.has(p)) {
        this.pagesRead.add(p);
        changed = true;
      }
    }
    for (const [dayKey, act] of Object.entries(snapshot.dailyActivity || {})) {
      const cur = this.dailyActivity[dayKey];
      if (!cur) {
        this.dailyActivity[dayKey] = { ...act };
        changed = true;
      } else {
        const nextWords = Math.max(cur.wordsRead || 0, act.wordsRead || 0);
        const nextLearned = Math.max(cur.wordsLearned || 0, act.wordsLearned || 0);
        const nextReviews = Math.max(cur.reviewsDone || 0, act.reviewsDone || 0);
        if (
          nextWords !== cur.wordsRead ||
          nextLearned !== cur.wordsLearned ||
          nextReviews !== cur.reviewsDone
        ) {
          this.dailyActivity[dayKey] = {
            wordsRead: nextWords,
            wordsLearned: nextLearned,
            reviewsDone: nextReviews,
          };
          changed = true;
        }
      }
    }
    if ((snapshot.totalReviews || 0) > this.totalReviews) {
      this.totalReviews = snapshot.totalReviews;
      changed = true;
    }
    if ((snapshot.correctReviews || 0) > this.correctReviews) {
      this.correctReviews = snapshot.correctReviews;
      changed = true;
    }
    return changed;
  }

  public toSnapshot(): ReadingStatsSnapshot {
    return {
      totalWordsEncountered: this.totalWordsEncountered,
      encounteredLemmas: Array.from(this.encounteredLemmas),
      pagesRead: Array.from(this.pagesRead),
      dailyActivity: this.dailyActivity,
      totalReviews: this.totalReviews,
      correctReviews: this.correctReviews,
    };
  }

  private getTodayKey(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
  }

  private ensureDay(dateKey: string): { wordsRead: number; wordsLearned: number; reviewsDone: number } {
    if (!this.dailyActivity[dateKey]) {
      this.dailyActivity[dateKey] = { wordsRead: 0, wordsLearned: 0, reviewsDone: 0 };
    }
    return this.dailyActivity[dateKey];
  }

  public computeTextCoverage(text: string): TextCoverageReport {
    const rawTokens = text
      .trim()
      .split(/\s+/)
      .map((t) => cleanLatinString(t))
      .filter((t) => t.length > 0 && !/^[ivxlcdm]+$/i.test(t));

    if (rawTokens.length === 0) {
      return {
        totalWords: 0,
        uniqueLemmas: 0,
        knownWords: 0,
        learningWords: 0,
        unfamiliarWords: 0,
        knownPercentage: 100,
        learningPercentage: 0,
        unfamiliarPercentage: 0,
      };
    }

    const lemmasInText = new Set<string>();
    let knownWords = 0;
    let learningWords = 0;
    let unfamiliarWords = 0;

    const useFullMorph = isLexicalDataLoaded();

    for (const tok of rawTokens) {
      const lemma = useFullMorph
        ? cleanLatinString(analyzeWord(tok).primaryLemma || tok)
        : quickResolveTokenLemma(tok);
      lemmasInText.add(lemma);

      const fam = this.vocabStore.getLemmaFamiliarity(lemma) || this.vocabStore.getLemmaFamiliarity(tok);
      if (fam === 4 || CORE_HIGH_FREQ_LATIN_PARTICLES.has(tok)) {
        knownWords++;
      } else if (fam >= 1 && fam <= 3) {
        learningWords++;
      } else {
        unfamiliarWords++;
      }
    }

    const total = rawTokens.length;
    return {
      totalWords: total,
      uniqueLemmas: lemmasInText.size,
      knownWords,
      learningWords,
      unfamiliarWords,
      knownPercentage: Number(((knownWords / total) * 100).toFixed(1)),
      learningPercentage: Number(((learningWords / total) * 100).toFixed(1)),
      unfamiliarPercentage: Number(((unfamiliarWords / total) * 100).toFixed(1)),
    };
  }

  public RecordAndComputePageCoverage(
    text: string,
    pageId: string,
    now: Date = new Date()
  ): TextCoverageReport {
    const report = this.computeTextCoverage(text);
    const rawTokens = text
      .trim()
      .split(/\s+/)
      .map((t) => cleanLatinString(t))
      .filter((t) => t.length > 0);

    if (!this.pagesRead.has(pageId)) {
      this.pagesRead.add(pageId);
      this.totalWordsEncountered += rawTokens.length;
      const day = this.ensureDay(this.getTodayKey(now));
      day.wordsRead += rawTokens.length;
    }

    const useFullMorph = isLexicalDataLoaded();
    for (const tok of rawTokens) {
      const lemma = useFullMorph
        ? cleanLatinString(analyzeWord(tok).primaryLemma || tok)
        : quickResolveTokenLemma(tok);
      this.encounteredLemmas.add(lemma);
    }

    return report;
  }

  public recordReviewOutcome(correct: boolean, rating: FSRSRating, now: Date = new Date()): void {
    this.totalReviews += 1;
    if (correct && rating >= 2) {
      this.correctReviews += 1;
    }
    const day = this.ensureDay(this.getTodayKey(now));
    day.reviewsDone += 1;
    if (rating >= 3) {
      day.wordsLearned += 1;
    }
  }

  public getSummary(): StatsSummary {
    const allVocab = this.vocabStore.getAll();
    const snap = this.vocabStore.toSnapshot();
    const knownLemmasCount = snap.knownLemmas.length;
    const learningLemmasCount = allVocab.filter((e) => e.familiarity >= 1 && e.familiarity <= 3).length;
    const reviewAccuracy =
      this.totalReviews > 0 ? Number(((this.correctReviews / this.totalReviews) * 100).toFixed(1)) : 100;

    let progressiveStage: ProgressiveReadingStage =
      'Stage 1: Assisted Scholastic Reading (Full Glosses & Highlights)';
    if (knownLemmasCount >= 500) {
      progressiveStage = 'Stage 4: Independent Thomistic Scholar (Minimal Distraction)';
    } else if (knownLemmasCount >= 150) {
      progressiveStage = 'Stage 3: Advanced Scholastic Reader (Unfamiliar Terms Only)';
    } else if (knownLemmasCount >= 30) {
      progressiveStage = 'Stage 2: Guided Thomistic Reading (Learning Highlights + Context Cues)';
    }

    return {
      totalWordsEncountered: this.totalWordsEncountered,
      uniqueLemmasEncountered: this.encounteredLemmas.size,
      knownLemmasCount,
      learningLemmasCount,
      totalReviews: this.totalReviews,
      reviewAccuracy,
      readingDaysCount: Object.keys(this.dailyActivity).length,
      progressiveStage,
      dailyActivity: this.dailyActivity,
    };
  }
}
