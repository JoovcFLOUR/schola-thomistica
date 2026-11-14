import {
  getThomisticEntries,
  getEcclesiasticalEntries,
  getWiktionaryEntries,
  getLewisShortEntries,
  registerOnDataHydrated,
  WiktionaryEntryData,
} from './data-loader';
import { normalizeLatinWord, EncliticInfo } from './normalizer';
import { parseWordMorphology, MorphologicalParse } from './morphology';

export type DictionarySourceName =
  | 'Thomistic Lexicon'
  | 'Ecclesiastical Latin Dictionary'
  | 'Wiktionary'
  | 'Lewis & Short'
  | "Whitaker's Words";

export interface DictionaryEntryItem {
  source: DictionarySourceName;
  headword: string;
  definition: string;
  citations?: string[];
  latinQuotes?: string[];
  axioms?: string[];
  etymology?: string;
  sourceUrl?: string;
  ageLabel?: string;
}

export interface WordAnalysisResult {
  word: string;
  normalizedWord: string;
  primaryLemma: string;
  headword: string;
  partOfSpeech: string;
  ecclesiasticalMeaning: string;
  classicalMeaning?: string;
  morphologicalParses: MorphologicalParse[];
  enclitic?: EncliticInfo;
  compoundBreakdown?: {
    parts: string[];
    explanation: string;
  };
  dictionaryEntries: DictionaryEntryItem[];
  isThomisticKeyTerm: boolean;
  thomisticNote?: string;
}

const liveWiktionaryCache = new Map<string, WiktionaryEntryData>();

registerOnDataHydrated(() => {
  analysisCache.clear();
});

export const INLINE_THOMISTIC_GLOSSES: Record<string, string> = {
  actus: 'Act',
  actualis: 'Actual',
  actualitas: 'Actuality',
  actualiter: 'Actually',
  potentia: 'Potency',
  potentialis: 'Potential',
  essentia: 'Essence',
  essentialis: 'Essential',
  essentialiter: 'Essentially',
  existentia: 'Existence',
  esse: 'Being',
  ens: 'Being',
  entitas: 'Entity',
  substantia: 'Substance',
  substantialis: 'Substantial',
  accidens: 'Accident',
  accidentalis: 'Accidental',
  accidentaliter: 'Accidentally',
  quidditas: 'Quiddity',
  quidditative: 'Quidditatively',
  habitus: 'Habit',
  habitualis: 'Habitual',
  species: 'Species',
  speculativus: 'Speculative',
  practicus: 'Practical',
  intellectus: 'Intellect',
  intelligibilis: 'Intelligible',
  intellectualis: 'Intellectual',
  intentio: 'Intention',
  intentionalis: 'Intentional',
  ratio: 'Reason',
  rationalis: 'Rational',
  voluntas: 'Will',
  voluntarius: 'Voluntary',
  appetitus: 'Appetite',
  liberum: 'Free',
  arbitrium: 'Judgment / Choice',
  synderesis: 'Synderesis',
  conscientia: 'Conscience',
  prudentia: 'Prudence',
  iustitia: 'Justice',
  fortitudo: 'Fortitude',
  temperantia: 'Temperance',
  fides: 'Faith',
  spes: 'Hope',
  caritas: 'Charity',
  gratia: 'Grace',
  sacramentum: 'Sacrament',
  hypostasis: 'Hypostasis',
  persona: 'Person',
  suppositum: 'Supposit',
  natura: 'Nature',
  naturalis: 'Natural',
  relatio: 'Relation',
  relativus: 'Relative',
  analogia: 'Analogy',
  analogicus: 'Analogical',
  univocus: 'Univocal',
  aequivocus: 'Equivocal',
  verum: 'True',
  veritas: 'Truth',
  bonum: 'Good',
  bonitas: 'Goodness',
  malum: 'Evil',
  causa: 'Cause',
  causalis: 'Causal',
  finis: 'End',
  finalis: 'Final',
  principium: 'Principle',
  participatio: 'Participation',
  creatio: 'Creation',
  creatura: 'Creature',
  creator: 'Creator',
  providentia: 'Providence',
  praedestinatio: 'Predestination',
  beatitudo: 'Beatitude',
  beatus: 'Blessed',
  passio: 'Passion',
  peccatum: 'Sin',
  virtus: 'Virtue / Power',
  vitium: 'Vice',
  lex: 'Law',
  ius: 'Right',
  doctrina: 'Doctrine',
  scientia: 'Science',
  sapientia: 'Wisdom',
  revelatio: 'Revelation',
  revelo: 'Reveal',
  scriptura: 'Scripture',
  theologia: 'Theology',
  theologicus: 'Theological',
  philosophia: 'Philosophy',
  philosophicus: 'Philosophical',
  metaphysica: 'Metaphysics',
  obiectum: 'Object',
  subiectum: 'Subject',
  forma: 'Form',
  formalis: 'Formal',
  formaliter: 'Formally',
  materia: 'Matter',
  materialis: 'Material',
  materialiter: 'Materially',
  anima: 'Soul',
  spiritus: 'Spirit',
  spiritualis: 'Spiritual',
  corporalis: 'Corporeal',
  angelus: 'Angel',
  deus: 'God',
  divinus: 'Divine',
  trinitas: 'Trinity',
  incarnatio: 'Incarnation',
  resurrectio: 'Resurrection',
  salus: 'Salvation',
  simpliciter: 'Simply',
  inquantum: 'Insofar as',
  abstractio: 'Abstraction',
  abstraho: 'Abstract',
  abstractus: 'Abstract',
  universalis: 'Universal',
  particularis: 'Particular',
  singularis: 'Singular',
  necessarius: 'Necessary',
  contingens: 'Contingent',
  aeternitas: 'Eternity',
  aeternus: 'Eternal',
  aevum: 'Aeviternity',
  motus: 'Motion',
  operatio: 'Operation',
  perfectio: 'Perfection',
  perfectus: 'Perfect',
  infinitus: 'Infinite',
  ordo: 'Order',
  unitas: 'Unity',
  genus: 'Genus',
  differentia: 'Difference',
  definitio: 'Definition',
  demonstratio: 'Demonstration',
  syllogismus: 'Syllogism',
  articulus: 'Article',
  auctoritas: 'Authority',
  lumen: 'Light',
  sensus: 'Sense',
  phantasma: 'Phantasm',
  humanus: 'Human',
  sum: 'To be',
};

const CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS = new Set(Object.keys(INLINE_THOMISTIC_GLOSSES));

const AGE_LABELS: Record<string, string> = {
  A: 'Archaic',
  B: 'Early Latin',
  C: 'Classical',
  D: 'Late / Patristic',
  E: 'Medieval / Scholastic',
  F: 'Scholastic / Neo-Latin',
  X: 'All Periods',
};

function lookupInMap<T>(map: Record<string, T>, candidates: string[]): { key: string; entry: T } | undefined {
  for (const c of candidates) {
    if (!c) continue;
    const k = c.toLowerCase().replace(/j/g, 'i');
    if (map[k]) return { key: k, entry: map[k] };
    const kU = k.replace(/v/g, 'u');
    if (map[kU]) return { key: kU, entry: map[kU] };
    const kV = k.replace(/u/g, 'v');
    if (map[kV]) return { key: kV, entry: map[kV] };
  }
  return undefined;
}

const analysisCache = new Map<string, WordAnalysisResult>();

export function analyzeWord(rawWord: string): WordAnalysisResult {
  const thomisticEntries = getThomisticEntries();
  const ecclesiasticalEntries = getEcclesiasticalEntries();
  const wiktionaryEntries = getWiktionaryEntries();
  const lewisShortEntries = getLewisShortEntries();
  const norm = normalizeLatinWord(rawWord);
  const cached = analysisCache.get(norm.clean);
  if (cached) {
    return cached.word === rawWord ? cached : { ...cached, word: rawWord };
  }
  if (
    norm.enclitic?.particle === 'que' &&
    (thomisticEntries[norm.clean] ||
      ecclesiasticalEntries[norm.clean] ||
      wiktionaryEntries[norm.clean] ||
      lewisShortEntries[norm.clean])
  ) {
    norm.enclitic = undefined;
    norm.baseWord = norm.clean;
  }
  const targetForMorph = norm.baseWord || norm.clean;
  let parses = parseWordMorphology(targetForMorph);

  let compoundBreakdown: { parts: string[]; explanation: string } | undefined;
  if (norm.compoundParts && norm.compoundParts.length > 0) {
    const partSummaries = norm.compoundParts.map((p) => {
      const subParses = parseWordMorphology(p);
      const top = subParses[0];
      return top ? `${p} (${top.entry.senses.split(';')[0]})` : p;
    });
    compoundBreakdown = {
      parts: norm.compoundParts,
      explanation: `Scholastic compound of ${partSummaries.join(' + ')}`,
    };
    if (parses.length === 0) {
      parses = parseWordMorphology(norm.compoundParts[norm.compoundParts.length - 1]);
    }
  }

  // Put lemma candidates from highest-scoring parses first, followed by normalized word and stems
  const orderedCandidates: string[] = [];
  const addCand = (s?: string): void => {
    if (s && !orderedCandidates.includes(s.toLowerCase())) {
      orderedCandidates.push(s.toLowerCase());
    }
  };
  addCand(norm.clean);
  addCand(norm.baseWord);
  for (const p of parses) {
    addCand(p.lemma);
  }
  for (const v of norm.variants) {
    addCand(v);
  }
  for (const p of parses) {
    addCand(p.entry.stems[0]);
    addCand(p.entry.stems[1]);
  }

  const thomisticMatch = lookupInMap(thomisticEntries, orderedCandidates);

  // Boost parses whose lemma matches the exact word or the Thomistic Lexicon headword
  for (const p of parses) {
    const pLemma = p.lemma.toLowerCase();
    if (thomisticMatch && pLemma === thomisticMatch.key.toLowerCase()) {
      p.score += 35;
    }
    if (pLemma === norm.clean && p.rawPos === 'N') {
      p.score += 25;
    }
    if (p.case === 'Vocative') {
      p.score -= 15;
    }
  }
  parses.sort((a, b) => b.score - a.score);

  const topParse = parses[0];
  const primaryLemma = thomisticMatch?.key || topParse?.lemma || norm.baseWord || norm.clean;
  addCand(primaryLemma);
  // Add canonical base aliases for compound pronouns (e.g., uterque -> uter) so Lewis & Short / Wiktionary / Ecclesiastical entries resolve
  const PRONOUN_DICT_ALIASES: Record<string, string[]> = {
    uterque: ['uterque', 'uter'],
    quisque: ['quisque', 'quis'],
    unusquisque: ['unusquisque', 'quisque', 'unus'],
    quicumque: ['quicumque', 'qui'],
    denique: ['denique'],
    quousque: ['quousque', 'usque'],
    quandoque: ['quandoque', 'quando'],
  };
  const aliasList = PRONOUN_DICT_ALIASES[primaryLemma.toLowerCase()] || [];
  // Ensure primaryLemma is at the very front of lookup candidates
  const finalCandidates = [
    primaryLemma.toLowerCase(),
    ...aliasList,
    ...(topParse ? [topParse.lemma.toLowerCase()] : []),
    ...orderedCandidates,
  ];

  const eccMatch = lookupInMap(ecclesiasticalEntries, finalCandidates);
  const wikMatch =
    (liveWiktionaryCache.has(primaryLemma.toLowerCase())
      ? { key: primaryLemma.toLowerCase(), entry: liveWiktionaryCache.get(primaryLemma.toLowerCase())! }
      : undefined) || lookupInMap(wiktionaryEntries, finalCandidates);
  const lsMatch = lookupInMap(lewisShortEntries, finalCandidates);

  const headword = thomisticMatch?.entry.headword || topParse?.headword || primaryLemma;
  const partOfSpeech = topParse?.pos || thomisticMatch?.entry.partOfSpeech || 'Latin Word';

  const dictionaryEntries: DictionaryEntryItem[] = [];

  // 1. Thomistic Lexicon (Thomas-Lexikon & Scholastic Philosophy/Theology)
  if (thomisticMatch) {
    dictionaryEntries.push({
      source: 'Thomistic Lexicon',
      headword: thomisticMatch.entry.headword,
      definition: thomisticMatch.entry.thomisticMeaning,
      citations: thomisticMatch.entry.aquinasCitations,
      latinQuotes: thomisticMatch.entry.aquinasQuotes,
      axioms: thomisticMatch.entry.axioms,
      ageLabel: 'Scholastic / Thomas-Lexikon',
    });
  }

  // 2. Ecclesiastical Latin Dictionary (Church, Liturgical, Vulgate, Patristic & Medieval Latin)
  if (eccMatch) {
    dictionaryEntries.push({
      source: 'Ecclesiastical Latin Dictionary',
      headword: eccMatch.entry.headword,
      definition: eccMatch.entry.definition,
      ageLabel: eccMatch.entry.period || 'Ecclesiastical & Church Latin',
    });
  } else if (topParse) {
    dictionaryEntries.push({
      source: 'Ecclesiastical Latin Dictionary',
      headword: topParse.headword,
      definition: topParse.entry.senses,
      ageLabel: 'Ecclesiastical & General Latin',
    });
  }

  // 3. Wiktionary (Latin-English & Victionarium)
  if (wikMatch) {
    dictionaryEntries.push({
      source: 'Wiktionary',
      headword: wikMatch.entry.headword,
      definition: wikMatch.entry.definition,
      etymology: wikMatch.entry.etymology,
      sourceUrl: wikMatch.entry.sourceUrl || `https://en.wiktionary.org/wiki/${encodeURIComponent(primaryLemma)}#Latin`,
      ageLabel: `Wiktionary (${wikMatch.entry.pos || 'Latin'})`,
    });
  } else if (topParse) {
    const numbered = topParse.entry.senses
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((s, i) => `(${i + 1}) ${s}`)
      .join(' • ');
    dictionaryEntries.push({
      source: 'Wiktionary',
      headword: primaryLemma,
      definition: numbered,
      sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(primaryLemma)}#Latin`,
      ageLabel: 'Wiktionary (Latin)',
    });
  }

  // 4. Lewis & Short Latin Dictionary (Perseus Classical & Late Latin)
  if (lsMatch) {
    dictionaryEntries.push({
      source: 'Lewis & Short',
      headword: lsMatch.entry.orthography || lsMatch.entry.headword,
      definition: lsMatch.entry.definition,
      ageLabel: 'Classical & Late Latin (Perseus)',
    });
  }

  // 5. Whitaker's Words (Morphological & Lexical Database — single best entry to avoid duplicate source badges)
  if (topParse) {
    dictionaryEntries.push({
      source: "Whitaker's Words",
      headword: topParse.headword,
      definition: topParse.entry.senses,
      ageLabel:
        topParse.entry.area === 'E'
          ? 'Ecclesiastical Latin'
          : AGE_LABELS[topParse.entry.age] || 'General Latin',
    });
  }

  let ecclesiasticalMeaning =
    thomisticMatch?.entry.thomisticMeaning ||
    (eccMatch && eccMatch.key === primaryLemma.toLowerCase() ? eccMatch.entry.definition : undefined) ||
    topParse?.entry.senses ||
    eccMatch?.entry.definition ||
    compoundBreakdown?.explanation ||
    rawWord;

  if (norm.enclitic) {
    ecclesiasticalMeaning = `[+${norm.enclitic.particle}: "${norm.enclitic.meaning.split('(')[0].trim()}"] ${ecclesiasticalMeaning}`;
  }

  const classicalMeaning =
    thomisticMatch?.entry.classicalMeaning ||
    lsMatch?.entry.definition ||
    (parses.length > 1 ? parses[parses.length - 1].entry.senses : topParse?.entry.senses);

  const isCoreThomistic =
    Boolean(thomisticMatch) &&
    (CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS.has(thomisticMatch!.key.toLowerCase()) ||
      CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS.has(primaryLemma.toLowerCase()) ||
      CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS.has(norm.clean));

  const result: WordAnalysisResult = {
    word: rawWord,
    normalizedWord: norm.clean,
    primaryLemma,
    headword,
    partOfSpeech,
    ecclesiasticalMeaning,
    classicalMeaning,
    morphologicalParses: parses,
    enclitic: norm.enclitic,
    compoundBreakdown,
    dictionaryEntries,
    isThomisticKeyTerm: isCoreThomistic,
    thomisticNote: thomisticMatch?.entry.scholasticNote,
  };
  analysisCache.set(norm.clean, result);
  return result;
}

export async function fetchLiveWiktionaryEntry(
  lemma: string,
  word: string,
  options?: { locationHost?: string; onLine?: boolean; timeoutMs?: number }
): Promise<WiktionaryEntryData | null> {
  const key = lemma.toLowerCase().replace(/j/g, 'i');
  if (liveWiktionaryCache.has(key)) {
    return liveWiktionaryCache.get(key)!;
  }
  if (typeof fetch === 'undefined') return null;
  if (options?.onLine === false) return null;
  const host = (options?.locationHost || '').toLowerCase();
  // DEF-012: Keep offline archive hermetic (never make external Wiktionary calls on localhost / 127.0.0.1)
  if (host === '127.0.0.1' || host === 'localhost' || host === '[::1]') {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? 3000;
  for (const query of [lemma, word.toLowerCase()]) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const laSecs = data?.la;
      if (!Array.isArray(laSecs) || laSecs.length === 0) continue;

      const posList: string[] = [];
      const defs: string[] = [];
      for (const sec of laSecs) {
        if (sec.partOfSpeech && !posList.includes(sec.partOfSpeech)) {
          posList.push(sec.partOfSpeech);
        }
        for (const d of (sec.definitions || []).slice(0, 3)) {
          const cleanDef = String(d.definition || '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanDef && !defs.includes(cleanDef)) {
            defs.push(cleanDef);
          }
        }
      }
      if (defs.length > 0) {
        const entry: WiktionaryEntryData = {
          headword: query,
          pos: posList.join(', ') || 'Latin',
          definition: defs.slice(0, 4).map((df, i) => `(${i + 1}) ${df}`).join(' • '),
          sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(query)}#Latin`,
        };
        liveWiktionaryCache.set(key, entry);
        analysisCache.delete(key);
        analysisCache.delete(word.toLowerCase());
        return entry;
      }
    } catch {
      // Offline, timed out, or blocked; fallback to bundled Wiktionary
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return null;
}
