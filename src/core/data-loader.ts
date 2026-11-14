import type { WhitakerEntry, InflectRule } from './morphology';
import { cleanLatinString } from './normalizer';

export interface ThomisticEntryData {
  headword: string;
  partOfSpeech: string;
  thomisticMeaning: string;
  ecclesiasticalMeaning: string;
  classicalMeaning: string;
  scholasticNote?: string;
  schuetzSenses?: string[];
  aquinasQuotes?: string[];
  aquinasCitations?: string[];
  axioms?: string[];
  compounds?: string[];
}

export interface EcclesiasticalEntryData {
  headword: string;
  definition: string;
  period: string;
}

export interface WiktionaryEntryData {
  headword: string;
  pos: string;
  definition: string;
  etymology?: string;
  sourceUrl?: string;
}

export interface LewisShortEntryData {
  headword: string;
  orthography: string;
  definition: string;
}

export interface WhitakerDictData {
  entries: WhitakerEntry[];
  uniques: Record<string, Array<{ pos: string; morph: string; senses: string }>>;
  prefixes: Array<{ prefix: string; connect: string; meta: string; meaning: string }>;
  suffixes: Array<{ suffix: string; meta: string; meaning: string }>;
  tackons: Array<{ particle: string; meaning: string }>;
}

interface GlobalDataCache {
  lexicalLoaded: boolean;
  parallelLoaded: boolean;
  whitakerDict: WhitakerDictData;
  whitakerInflects: InflectRule[];
  thomisticEntries: Record<string, ThomisticEntryData>;
  ecclesiasticalEntries: Record<string, EcclesiasticalEntryData>;
  wiktionaryEntries: Record<string, WiktionaryEntryData>;
  lewisShortEntries: Record<string, LewisShortEntryData>;
  summaSections: Record<string, string>;
  lexicalLoadingPromise?: Promise<void>;
  parallelLoadingPromise?: Promise<void>;
}

const CACHE_KEY = '__SCHOLA_THOMISTICA_DATA_CACHE_V2__';

const BUILTIN_THOMISTIC_CORE: Record<string, ThomisticEntryData> = {
  salus: {
    headword: 'salus, salutis (f.)',
    partOfSpeech: 'Noun',
    thomisticMeaning: 'eternal salvation, supernatural beatitude and wholeness in God (salus humana)',
    ecclesiasticalMeaning: 'salvation, deliverance from sin, eternal life',
    classicalMeaning: 'health, physical welfare, safety, greeting',
    scholasticNote: 'In ST I q. 1 a. 1, "humana salus" denotes man\'s supernatural end exceeding natural reason.',
  },
  doctrina: {
    headword: 'doctrina, -ae (f.)',
    partOfSpeech: 'Noun',
    thomisticMeaning: 'systematic teaching or science; especially sacra doctrina (divinely revealed theology)',
    ecclesiasticalMeaning: 'Christian doctrine, teaching of the Church',
    classicalMeaning: 'instruction, learning, erudition',
    scholasticNote: 'Sacra doctrina is a science subalternated to the scientia Dei et beatorum (ST I q. 1 a. 2).',
  },
  actus: {
    headword: 'actus, -us (m.)',
    partOfSpeech: 'Noun',
    thomisticMeaning: 'act, actuality, perfection, determination, or operation (as contrasted with potentia)',
    ecclesiasticalMeaning: 'act, deed, liturgical or moral action',
    classicalMeaning: 'movement, driving, performance, dramatic act',
    scholasticNote: 'Axiom: "Unusquisque agit secundum quod est in actu." God is Purus Actus without any admixture of potency.',
    axioms: ['Agere sequitur esse', 'Potentia dicitur ad actum'],
  },
  potentia: {
    headword: 'potentia, -ae (f.)',
    partOfSpeech: 'Noun',
    thomisticMeaning: 'potency, real capacity to receive perfection (potentia passiva) or to act (potentia activa)',
    ecclesiasticalMeaning: 'power, might, faculty of the soul',
    classicalMeaning: 'political power, force, efficacy',
    scholasticNote: 'Potency is distinct from act in all created beings; in God alone essence and esse are identical with no passive potency.',
    axioms: ['Potentia et actus dividunt ens'],
  },
  essentia: {
    headword: 'essentia, -ae (f.)',
    partOfSpeech: 'Noun',
    thomisticMeaning: 'essence, quiddity, that through which and in which a being has existence (esse)',
    ecclesiasticalMeaning: 'essence, divine nature (una essentia, tres personae)',
    classicalMeaning: 'being, essence (coined by Cicero/Seneca to translate Greek ousia)',
    scholasticNote: 'In all creatures, essentia is really distinct from esse (act of existing); in God alone, Sua essentia est suum esse.',
  },
  substantia: {
    headword: 'substantia, -ae (f.)',
    partOfSpeech: 'Noun',
    thomisticMeaning: 'substance, a being to whose nature it belongs to exist in itself and not in another (ens per se subsistens)',
    ecclesiasticalMeaning: 'substance, consubstantial nature',
    classicalMeaning: 'resources, property, material contents',
    scholasticNote: 'Divided into substantia prima (the concrete individual suppositum) and substantia secunda (universal nature/species).',
  },
  accidens: {
    headword: 'accidens, accidentis (n.)',
    partOfSpeech: 'Noun',
    thomisticMeaning: 'accident, a form whose nature is to exist in another (ens in alio) as in a subject',
    ecclesiasticalMeaning: 'accidental appearance (e.g., Eucharistic species remaining after transubstantiation)',
    classicalMeaning: 'chance occurrence, happening, fortuitous event',
    scholasticNote: 'Accidentia non habent esse per se, sed eorum esse est inesse subiecto.',
  },
};

function getGlobalCache(): GlobalDataCache {
  const g = globalThis as unknown as Record<string, GlobalDataCache>;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = {
      lexicalLoaded: false,
      parallelLoaded: false,
      whitakerDict: {
        entries: [
          { stems: ['salus', 'salut', 'zzz', 'zzz'], pos: 'N', decl: 3, var: 1, extra: 'F', age: 'X', area: 'E', freq: 'A', senses: 'salvation, safety, health, welfare' },
          { stems: ['doctrin', 'doctrin', 'zzz', 'zzz'], pos: 'N', decl: 1, var: 1, extra: 'F', age: 'X', area: 'E', freq: 'A', senses: 'teaching, doctrine, instruction, science' },
          { stems: ['act', 'act', 'zzz', 'zzz'], pos: 'N', decl: 4, var: 1, extra: 'M', age: 'X', area: 'X', freq: 'A', senses: 'act, actuality, action, deed' },
          { stems: ['potenti', 'potenti', 'zzz', 'zzz'], pos: 'N', decl: 1, var: 1, extra: 'F', age: 'X', area: 'X', freq: 'A', senses: 'potency, power, capacity, faculty' },
          { stems: ['essenti', 'essenti', 'zzz', 'zzz'], pos: 'N', decl: 1, var: 1, extra: 'F', age: 'D', area: 'E', freq: 'A', senses: 'essence, being, nature, quiddity' },
          { stems: ['substanti', 'substanti', 'zzz', 'zzz'], pos: 'N', decl: 1, var: 1, extra: 'F', age: 'D', area: 'E', freq: 'A', senses: 'substance, subsisting being, nature' },
          { stems: ['accidens', 'accident', 'zzz', 'zzz'], pos: 'N', decl: 3, var: 3, extra: 'N', age: 'X', area: 'X', freq: 'A', senses: 'accident, quality inhering in a substance' },
          { stems: ['veritas', 'veritat', 'zzz', 'zzz'], pos: 'N', decl: 3, var: 1, extra: 'F', age: 'X', area: 'X', freq: 'A', senses: 'truth, reality, conformity of intellect and thing' },
          { stems: ['scienti', 'scienti', 'zzz', 'zzz'], pos: 'N', decl: 1, var: 1, extra: 'F', age: 'X', area: 'X', freq: 'A', senses: 'science, demonstrative knowledge' },
          { stems: ['sapienti', 'sapienti', 'zzz', 'zzz'], pos: 'N', decl: 1, var: 1, extra: 'F', age: 'X', area: 'X', freq: 'A', senses: 'wisdom, knowledge of highest causes' },
          { stems: ['ratio', 'ration', 'zzz', 'zzz'], pos: 'N', decl: 3, var: 1, extra: 'F', age: 'X', area: 'X', freq: 'A', senses: 'reason, formal aspect, definition, argument' },
        ],
        uniques: {},
        prefixes: [],
        suffixes: [],
        tackons: [{ particle: 'que', meaning: 'and, each, both' }],
      },
      whitakerInflects: [
        { pos: 'N', decl: 1, var: 0, morph: 'NOM S F', stem: 1, ending: 'a', age: 'X', freq: 'A' },
        { pos: 'N', decl: 1, var: 0, morph: 'GEN S F', stem: 2, ending: 'ae', age: 'X', freq: 'A' },
        { pos: 'N', decl: 1, var: 0, morph: 'ACC S F', stem: 2, ending: 'am', age: 'X', freq: 'A' },
        { pos: 'N', decl: 1, var: 0, morph: 'ABL S F', stem: 2, ending: 'a', age: 'X', freq: 'A' },
        { pos: 'N', decl: 1, var: 0, morph: 'ACC P F', stem: 2, ending: 'as', age: 'X', freq: 'A' },
        { pos: 'N', decl: 3, var: 0, morph: 'NOM S F', stem: 1, ending: '', age: 'X', freq: 'A' },
        { pos: 'N', decl: 3, var: 0, morph: 'GEN S F', stem: 2, ending: 'is', age: 'X', freq: 'A' },
        { pos: 'N', decl: 3, var: 0, morph: 'ACC S F', stem: 2, ending: 'em', age: 'X', freq: 'A' },
        { pos: 'N', decl: 3, var: 0, morph: 'ABL S F', stem: 2, ending: 'e', age: 'X', freq: 'A' },
        { pos: 'N', decl: 4, var: 0, morph: 'NOM S M', stem: 1, ending: 'us', age: 'X', freq: 'A' },
        { pos: 'N', decl: 4, var: 0, morph: 'ABL S M', stem: 2, ending: 'u', age: 'X', freq: 'A' },
      ],
      thomisticEntries: { ...BUILTIN_THOMISTIC_CORE },
      ecclesiasticalEntries: {
        salus: { headword: 'salus, salutis, f.', definition: 'salvation, eternal life in Christ; health, safety', period: 'Ecclesiastical & Patristic Latin' },
        doctrina: { headword: 'doctrina, -ae, f.', definition: 'sacred doctrine, Christian teaching, catechesis', period: 'Ecclesiastical & Scholastic Latin' },
        actus: { headword: 'actus, -us, m.', definition: 'act, actuality, liturgical or moral act', period: 'Scholastic & Ecclesiastical Latin' },
        potentia: { headword: 'potentia, -ae, f.', definition: 'potency, faculty of the soul, divine power', period: 'Scholastic & Ecclesiastical Latin' },
        essentia: { headword: 'essentia, -ae, f.', definition: 'essence, divine nature, quiddity', period: 'Patristic & Scholastic Latin' },
        substantia: { headword: 'substantia, -ae, f.', definition: 'substance, hypostasis, self-subsisting being', period: 'Patristic & Scholastic Latin' },
        accidens: { headword: 'accidens, -ntis, n.', definition: 'accident, non-substantial property inhering in a subject', period: 'Scholastic Latin' },
        veritas: { headword: 'veritas, -tatis, f.', definition: 'truth, conformity of intellect and reality (adaequatio rei et intellectus)', period: 'Ecclesiastical & Scholastic Latin' },
        uterque: { headword: 'uterque, utraque, utrumque', definition: 'each of two, both, either side', period: 'Classical & Ecclesiastical Latin' },
      },
      wiktionaryEntries: {
        salus: { headword: 'salus', pos: 'Noun', definition: '(1) salvation, deliverance • (2) health, welfare, safety' },
        doctrina: { headword: 'doctrina', pos: 'Noun', definition: '(1) teaching, instruction, doctrine • (2) science, erudition' },
        actus: { headword: 'actus', pos: 'Noun', definition: '(1) act, actuality • (2) impulse, performance, action' },
        potentia: { headword: 'potentia', pos: 'Noun', definition: '(1) potency, capacity • (2) power, might, force' },
        essentia: { headword: 'essentia', pos: 'Noun', definition: '(1) essence, being, nature of a thing' },
        substantia: { headword: 'substantia', pos: 'Noun', definition: '(1) substance, essence, being • (2) resources, property' },
        accidens: { headword: 'accidens', pos: 'Noun', definition: '(1) accident, attribute • (2) chance event' },
        veritas: { headword: 'veritas', pos: 'Noun', definition: '(1) truth, verity, reality' },
        uterque: { headword: 'uterque', pos: 'Pronoun', definition: '(1) each (of two), either, both' },
      },
      lewisShortEntries: {
        salus: { headword: 'salus', orthography: 'salus, salutis, f.', definition: 'a being safe and sound; health, welfare, safety, deliverance, salvation' },
        doctrina: { headword: 'doctrina', orthography: 'doctrina, -ae, f.', definition: 'teaching, instruction, learning, science, principle' },
        actus: { headword: 'actus', orthography: 'actus, -us, m.', definition: 'a setting in motion, impulse, act, performance, actuality' },
        potentia: { headword: 'potentia', orthography: 'potentia, -ae, f.', definition: 'might, force, power, capacity, potentiality' },
        essentia: { headword: 'essentia', orthography: 'essentia, -ae, f.', definition: 'the being or essence of a thing (translating Greek ousia)' },
        substantia: { headword: 'substantia', orthography: 'substantia, -ae, f.', definition: 'that of which a thing consists, being, essence, substance' },
        accidens: { headword: 'accidens', orthography: 'accidens, -ntis, n.', definition: 'an accidental or non-essential quality, accident' },
        veritas: { headword: 'veritas', orthography: 'veritas, -tatis, f.', definition: 'truth, verity, reality, honesty' },
        uterque: { headword: 'uterque', orthography: 'uterque, utraque, utrumque', definition: 'each of two, both, either' },
      },
      summaSections: {
        'I q. 1 pr.': 'To place our purpose within proper limits, we first endeavor to investigate the nature and extent of this sacred doctrine.',
        'I q. 1 a. 1 arg. 1': 'It seems that, besides philosophical science, we have no need of any further knowledge. For man should not seek to know what is above reason: "Seek not the things that are too high for thee" (Ecclus. 3:22). But whatever is within reason is fully treated of in philosophical science. Therefore, besides philosophical science, there is no need of any further knowledge.',
        'I q. 1 a. 1 co.': "I answer that, It was necessary for man's salvation that there should be a knowledge revealed by God, besides philosophical science built up by human reason.",
      },
    };
  }
  return g[CACHE_KEY];
}

let onCacheHydratedCallbacks: Array<() => void> = [];

export function registerOnDataHydrated(cb: () => void): void {
  onCacheHydratedCallbacks.push(cb);
}

function tryLoadFromNodeFsSync(cache: GlobalDataCache): void {
  if (cache.lexicalLoaded && cache.parallelLoaded) return;
  const proc = (globalThis as unknown as {
    process?: {
      versions?: { node?: string };
      cwd?: () => string;
      getBuiltinModule?: (id: string) => unknown;
    };
  }).process;
  if (!proc?.versions?.node || typeof proc.getBuiltinModule !== 'function') {
    return;
  }
  try {
    const fs = proc.getBuiltinModule('fs') as {
      existsSync: (p: string) => boolean;
      readFileSync: (p: string, enc: string) => string;
    };
    const path = proc.getBuiltinModule('path') as {
      resolve: (...parts: string[]) => string;
      join: (...parts: string[]) => string;
    };
    const cwd = proc.cwd ? proc.cwd() : '.';
    const candidateDirs = [
      path.resolve(cwd, 'src', 'data'),
      path.resolve(cwd, 'corpus-thomisticum', 'src', 'data'),
    ];
    const dataDir = candidateDirs.find((d) => fs.existsSync(path.join(d, 'whitaker-dict.json')));
    if (!dataDir) return;

    const readJson = <T>(file: string): T =>
      JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8')) as T;

    if (!cache.lexicalLoaded) {
      cache.whitakerDict = readJson<WhitakerDictData>('whitaker-dict.json');
      cache.whitakerInflects = readJson<{ rules: InflectRule[] }>('whitaker-inflects.json').rules;
      cache.thomisticEntries = readJson<{ entries: Record<string, ThomisticEntryData> }>('thomistic-lexicon.json').entries;
      cache.ecclesiasticalEntries = readJson<{ entries: Record<string, EcclesiasticalEntryData> }>('ecclesiastical-dict.json').entries;
      cache.wiktionaryEntries = readJson<{ entries: Record<string, WiktionaryEntryData> }>('wiktionary-latin.json').entries;
      cache.lewisShortEntries = readJson<{ entries: Record<string, LewisShortEntryData> }>('lewis-short-core.json').entries;
      cache.lexicalLoaded = true;
    }
    if (!cache.parallelLoaded) {
      cache.summaSections = readJson<{ sections: Record<string, string> }>('summa-english.json').sections;
      cache.parallelLoaded = true;
    }
    for (const cb of onCacheHydratedCallbacks) cb();
  } catch {
    // Fallback to built-in core entries or async browser fetch
  }
}

export function resolveBrowserDataUrl(win: Window & typeof globalThis, filename: string): string {
  const chromeApi = (win as unknown as { chrome?: typeof chrome }).chrome;
  if (chromeApi?.runtime?.getURL) {
    return chromeApi.runtime.getURL(`data/${filename}`);
  }
  const origin =
    win.location?.origin && win.location.origin !== 'null'
      ? win.location.origin
      : 'http://127.0.0.1:8765';
  return `${origin}/_extension/data/${filename}`;
}

export function isLexicalDataLoaded(): boolean {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.lexicalLoaded;
}

export function isParallelCorpusLoaded(): boolean {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.parallelLoaded;
}

export function isDataLoaded(): boolean {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.lexicalLoaded && cache.parallelLoaded;
}

export async function ensureLexicalDataLoaded(win?: Window & typeof globalThis): Promise<boolean> {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  if (cache.lexicalLoaded) return true;
  if (cache.lexicalLoadingPromise) {
    await cache.lexicalLoadingPromise;
    return cache.lexicalLoaded;
  }

  const targetWin =
    win ||
    (typeof window !== 'undefined' ? (window as Window & typeof globalThis) : undefined);
  if (!targetWin || typeof fetch === 'undefined') return false;

  cache.lexicalLoadingPromise = (async () => {
    try {
      const fetchJson = async <T>(file: string): Promise<T | null> => {
        try {
          const resp = await fetch(resolveBrowserDataUrl(targetWin, file));
          if (!resp.ok) return null;
          return (await resp.json()) as T;
        } catch {
          return null;
        }
      };

      const [wDict, wInf, thom, ecc, wik, ls] = await Promise.all([
        fetchJson<WhitakerDictData>('whitaker-dict.json'),
        fetchJson<{ rules: InflectRule[] }>('whitaker-inflects.json'),
        fetchJson<{ entries: Record<string, ThomisticEntryData> }>('thomistic-lexicon.json'),
        fetchJson<{ entries: Record<string, EcclesiasticalEntryData> }>('ecclesiastical-dict.json'),
        fetchJson<{ entries: Record<string, WiktionaryEntryData> }>('wiktionary-latin.json'),
        fetchJson<{ entries: Record<string, LewisShortEntryData> }>('lewis-short-core.json'),
      ]);

      if (wDict?.entries?.length && wInf?.rules?.length) {
        cache.whitakerDict = wDict;
        cache.whitakerInflects = wInf.rules;
        if (thom?.entries) cache.thomisticEntries = thom.entries;
        if (ecc?.entries) cache.ecclesiasticalEntries = ecc.entries;
        if (wik?.entries) cache.wiktionaryEntries = wik.entries;
        if (ls?.entries) cache.lewisShortEntries = ls.entries;
        cache.lexicalLoaded = true;
        for (const cb of onCacheHydratedCallbacks) cb();
      }
    } finally {
      cache.lexicalLoadingPromise = undefined;
    }
  })();

  await cache.lexicalLoadingPromise;
  return cache.lexicalLoaded;
}

export async function ensureParallelCorpusLoaded(win?: Window & typeof globalThis): Promise<boolean> {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  if (cache.parallelLoaded) return true;
  if (cache.parallelLoadingPromise) {
    await cache.parallelLoadingPromise;
    return cache.parallelLoaded;
  }

  const targetWin =
    win ||
    (typeof window !== 'undefined' ? (window as Window & typeof globalThis) : undefined);
  if (!targetWin || typeof fetch === 'undefined') return false;

  cache.parallelLoadingPromise = (async () => {
    try {
      const resp = await fetch(resolveBrowserDataUrl(targetWin, 'summa-english.json'));
      if (resp.ok) {
        const summa = (await resp.json()) as { sections?: Record<string, string> };
        if (summa?.sections && Object.keys(summa.sections).length > 100) {
          cache.summaSections = summa.sections;
          cache.parallelLoaded = true;
        }
      }
    } catch {
      // Leave parallelLoaded = false so subsequent requests can retry
    } finally {
      cache.parallelLoadingPromise = undefined;
    }
  })();

  await cache.parallelLoadingPromise;
  return cache.parallelLoaded;
}

export async function ensureDataLoaded(win?: Window & typeof globalThis): Promise<void> {
  await Promise.all([ensureLexicalDataLoaded(win), ensureParallelCorpusLoaded(win)]);
}

export function getWhitakerDict(): WhitakerDictData {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.whitakerDict;
}

export function getWhitakerInflects(): InflectRule[] {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.whitakerInflects;
}

export function getThomisticEntries(): Record<string, ThomisticEntryData> {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.thomisticEntries;
}

export function getEcclesiasticalEntries(): Record<string, EcclesiasticalEntryData> {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.ecclesiasticalEntries;
}

export function getWiktionaryEntries(): Record<string, WiktionaryEntryData> {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.wiktionaryEntries;
}

export function getLewisShortEntries(): Record<string, LewisShortEntryData> {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.lewisShortEntries;
}

export function getSummaSections(): Record<string, string> {
  const cache = getGlobalCache();
  tryLoadFromNodeFsSync(cache);
  return cache.summaSections;
}

const FAST_LEMMA_MAP: Record<string, string> = {
  sum: 'sum', es: 'sum', est: 'sum', sumus: 'sum', estis: 'sum', sunt: 'sum',
  eram: 'sum', erat: 'sum', erant: 'sum', fui: 'sum', fuit: 'sum', fuerunt: 'sum',
  sim: 'sum', sit: 'sum', sint: 'sum', essem: 'sum', esset: 'sum', essent: 'sum',
  esse: 'sum', fuisse: 'sum',
  ens: 'ens', entis: 'ens', enti: 'ens', ente: 'ens', entia: 'ens', entium: 'ens', entibus: 'ens',
  salus: 'salus', salutis: 'salus', saluti: 'salus', salutem: 'salus', salute: 'salus',
  doctrina: 'doctrina', doctrinae: 'doctrina', doctrinam: 'doctrina', doctrinis: 'doctrina', doctrinas: 'doctrina',
  scientia: 'scientia', scientiae: 'scientia', scientiam: 'scientia', scientiis: 'scientia', scientias: 'scientia', scientiarum: 'scientia',
  sapientia: 'sapientia', sapientiae: 'sapientia', sapientiam: 'sapientia',
  ratio: 'ratio', rationis: 'ratio', rationi: 'ratio', rationem: 'ratio', ratione: 'ratio', rationes: 'ratio', rationibus: 'ratio',
  intellectus: 'intellectus', intellectui: 'intellectus', intellectum: 'intellectus', intellectu: 'intellectus',
  voluntas: 'voluntas', voluntatis: 'voluntas', voluntati: 'voluntas', voluntatem: 'voluntas', voluntate: 'voluntas',
  actus: 'actus', actui: 'actus', actum: 'actus', actu: 'actus', actibus: 'actus',
  potentia: 'potentia', potentiae: 'potentia', potentiam: 'potentia', potentiis: 'potentia', potentias: 'potentia',
  essentia: 'essentia', essentiae: 'essentia', essentiam: 'essentia',
  substantia: 'substantia', substantiae: 'substantia', substantiam: 'substantia', substantiis: 'substantia',
  accidens: 'accidens', accidentis: 'accidens', accidenti: 'accidens', accidente: 'accidens', accidentia: 'accidens', accidentibus: 'accidens',
  habitus: 'habitus', habitui: 'habitus', habitum: 'habitus', habitu: 'habitus', habitibus: 'habitus',
  species: 'species', speciei: 'species', speciem: 'species', specie: 'species', speciebus: 'species',
  quidditas: 'quidditas', quidditatis: 'quidditas', quidditatem: 'quidditas', quidditate: 'quidditas',
  existentia: 'existentia', existentiae: 'existentia', existentiam: 'existentia',
  fides: 'fides', fidei: 'fides', fidem: 'fides', fide: 'fides',
  spes: 'spes', spei: 'spes', spem: 'spes', spe: 'spes',
  caritas: 'caritas', caritatis: 'caritas', caritatem: 'caritas', caritate: 'caritas',
  gratia: 'gratia', gratiae: 'gratia', gratiam: 'gratia', gratiis: 'gratia',
  sacramentum: 'sacramentum', sacramenti: 'sacramentum', sacramento: 'sacramentum', sacramenta: 'sacramentum', sacramentis: 'sacramentum',
  persona: 'persona', personae: 'persona', personam: 'persona', personis: 'persona', personas: 'persona',
  natura: 'natura', naturae: 'natura', naturam: 'natura', naturis: 'natura',
  veritas: 'veritas', veritatis: 'veritas', veritati: 'veritas', veritatem: 'veritas', veritate: 'veritas',
  verum: 'verum', veri: 'verum', vero: 'verum', vera: 'verum',
  bonum: 'bonum', boni: 'bonum', bono: 'bonum', bona: 'bonum', bonorum: 'bonum', bonis: 'bonum',
  bonitas: 'bonitas', bonitatis: 'bonitas', bonitatem: 'bonitas', bonitate: 'bonitas',
  malum: 'malum', mali: 'malum', malo: 'malum', mala: 'malum', malis: 'malum',
  causa: 'causa', causae: 'causa', causam: 'causa', causis: 'causa', causas: 'causa', causarum: 'causa',
  finis: 'finis', fini: 'finis', finem: 'finis', fine: 'finis', fines: 'finis', finibus: 'finis',
  principium: 'principium', principii: 'principium', principio: 'principium', principia: 'principium', principiis: 'principium',
  virtus: 'virtus', virtutis: 'virtus', virtuti: 'virtus', virtutem: 'virtus', virtute: 'virtus', virtutes: 'virtus', virtutibus: 'virtus',
  peccatum: 'peccatum', peccati: 'peccatum', peccato: 'peccatum', peccata: 'peccatum', peccatis: 'peccatum',
  lex: 'lex', legis: 'lex', legi: 'lex', legem: 'lex', lege: 'lex', leges: 'lex', legibus: 'lex',
  ius: 'ius', iuris: 'ius', iuri: 'ius', iure: 'ius', iura: 'ius',
  revelatio: 'revelatio', revelationis: 'revelatio', revelationi: 'revelatio', revelationem: 'revelatio', revelatione: 'revelatio',
  scriptura: 'scriptura', scripturae: 'scriptura', scripturam: 'scriptura', scripturis: 'scriptura',
  theologia: 'theologia', theologiae: 'theologia', theologiam: 'theologia',
  philosophia: 'philosophia', philosophiae: 'philosophia', philosophiam: 'philosophia',
  philosophicus: 'philosophicus', philosophica: 'philosophicus', philosophicas: 'philosophicus', philosophicis: 'philosophicus',
  forma: 'forma', formae: 'forma', formam: 'forma', formis: 'forma', formas: 'forma',
  materia: 'materia', materiae: 'materia', materiam: 'materia', materiis: 'materia',
  anima: 'anima', animae: 'anima', animam: 'anima', animis: 'anima', animas: 'anima',
  spiritus: 'spiritus', spiritui: 'spiritus', spiritum: 'spiritus', spiritu: 'spiritus',
  angelus: 'angelus', angeli: 'angelus', angelo: 'angelus', angelum: 'angelus', angelis: 'angelus', angelos: 'angelus',
  deus: 'deus', dei: 'deus', deo: 'deus', deum: 'deus', deoque: 'deus',
  divinus: 'divinus', divina: 'divinus', divinae: 'divinus', divinam: 'divinus', divinis: 'divinus', divinorum: 'divinus',
  humanus: 'humanus', humana: 'humanus', humanae: 'humanus', humanam: 'humanus', humanis: 'humanus',
  necessarius: 'necessarius', necessarium: 'necessarius', necessaria: 'necessarius',
  ordo: 'ordo', ordinis: 'ordo', ordini: 'ordo', ordinem: 'ordo', ordine: 'ordo',
  genus: 'genus', generis: 'genus', generi: 'genus', genere: 'genus', genera: 'genus',
  differentia: 'differentia', differentiae: 'differentia', differentiam: 'differentia',
  definitio: 'definitio', definitionis: 'definitio', definitionem: 'definitio', definitione: 'definitio',
  demonstratio: 'demonstratio', demonstrationis: 'demonstratio', demonstrationem: 'demonstratio', demonstratione: 'demonstratio',
  auctoritas: 'auctoritas', auctoritatis: 'auctoritas', auctoritatem: 'auctoritas', auctoritate: 'auctoritas',
  lumen: 'lumen', luminis: 'lumen', lumini: 'lumen', lumine: 'lumen',
  sensus: 'sensus', sensui: 'sensus', sensum: 'sensus', sensu: 'sensus', sensibus: 'sensus',
  phantasma: 'phantasma', phantasmatis: 'phantasma', phantasmata: 'phantasma', phantasmatibus: 'phantasma',
  motus: 'motus', motui: 'motus', motum: 'motus', motu: 'motus', motibus: 'motus',
  operatio: 'operatio', operationis: 'operatio', operationem: 'operatio', operatione: 'operatio',
  perfectio: 'perfectio', perfectionis: 'perfectio', perfectionem: 'perfectio', perfectione: 'perfectio',
  beatitudo: 'beatitudo', beatitudinis: 'beatitudo', beatitudinem: 'beatitudo', beatitudine: 'beatitudo',
  creatura: 'creatura', creaturae: 'creatura', creaturam: 'creatura', creaturas: 'creatura', creaturis: 'creatura', creaturarum: 'creatura',
  obiectum: 'obiectum', obiecti: 'obiectum', obiecto: 'obiectum', obiecta: 'obiectum',
  subiectum: 'subiectum', subiecti: 'subiectum', subiecto: 'subiectum', subiecta: 'subiectum',
  videtur: 'video', video: 'video', videri: 'video',
};

export function quickResolveTokenLemma(rawWord: string): string {
  const clean = cleanLatinString(rawWord);
  if (!clean) return '';
  if (FAST_LEMMA_MAP[clean]) return FAST_LEMMA_MAP[clean];
  return clean;
}
