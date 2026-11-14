import { describe, it, expect } from 'vitest';
import {
  createEmptyFSRSCard,
  scheduleFSRSReview,
  computeRetrievability,
  generatePhrasePumpSession,
} from '../src/core/fsrs';
import { VocabularyStore } from '../src/core/vocabulary-store';
import { StatsTracker } from '../src/core/stats-tracker';

describe('Task 6: FSRS Spaced Repetition, PhrasePump, Personal Vocabulary & Reading Stats', () => {
  it('schedules reviews using FSRS with monotonically increasing stability and intervals for Again < Hard < Good < Easy', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    const baseCard = createEmptyFSRSCard(now);

    const again = scheduleFSRSReview(baseCard, 1, now);
    const hard = scheduleFSRSReview(baseCard, 2, now);
    const good = scheduleFSRSReview(baseCard, 3, now);
    const easy = scheduleFSRSReview(baseCard, 4, now);

    expect(again.card.stability).toBeLessThan(hard.card.stability);
    expect(hard.card.stability).toBeLessThan(good.card.stability);
    expect(good.card.stability).toBeLessThan(easy.card.stability);

    expect(again.card.scheduledDays).toBeLessThanOrEqual(hard.card.scheduledDays);
    expect(good.card.scheduledDays).toBeLessThan(easy.card.scheduledDays);

    // Second review after scheduled interval increases stability further
    const later = new Date(now.getTime() + good.card.scheduledDays * 86400_000);
    const r = computeRetrievability(good.card, later);
    expect(r).toBeGreaterThan(0.7);
    expect(r).toBeLessThanOrEqual(1.0);

    const secondGood = scheduleFSRSReview(good.card, 3, later);
    expect(secondGood.card.stability).toBeGreaterThan(good.card.stability);
    expect(secondGood.card.scheduledDays).toBeGreaterThan(good.card.scheduledDays);
  });

  it('stores, edits, organizes, removes, and exports vocabulary entries with full contextual metadata', () => {
    const store = new VocabularyStore();
    const entry = store.saveWord({
      word: 'doctrinam',
      lemma: 'doctrina',
      headword: 'doctrina, -ae (f.)',
      translation: 'teaching, doctrine, sacred science',
      contextualMeaning: 'sacred doctrine revealed by God beyond natural philosophy',
      partOfSpeech: 'Noun',
      morphologySummary: 'Accusative Singular Feminine, 1st declension',
      originalSentence:
        'Videtur quod non sit necessarium, praeter philosophicas disciplinas, aliam doctrinam haberi.',
      sentenceTranslation:
        'It seems that, besides philosophical science, we have no need of any further knowledge.',
      sourceWork: 'Summa Theologiae',
      sourceCitation: '[28233] Iª q. 1 a. 1 arg. 1',
      sourceUrl: 'https://www.corpusthomisticum.org/sth1001.html#28233',
      tags: ['Thomistic Key Term', 'ST I q. 1'],
    });

    expect(entry.id).toBeTruthy();
    expect(entry.lemma).toBe('doctrina');
    expect(entry.savedAt).toBeTruthy();
    expect(store.getAll()).toHaveLength(1);

    // Edit entry
    const updated = store.updateEntry(entry.id, {
      notes: 'Central concept of Question 1',
      familiarity: 2,
      tags: ['Thomistic Key Term', 'ST I q. 1', 'Epistemology'],
    });
    expect(updated?.notes).toBe('Central concept of Question 1');
    expect(updated?.familiarity).toBe(2);

    // Export Anki TSV and JSON
    const ankiTsv = store.exportAnkiTSV();
    expect(ankiTsv).toContain('doctrinam');
    expect(ankiTsv).toContain('doctrina, -ae (f.)');
    expect(ankiTsv).toContain('Videtur quod non sit necessarium');

    // Remove entry
    expect(store.removeEntry(entry.id)).toBe(true);
    expect(store.getAll()).toHaveLength(0);
  });

  it('generates PhrasePump contextual active recall exercises (cloze, la-to-en, en-to-la, grammar)', () => {
    const store = new VocabularyStore();
    store.saveWord({
      word: 'salutem',
      lemma: 'salus',
      headword: 'salus, salutis (f.)',
      translation: 'salvation, eternal beatitude',
      contextualMeaning: 'human salvation in God',
      partOfSpeech: 'Noun',
      morphologySummary: 'Accusative Singular Feminine, 3rd declension',
      originalSentence:
        'Respondeo dicendum quod necessarium fuit ad humanam salutem, esse doctrinam quandam secundum revelationem divinam.',
      sentenceTranslation:
        'I answer that, It was necessary for man\'s salvation that there should be a knowledge revealed by God.',
      sourceWork: 'Summa Theologiae',
      sourceCitation: '[28236] Iª q. 1 a. 1 co.',
      sourceUrl: 'https://www.corpusthomisticum.org/sth1001.html#28236',
    });

    const cards = store.getAll();
    const session = generatePhrasePumpSession(cards, { mode: 'mixed', limit: 10 });
    expect(session.exercises.length).toBeGreaterThanOrEqual(3);

    const clozeEx = session.exercises.find((e) => e.type === 'phrasepump-cloze');
    expect(clozeEx).toBeDefined();
    expect(clozeEx?.clozeSentence).toContain('[ _____ ]');
    expect(clozeEx?.clozeSentence).not.toContain('salutem');
    expect(clozeEx?.expectedAnswer).toBe('salutem');
  });

  it('tracks reading statistics, vocabulary coverage, review accuracy, and progressive reading level', () => {
    const store = new VocabularyStore();
    const tracker = new StatsTracker(store);

    const sampleText =
      'Videtur quod non sit necessarium praeter philosophicas disciplinas aliam doctrinam haberi.';
    const covBefore = tracker.RecordAndComputePageCoverage(sampleText, 'sth1001.html');
    expect(covBefore.totalWords).toBe(11);
    expect(covBefore.uniqueLemmas).toBeGreaterThan(5);

    // Mark some lemmas as known and save one as learning
    store.markLemmaKnown('video');
    store.markLemmaKnown('quod');
    store.markLemmaKnown('non');
    store.markLemmaKnown('sum');
    store.markLemmaKnown('necessarius');

    const covAfter = tracker.computeTextCoverage(sampleText);
    expect(covAfter.knownPercentage).toBeGreaterThan(covBefore.knownPercentage);

    tracker.recordReviewOutcome(true, 3);
    tracker.recordReviewOutcome(true, 4);
    tracker.recordReviewOutcome(false, 1);

    const summary = tracker.getSummary();
    expect(summary.totalReviews).toBe(3);
    expect(summary.reviewAccuracy).toBeCloseTo(66.7, 0);
    expect(summary.progressiveStage).toBeDefined();
  });

  it('merges vocabulary and stats snapshots across origins by id/lemma and updatedAt without data loss (DEF-001)', () => {
    const localStore = new VocabularyStore();
    const t1 = new Date('2026-11-01T10:00:00Z');
    const t2 = new Date('2026-11-05T10:00:00Z');

    localStore.saveWord(
      {
        word: 'doctrinam',
        lemma: 'doctrina',
        translation: 'doctrine',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Sacram doctrinam.',
        sentenceTranslation: 'Sacred doctrine.',
        familiarity: 1,
      },
      t1
    );
    localStore.saveWord(
      {
        word: 'rationem',
        lemma: 'ratio',
        translation: 'reason',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Per rationem.',
        sentenceTranslation: 'By reason.',
        familiarity: 2,
      },
      t1
    );

    const sharedStore = new VocabularyStore();
    const sharedDoc = sharedStore.saveWord(
      {
        word: 'doctrinam',
        lemma: 'doctrina',
        translation: 'sacred doctrine',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Sacram doctrinam.',
        sentenceTranslation: 'Sacred doctrine.',
        familiarity: 1,
      },
      t1
    );
    sharedStore.reviewEntry(sharedDoc.id, 3, t2);
    sharedStore.saveWord(
      {
        word: 'salutem',
        lemma: 'salus',
        translation: 'salvation',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Ad humanam salutem.',
        sentenceTranslation: 'For human salvation.',
        familiarity: 2,
      },
      t2
    );
    sharedStore.markLemmaKnown('ens');

    const changed = localStore.mergeSnapshot(sharedStore.toSnapshot());
    expect(changed).toBe(true);
    expect(localStore.getAll()).toHaveLength(3);
    expect(localStore.getByLemma('salus')?.translation).toBe('salvation');
    expect(localStore.getByLemma('ratio')?.translation).toBe('reason');
    expect(localStore.getByLemma('doctrina')?.translation).toBe('sacred doctrine');
    expect(localStore.getByLemma('doctrina')?.reviewHistory).toHaveLength(1);
    expect(localStore.getLemmaFamiliarity('ens')).toBe(4);
  });

  it('stores, updates, merges, exports, and schedules customDefinition and personal notes per lemma', () => {
    const store = new VocabularyStore();
    const t1 = new Date('2026-11-13T10:00:00Z');
    const t2 = new Date('2026-11-13T11:00:00Z');

    const saved = store.saveWord(
      {
        word: 'salutem',
        lemma: 'salus',
        headword: 'salus, salutis (f.)',
        translation: 'salvation, welfare',
        customDefinition: 'beatitudo supernaturalis in Deo',
        notes: 'Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.',
        partOfSpeech: 'Noun',
        morphologySummary: 'Accusative Singular Feminine',
        originalSentence: 'Necessarium fuit ad humanam salutem.',
        sentenceTranslation: 'It was necessary for human salvation.',
        sourceCitation: '[28236] I q. 1 a. 1 co.',
      },
      t1
    );

    expect(saved.customDefinition).toBe('beatitudo supernaturalis in Deo');
    expect(saved.notes).toBe('Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');

    // Saving familiarity change on the same lemma without passing customDefinition/notes preserves them
    const reSaved = store.saveWord(
      {
        word: 'salutis',
        lemma: 'salus',
        translation: 'salvation, welfare',
        partOfSpeech: 'Noun',
        morphologySummary: 'Genitive Singular Feminine',
        originalSentence: 'Via salutis.',
        sentenceTranslation: 'The way of salvation.',
        familiarity: 3,
      },
      t2
    );
    expect(reSaved.customDefinition).toBe('beatitudo supernaturalis in Deo');
    expect(reSaved.notes).toBe('Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');
    expect(reSaved.familiarity).toBe(3);

    // PhrasePump uses customDefinition and includes userNotes
    const session = generatePhrasePumpSession(store.getAll(), { mode: 'la-to-en', limit: 5 });
    expect(session.exercises[0].expectedAnswer).toContain('beatitudo supernaturalis in Deo');
    expect(session.exercises[0].userNotes).toBe('Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');

    // Anki TSV includes customDefinition and Notes column while keeping plain translation in Back (BUG-09.3)
    const tsv = store.exportAnkiTSV();
    expect(tsv).toContain('#columns:Front\tBack\tCustomDefinition\tNotes\tLemma');
    expect(tsv).toContain('salutis\tsalvation, welfare\tbeatitudo supernaturalis in Deo\tCf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');

    // Clearing customDefinition via updateEntry("") falls back cleanly
    const cleared = store.updateEntry(saved.id, { customDefinition: '', notes: '' }, t2);
    expect(cleared?.customDefinition).toBe('');
    expect(cleared?.notes).toBe('');
    expect(cleared?.translation).toBe('salvation, welfare');

    // QA Finding #3: Merging an older snapshot into a newer snapshot where customDefinition/notes were cleared ("") must NOT resurrect the deleted strings
    const olderStore = new VocabularyStore();
    olderStore.saveWord(
      {
        word: 'salutem',
        lemma: 'salus',
        translation: 'salvation, welfare',
        customDefinition: 'stale custom def',
        notes: 'stale note',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Ad salutem.',
        sentenceTranslation: 'For salvation.',
      },
      t1
    );
    store.mergeSnapshot(olderStore.toSnapshot());
    expect(store.getByLemma('salus')?.customDefinition).toBe('');
    expect(store.getByLemma('salus')?.notes).toBe('');

    // BUG-02: Removing an entry records a deletion tombstone so merging an older snapshot does NOT resurrect the deleted entry
    store.markLemmaKnown('salus');
    expect(store.getLemmaFamiliarity('salus')).toBe(4);
    store.removeEntry(saved.id, new Date('2026-11-13T12:00:00Z'));
    expect(store.getLemmaFamiliarity('salus')).toBe(0);
    store.mergeSnapshot(olderStore.toSnapshot());
    expect(store.getByLemma('salus')).toBeUndefined();
    expect(store.getLemmaFamiliarity('salus')).toBe(0);

    // BUG-01 migration: mergeSnapshot automatically repairs corrupted qui/quis = "be able" entries
    store.mergeSnapshot({
      entries: [
        {
          id: 'voc_qui_1',
          word: 'quod',
          lemma: 'qui',
          headword: 'qui, quae, quod',
          translation: 'be able',
          contextualMeaning: 'be able',
          partOfSpeech: 'Pronoun',
          morphologySummary: 'Nom/Acc Sg N',
          originalSentence: 'Videtur quod non.',
          sentenceTranslation: 'It seems that not.',
          sourceWork: 'ST',
          sourceCitation: 'I q. 1 a. 1',
          sourceUrl: '',
          savedAt: t1.toISOString(),
          updatedAt: t1.toISOString(),
          familiarity: 1,
          tags: [],
          notes: '',
          fsrsCard: createEmptyFSRSCard(t1),
          reviewHistory: [],
        },
      ],
      knownLemmas: [],
    });
    expect(store.getByLemma('qui')?.translation).not.toContain('be able');
    expect(store.getByLemma('qui')?.translation).toContain('who, which');
  });
});
