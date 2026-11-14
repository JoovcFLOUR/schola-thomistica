import {
  FSRSCard,
  FSRSRating,
  FSRSReviewLog,
  createEmptyFSRSCard,
  scheduleFSRSReview,
} from './fsrs';
import { cleanLatinString } from './normalizer';

export type FamiliarityLevel = 0 | 1 | 2 | 3 | 4;
// 0 = Unseen, 1 = New/Learning, 2 = Familiar, 3 = Learned, 4 = Known/Mastered

export interface VocabularyEntry {
  id: string;
  word: string;
  lemma: string;
  headword: string;
  translation: string;
  customDefinition?: string;
  contextualMeaning: string;
  partOfSpeech: string;
  morphologySummary: string;
  originalSentence: string;
  sentenceTranslation: string;
  sourceWork: string;
  sourceCitation: string;
  sourceUrl: string;
  savedAt: string;
  updatedAt: string;
  familiarity: FamiliarityLevel;
  tags: string[];
  notes: string;
  fsrsCard: FSRSCard;
  reviewHistory: FSRSReviewLog[];
}

export interface SaveWordInput {
  word: string;
  lemma: string;
  headword?: string;
  translation: string;
  customDefinition?: string;
  contextualMeaning?: string;
  partOfSpeech: string;
  morphologySummary: string;
  originalSentence: string;
  sentenceTranslation: string;
  sourceWork?: string;
  sourceCitation?: string;
  sourceUrl?: string;
  familiarity?: FamiliarityLevel;
  tags?: string[];
  notes?: string;
}

export interface VocabularyStoreSnapshot {
  entries: VocabularyEntry[];
  knownLemmas: string[];
  deletedLemmas?: Record<string, string>;
}

export class VocabularyStore {
  private entries: Map<string, VocabularyEntry> = new Map();
  private lemmaToId: Map<string, string> = new Map();
  private knownLemmas: Set<string> = new Set();
  private deletedLemmas: Map<string, string> = new Map();

  constructor(initial?: VocabularyStoreSnapshot) {
    if (initial) {
      this.loadSnapshot(initial);
    }
  }

  public loadSnapshot(snapshot: VocabularyStoreSnapshot): void {
    this.entries.clear();
    this.lemmaToId.clear();
    this.knownLemmas.clear();
    this.deletedLemmas.clear();
    this.mergeSnapshot(snapshot);
  }

  public mergeSnapshot(snapshot?: VocabularyStoreSnapshot | null): boolean {
    if (!snapshot) return false;
    let changed = false;

    if (snapshot.deletedLemmas && typeof snapshot.deletedLemmas === 'object') {
      for (const [rawLemma, delIso] of Object.entries(snapshot.deletedLemmas)) {
        const norm = cleanLatinString(rawLemma);
        if (!norm || !delIso) continue;
        const prevDel = this.deletedLemmas.get(norm);
        const delTime = new Date(delIso).getTime() || 0;
        const prevDelTime = prevDel ? new Date(prevDel).getTime() || 0 : 0;
        if (!prevDel || delTime > prevDelTime) {
          this.deletedLemmas.set(norm, delIso);
          changed = true;
        }
        const existingId = this.lemmaToId.get(norm);
        const existing = existingId ? this.entries.get(existingId) : undefined;
        if (existing) {
          const exTime = new Date(existing.updatedAt || existing.savedAt || 0).getTime() || 0;
          if (delTime >= exTime) {
            this.entries.delete(existing.id);
            this.lemmaToId.delete(norm);
            this.knownLemmas.delete(norm);
            changed = true;
          }
        } else if (this.knownLemmas.has(norm)) {
          this.knownLemmas.delete(norm);
          changed = true;
        }
      }
    }

    for (const rawLemma of snapshot.knownLemmas || []) {
      const norm = cleanLatinString(rawLemma);
      if (norm && !this.deletedLemmas.has(norm) && !this.knownLemmas.has(norm)) {
        this.knownLemmas.add(norm);
        changed = true;
      }
    }

    for (const rawEntry of snapshot.entries || []) {
      if (!rawEntry || (!rawEntry.lemma && !rawEntry.word)) continue;
      const normLemma = cleanLatinString(rawEntry.lemma || rawEntry.word);
      const incomingTime = new Date(rawEntry.updatedAt || rawEntry.savedAt || 0).getTime() || 0;
      const tombstoneIso = this.deletedLemmas.get(normLemma);
      if (tombstoneIso) {
        const tombTime = new Date(tombstoneIso).getTime() || 0;
        if (incomingTime <= tombTime) {
          continue;
        }
        this.deletedLemmas.delete(normLemma);
      }

      const sanitizeTranslation = (val: string | undefined): string => {
        if (!val) return '';
        const low = val.toLowerCase();
        if (normLemma === 'sum' && low.includes('take up')) return 'to be, exist';
        if ((normLemma === 'qui' || normLemma === 'quis' || normLemma === 'quod') && low.startsWith('be able')) {
          return 'who, which, what, that';
        }
        return val;
      };

      const incoming: VocabularyEntry = {
        ...rawEntry,
        lemma: normLemma,
        translation: sanitizeTranslation(rawEntry.translation),
        contextualMeaning: sanitizeTranslation(rawEntry.contextualMeaning || rawEntry.translation),
        tags: Array.isArray(rawEntry.tags) ? rawEntry.tags : [],
        reviewHistory: Array.isArray(rawEntry.reviewHistory) ? rawEntry.reviewHistory : [],
      };

      const existingId =
        (incoming.id && this.entries.has(incoming.id) ? incoming.id : undefined) ||
        this.lemmaToId.get(normLemma);
      const existing = existingId ? this.entries.get(existingId) : undefined;

      if (!existing) {
        const finalFam: FamiliarityLevel = this.knownLemmas.has(normLemma) ? 4 : incoming.familiarity;
        const stored: VocabularyEntry = { ...incoming, familiarity: finalFam };
        this.entries.set(stored.id, stored);
        this.lemmaToId.set(normLemma, stored.id);
        if (stored.familiarity === 4) {
          this.knownLemmas.add(normLemma);
        }
        changed = true;
        continue;
      }

      const existingTime = new Date(existing.updatedAt || existing.savedAt || 0).getTime() || 0;
      const incomingWins =
        incomingTime > existingTime ||
        (incomingTime === existingTime &&
          (incoming.reviewHistory.length > existing.reviewHistory.length ||
            incoming.familiarity > existing.familiarity));

      const mergedTags = Array.from(new Set([...existing.tags, ...incoming.tags]));
      const historyMap = new Map<string, FSRSReviewLog>();
      for (const h of [...existing.reviewHistory, ...incoming.reviewHistory]) {
        if (h && h.reviewedAt) {
          historyMap.set(`${h.reviewedAt}|${h.rating}`, h);
        }
      }
      const mergedHistory = Array.from(historyMap.values()).sort(
        (a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime()
      );

      const winner = incomingWins ? incoming : existing;
      const finalFam: FamiliarityLevel =
        this.knownLemmas.has(normLemma) || existing.familiarity === 4 || incoming.familiarity === 4
          ? 4
          : winner.familiarity;

      const mergedEntry: VocabularyEntry = {
        ...existing,
        ...winner,
        id: existing.id,
        lemma: normLemma,
        familiarity: finalFam,
        customDefinition:
          incomingTime !== existingTime
            ? winner.customDefinition !== undefined
              ? winner.customDefinition
              : existing.customDefinition ?? incoming.customDefinition
            : existing.customDefinition || incoming.customDefinition || winner.customDefinition,
        notes:
          incomingTime !== existingTime
            ? winner.notes !== undefined
              ? winner.notes
              : existing.notes ?? incoming.notes ?? ''
            : existing.notes || incoming.notes || '',
        tags: mergedTags,
        reviewHistory: mergedHistory,
        updatedAt:
          incomingTime >= existingTime
            ? incoming.updatedAt || existing.updatedAt
            : existing.updatedAt,
      };

      if (JSON.stringify(mergedEntry) !== JSON.stringify(existing)) {
        this.entries.set(existing.id, mergedEntry);
        this.lemmaToId.set(normLemma, existing.id);
        changed = true;
      }
      if (mergedEntry.familiarity === 4) {
        this.knownLemmas.add(normLemma);
      }
    }

    for (const norm of this.knownLemmas) {
      const id = this.lemmaToId.get(norm);
      if (id && this.entries.has(id)) {
        const entry = this.entries.get(id)!;
        if (entry.familiarity !== 4) {
          this.entries.set(id, { ...entry, familiarity: 4 });
          changed = true;
        }
      }
    }

    return changed;
  }

  public toSnapshot(): VocabularyStoreSnapshot {
    return {
      entries: this.getAll(),
      knownLemmas: Array.from(this.knownLemmas),
      deletedLemmas: Object.fromEntries(this.deletedLemmas),
    };
  }

  public saveWord(input: SaveWordInput, now: Date = new Date()): VocabularyEntry {
    const normLemma = cleanLatinString(input.lemma || input.word);
    this.deletedLemmas.delete(normLemma);
    const existingId = this.lemmaToId.get(normLemma);
    if (existingId && this.entries.has(existingId)) {
      const existing = this.entries.get(existingId)!;
      const updated: VocabularyEntry = {
        ...existing,
        word: input.word,
        translation: input.translation || existing.translation,
        customDefinition:
          input.customDefinition !== undefined ? input.customDefinition : existing.customDefinition,
        contextualMeaning: input.contextualMeaning || existing.contextualMeaning,
        morphologySummary: input.morphologySummary || existing.morphologySummary,
        originalSentence: input.originalSentence || existing.originalSentence,
        sentenceTranslation: input.sentenceTranslation || existing.sentenceTranslation,
        sourceWork: input.sourceWork || existing.sourceWork,
        sourceCitation: input.sourceCitation || existing.sourceCitation,
        sourceUrl: input.sourceUrl || existing.sourceUrl,
        familiarity: input.familiarity ?? existing.familiarity,
        tags: input.tags ? Array.from(new Set([...existing.tags, ...input.tags])) : existing.tags,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedAt: now.toISOString(),
      };
      this.entries.set(existingId, updated);
      return updated;
    }

    const id = `voc_${normLemma}_${now.getTime().toString(36)}`;
    const familiarity = input.familiarity ?? 1;
    const entry: VocabularyEntry = {
      id,
      word: input.word,
      lemma: normLemma,
      headword: input.headword || input.lemma || input.word,
      translation: input.translation,
      customDefinition: input.customDefinition,
      contextualMeaning: input.contextualMeaning || input.translation,
      partOfSpeech: input.partOfSpeech,
      morphologySummary: input.morphologySummary,
      originalSentence: input.originalSentence,
      sentenceTranslation: input.sentenceTranslation,
      sourceWork: input.sourceWork || 'Corpus Thomisticum',
      sourceCitation: input.sourceCitation || '',
      sourceUrl: input.sourceUrl || '',
      savedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      familiarity,
      tags: input.tags || [],
      notes: input.notes || '',
      fsrsCard: createEmptyFSRSCard(now),
      reviewHistory: [],
    };

    this.entries.set(id, entry);
    this.lemmaToId.set(normLemma, id);
    if (familiarity === 4) {
      this.knownLemmas.add(normLemma);
    }
    return entry;
  }

  public updateEntry(
    id: string,
    patch: Partial<
      Pick<
        VocabularyEntry,
        | 'translation'
        | 'customDefinition'
        | 'contextualMeaning'
        | 'notes'
        | 'tags'
        | 'familiarity'
        | 'originalSentence'
        | 'sentenceTranslation'
      >
    >,
    now: Date = new Date()
  ): VocabularyEntry | undefined {
    const existing = this.entries.get(id);
    if (!existing) return undefined;
    const updated: VocabularyEntry = {
      ...existing,
      ...patch,
      updatedAt: now.toISOString(),
    };
    this.entries.set(id, updated);
    if (updated.familiarity === 4) {
      this.knownLemmas.add(updated.lemma.toLowerCase());
    } else if (patch.familiarity !== undefined && patch.familiarity < 4) {
      this.knownLemmas.delete(updated.lemma.toLowerCase());
    }
    return updated;
  }

  public reviewEntry(id: string, rating: FSRSRating, now: Date = new Date()): VocabularyEntry | undefined {
    const existing = this.entries.get(id);
    if (!existing) return undefined;
    const { card, log } = scheduleFSRSReview(existing.fsrsCard, rating, now);

    let familiarity = existing.familiarity;
    if (rating === 1) {
      familiarity = 1;
    } else if (rating === 2) {
      familiarity = Math.max(1, familiarity) as FamiliarityLevel;
    } else if (rating === 3) {
      familiarity = (card.reps >= 3 ? 3 : 2) as FamiliarityLevel;
    } else if (rating === 4) {
      familiarity = (card.reps >= 2 ? 4 : 3) as FamiliarityLevel;
    }

    const updated: VocabularyEntry = {
      ...existing,
      familiarity,
      fsrsCard: card,
      reviewHistory: [...existing.reviewHistory, log],
      updatedAt: now.toISOString(),
    };
    this.entries.set(id, updated);
    if (familiarity === 4) {
      this.knownLemmas.add(updated.lemma.toLowerCase());
    }
    return updated;
  }

  public removeEntry(id: string, now: Date = new Date()): boolean {
    const existing = this.entries.get(id);
    if (!existing) return false;
    const norm = existing.lemma.toLowerCase();
    this.lemmaToId.delete(norm);
    this.knownLemmas.delete(norm);
    this.deletedLemmas.set(norm, now.toISOString());
    return this.entries.delete(id);
  }

  public markLemmaKnown(lemma: string, now: Date = new Date()): void {
    const norm = cleanLatinString(lemma);
    if (!norm) return;
    this.deletedLemmas.delete(norm);
    this.knownLemmas.add(norm);
    const id = this.lemmaToId.get(norm);
    if (id && this.entries.has(id)) {
      const existing = this.entries.get(id)!;
      this.entries.set(id, { ...existing, familiarity: 4, updatedAt: now.toISOString() });
    }
  }

  public getLemmaFamiliarity(lemma: string): FamiliarityLevel {
    const norm = cleanLatinString(lemma);
    if (this.knownLemmas.has(norm)) return 4;
    const id = this.lemmaToId.get(norm);
    if (id && this.entries.has(id)) {
      return this.entries.get(id)!.familiarity;
    }
    return 0;
  }

  public getByLemma(lemma: string): VocabularyEntry | undefined {
    const id = this.lemmaToId.get(cleanLatinString(lemma));
    return id ? this.entries.get(id) : undefined;
  }

  public getAll(): VocabularyEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
  }

  public getDueEntries(now: Date = new Date()): VocabularyEntry[] {
    return this.getAll().filter(
      (e) => e.familiarity < 4 && new Date(e.fsrsCard.due).getTime() <= now.getTime()
    );
  }

  public exportAnkiTSV(): string {
    const header =
      '#separator:tab\n#html:true\n#columns:Front\tBack\tCustomDefinition\tNotes\tLemma\tMorphology\tSentence\tSentenceTranslation\tCitation\tTags\n';
    const rows = this.getAll().map((e) => {
      const cols = [
        e.word,
        e.translation,
        e.customDefinition || '',
        e.notes || '',
        e.headword,
        e.morphologySummary,
        e.originalSentence,
        e.sentenceTranslation,
        `${e.sourceWork} ${e.sourceCitation}`.trim(),
        e.tags.join(' '),
      ].map((c) => c.replace(/[\t\r\n]+/g, ' ').trim());
      return cols.join('\t');
    });
    return header + rows.join('\n');
  }

  public exportJSON(): string {
    return JSON.stringify(this.toSnapshot(), null, 2);
  }
}
