import { getWhitakerDict, getWhitakerInflects, registerOnDataHydrated } from './data-loader';
import { cleanLatinString, generateOrthographicVariants } from './normalizer';

export interface WhitakerEntry {
  stems: [string, string, string, string];
  pos: string;
  decl: number;
  var: number;
  extra: string;
  age: string;
  area: string;
  freq: string;
  senses: string;
}

export interface InflectRule {
  pos: string;
  decl: number;
  var: number;
  morph: string;
  stem: number;
  ending: string;
  age: string;
  freq: string;
}

export interface MorphologicalParse {
  lemma: string;
  headword: string;
  pos: string;
  rawPos: string;
  case?: string;
  number?: string;
  gender?: string;
  declension?: string;
  tense?: string;
  voice?: string;
  mood?: string;
  person?: string;
  degree?: string;
  formExplanation: string;
  stemUsed: string;
  endingUsed: string;
  entry: WhitakerEntry;
  score: number;
}

const CASE_NAMES: Record<string, string> = {
  NOM: 'Nominative',
  VOC: 'Vocative',
  GEN: 'Genitive',
  LOC: 'Locative',
  DAT: 'Dative',
  ABL: 'Ablative',
  ACC: 'Accusative',
};

const NUMBER_NAMES: Record<string, string> = {
  S: 'Singular',
  P: 'Plural',
};

const GENDER_NAMES: Record<string, string> = {
  M: 'Masculine',
  F: 'Feminine',
  N: 'Neuter',
  C: 'Common (M/F)',
  X: 'All genders',
};

const TENSE_NAMES: Record<string, string> = {
  PRES: 'Present',
  IMPF: 'Imperfect',
  FUT: 'Future',
  PERF: 'Perfect',
  PLUP: 'Pluperfect',
  FUTP: 'Future Perfect',
};

const VOICE_NAMES: Record<string, string> = {
  ACTIVE: 'Active',
  PASSIVE: 'Passive',
};

const MOOD_NAMES: Record<string, string> = {
  IND: 'Indicative',
  SUB: 'Subjunctive',
  IMP: 'Imperative',
  INF: 'Infinitive',
  PPL: 'Participle',
};

const DEGREE_NAMES: Record<string, string> = {
  POS: 'Positive',
  COMP: 'Comparative',
  SUPER: 'Superlative',
};

const POS_NAMES: Record<string, string> = {
  N: 'Noun',
  V: 'Verb',
  VPAR: 'Participle (Verbal)',
  SUPINE: 'Supine (Verbal)',
  ADJ: 'Adjective',
  ADV: 'Adverb',
  PREP: 'Preposition',
  CONJ: 'Conjunction',
  PRON: 'Pronoun',
  PACK: 'Pronoun (Compound)',
  NUM: 'Numeral',
  INTERJ: 'Interjection',
};

const FREQ_SCORE: Record<string, number> = {
  A: 60,
  B: 50,
  C: 40,
  D: 30,
  E: 20,
  F: 10,
  X: 25,
};

let stemIndex: Array<Map<string, WhitakerEntry[]>> | null = null;
let endingIndex: Map<string, InflectRule[]> | null = null;

registerOnDataHydrated(() => {
  stemIndex = null;
  endingIndex = null;
});

function ensureIndexes(): void {
  if (stemIndex && endingIndex) return;
  const whitakerDict = getWhitakerDict();
  const whitakerInflects = getWhitakerInflects();
  stemIndex = [new Map(), new Map(), new Map(), new Map()];
  endingIndex = new Map();

  for (const entry of whitakerDict.entries) {
    for (let i = 0; i < 4; i++) {
      const rawStem = entry.stems[i];
      if (!rawStem || rawStem === 'zzz') continue;
      const norm = rawStem.toLowerCase().replace(/j/g, 'i').replace(/v/g, 'u');
      const bucket = stemIndex[i].get(norm);
      if (bucket) {
        bucket.push(entry);
      } else {
        stemIndex[i].set(norm, [entry]);
      }
      // Also index with v preserved if original had v
      const normV = rawStem.toLowerCase().replace(/j/g, 'i');
      if (normV !== norm) {
        const bucketV = stemIndex[i].get(normV);
        if (bucketV) {
          bucketV.push(entry);
        } else {
          stemIndex[i].set(normV, [entry]);
        }
      }
    }
  }

  for (const rule of whitakerInflects) {
    const endNorm = rule.ending.toLowerCase().replace(/j/g, 'i');
    const bucket = endingIndex.get(endNorm);
    if (bucket) {
      bucket.push(rule);
    } else {
      endingIndex.set(endNorm, [rule]);
    }
    const endNormU = endNorm.replace(/v/g, 'u');
    if (endNormU !== endNorm) {
      const bucketU = endingIndex.get(endNormU);
      if (bucketU) {
        bucketU.push(rule);
      } else {
        endingIndex.set(endNormU, [rule]);
      }
    }
  }
}

export function reconstructHeadword(entry: WhitakerEntry): { lemma: string; headword: string } {
  const s1 = entry.stems[0] || '';
  const s2 = entry.stems[1] || s1;
  const s3 = entry.stems[2] || '';
  const s4 = entry.stems[3] || '';

  if (entry.pos === 'PRON' || entry.pos === 'PACK') {
    const pronMap: Record<string, { lemma: string; headword: string }> = {
      h: { lemma: 'hic', headword: 'hic, haec, hoc' },
      qu: { lemma: 'qui', headword: 'qui, quae, quod' },
      i: { lemma: 'is', headword: 'is, ea, id' },
      e: { lemma: 'is', headword: 'is, ea, id' },
      ill: { lemma: 'ille', headword: 'ille, illa, illud' },
      ist: { lemma: 'iste', headword: 'iste, ista, istud' },
      ips: { lemma: 'ipse', headword: 'ipse, ipsa, ipsum' },
      n: { lemma: 'nos', headword: 'nos, nostrum/nostri' },
      v: { lemma: 'vos', headword: 'vos, vestrum/vestri' },
      eg: { lemma: 'ego', headword: 'ego, mei' },
      t: { lemma: 'tu', headword: 'tu, tui' },
      s: { lemma: 'sui', headword: 'sui, sibi, se' },
      aliqu: { lemma: 'aliquis', headword: 'aliquis, aliquid' },
      quid: { lemma: 'quidam', headword: 'quidam, quaedam, quoddam' },
      quic: { lemma: 'quicumque', headword: 'quicumque, quaecumque, quodcumque' },
      utr: { lemma: 'uterque', headword: 'uterque, utraque, utrumque' },
    };
    if (pronMap[s1]) return pronMap[s1];
    if (pronMap[s2]) return pronMap[s2];
  }

  if (entry.pos === 'NUM') {
    const numMap: Record<string, { lemma: string; headword: string }> = {
      un: { lemma: 'unus', headword: 'unus, -a, -um' },
      du: { lemma: 'duo', headword: 'duo, duae, duo' },
      tr: { lemma: 'tres', headword: 'tres, tria' },
    };
    if (numMap[s1]) return numMap[s1];
  }

  if (entry.pos === 'N') {
    const gender = entry.extra.split(' ')[0] || '';
    const gStr = gender ? ` (${gender.toLowerCase()}.)` : '';
    if (entry.decl === 1) return { lemma: `${s1}a`, headword: `${s1}a, -ae${gStr}` };
    if (entry.decl === 2) {
      if (gender === 'N') return { lemma: `${s1}um`, headword: `${s1}um, -i (n.)` };
      if (entry.var === 3) return { lemma: s1, headword: `${s1}, ${s2}i (m.)` };
      return { lemma: `${s1}us`, headword: `${s1}us, -i${gStr}` };
    }
    if (entry.decl === 3) {
      const nom = s1 || s2;
      return { lemma: nom, headword: `${nom}, ${s2}is${gStr}` };
    }
    if (entry.decl === 4) {
      if (gender === 'N') return { lemma: `${s1}u`, headword: `${s1}u, -us (n.)` };
      return { lemma: `${s1}us`, headword: `${s1}us, -us${gStr}` };
    }
    if (entry.decl === 5) {
      return { lemma: `${s1}es`, headword: `${s1}es, -ei${gStr}` };
    }
    return { lemma: s1, headword: s1 };
  }

  if (entry.pos === 'V') {
    const kind = entry.extra || '';
    const isDep = kind.includes('DEP');
    if (entry.decl === 1) {
      if (isDep) return { lemma: `${s1}or`, headword: `${s1}or, ${s2}ari, ${s4}us sum` };
      return { lemma: `${s1}o`, headword: `${s1}o, ${s2}are${s3 && s3 !== 'zzz' ? `, ${s3}i` : ''}${s4 && s4 !== 'zzz' ? `, ${s4}um` : ''}` };
    }
    if (entry.decl === 2) {
      if (isDep) return { lemma: `${s1}eor`, headword: `${s1}eor, ${s2}eri, ${s4}us sum` };
      return { lemma: `${s1}eo`, headword: `${s1}eo, ${s2}ere${s3 && s3 !== 'zzz' ? `, ${s3}i` : ''}${s4 && s4 !== 'zzz' ? `, ${s4}um` : ''}` };
    }
    if (entry.decl === 3) {
      if (s1 === 'ut' || s2 === 'ut') return { lemma: 'utor', headword: 'utor, uti, usus sum' };
      if (s1 === 'fru' || s2 === 'fru') return { lemma: 'fruor', headword: 'fruor, frui, fructus sum' };
      if (entry.var === 4) {
        return { lemma: `${s1}o`, headword: `${s1}o, ${s2}ire${s3 && s3 !== 'zzz' ? `, ${s3}i` : ''}${s4 && s4 !== 'zzz' ? `, ${s4}um` : ''}` };
      }
      if (isDep) return { lemma: `${s1}or`, headword: `${s1}or, ${s2}i${s4 && s4 !== 'zzz' ? `, ${s4}us sum` : ''}` };
      return { lemma: `${s1 || s2}o`, headword: `${s1 || s2}o, ${s2 || s1}ere${s3 && s3 !== 'zzz' ? `, ${s3}i` : ''}${s4 && s4 !== 'zzz' ? `, ${s4}um` : ''}` };
    }
    if (entry.decl === 5) {
      if (s1 === 's' && s2 === 'f') return { lemma: 'sum', headword: 'sum, esse, fui, futurus' };
      if (s1 === 'poss' || s2 === 'pot') return { lemma: 'possum', headword: 'possum, posse, potui' };
    }
    return { lemma: s1 || s2, headword: `${s1 || s2} (verb)` };
  }

  if (entry.pos === 'ADJ') {
    if (entry.decl === 1) {
      if (entry.var === 2 || entry.var === 4 || (s1 !== s2 && s1.endsWith('r')) || /(?:er|ur)$/.test(s1)) {
        const femStem = s2 && s2 !== 'zzz' ? s2 : s1;
        return { lemma: s1, headword: `${s1}, ${femStem}a, ${femStem}um` };
      }
      if (entry.var === 5 && s1 === 'ali') {
        return { lemma: 'alius', headword: 'alius, alia, aliud' };
      }
      return { lemma: `${s1}us`, headword: `${s1}us, -a, -um` };
    }
    if (entry.decl === 3) {
      if (entry.var === 2) {
        const base = s1 || s2;
        return { lemma: `${base}is`, headword: `${base}is, -e` };
      }
      if (entry.var === 3) {
        const femStem = s2 && s2 !== 'zzz' ? s2 : s1;
        return { lemma: s1, headword: `${s1}, ${femStem}is, ${femStem}e` };
      }
      const nom = s1 || `${s2}is`;
      return { lemma: nom, headword: `${nom}, ${s2}is` };
    }
    return { lemma: s1, headword: s1 };
  }

  return { lemma: s1 || s2, headword: s1 || s2 };
}

function decodeMorphString(pos: string, decl: number, morph: string, entryExtra: string): Omit<
  MorphologicalParse,
  'lemma' | 'headword' | 'stemUsed' | 'endingUsed' | 'entry' | 'score'
> {
  const parts = morph.split(/\s+/).filter(Boolean);
  const posLabel = POS_NAMES[pos] || pos;

  if (pos === 'N' || pos === 'PRON' || pos === 'PACK' || pos === 'NUM') {
    const c = CASE_NAMES[parts[0]] || parts[0];
    const n = NUMBER_NAMES[parts[1]] || parts[1];
    const entryGender = entryExtra.split(' ')[0];
    const gCode = entryGender && GENDER_NAMES[entryGender] ? entryGender : parts[2];
    const g = GENDER_NAMES[gCode] || gCode;
    const declLabel = pos === 'N' && decl >= 1 && decl <= 5 ? `${decl}${decl === 1 ? 'st' : decl === 2 ? 'nd' : decl === 3 ? 'rd' : 'th'} declension` : undefined;
    const explanation = [c, n, g, declLabel].filter(Boolean).join(', ');
    return {
      pos: posLabel,
      rawPos: pos,
      case: c,
      number: n,
      gender: g,
      declension: declLabel,
      formExplanation: explanation,
    };
  }

  if (pos === 'ADJ') {
    const c = CASE_NAMES[parts[0]] || parts[0];
    const n = NUMBER_NAMES[parts[1]] || parts[1];
    const g = GENDER_NAMES[parts[2]] || parts[2];
    const deg = DEGREE_NAMES[parts[3]] || DEGREE_NAMES[entryExtra] || 'Positive';
    const explanation = [c, n, g, deg !== 'Positive' ? `(${deg})` : ''].filter(Boolean).join(' ');
    return {
      pos: posLabel,
      rawPos: pos,
      case: c,
      number: n,
      gender: g,
      degree: deg,
      formExplanation: explanation,
    };
  }

  if (pos === 'V') {
    const t = TENSE_NAMES[parts[0]] || parts[0];
    const v = VOICE_NAMES[parts[1]] || parts[1];
    const m = MOOD_NAMES[parts[2]] || parts[2];
    const pCode = parts[3];
    const p = pCode === '1' ? '1st' : pCode === '2' ? '2nd' : pCode === '3' ? '3rd' : undefined;
    const n = NUMBER_NAMES[parts[4]] || undefined;
    const conjLabel = decl >= 1 && decl <= 4 ? `${decl}${decl === 1 ? 'st' : decl === 2 ? 'nd' : decl === 3 ? 'rd' : 'th'} conjugation` : 'Irregular verb';
    const explanation = m === 'Infinitive'
      ? `${t} ${v} Infinitive (${conjLabel})`
      : [p ? `${p} Person` : '', n, t, v, m, `(${conjLabel})`].filter(Boolean).join(' ');
    return {
      pos: posLabel,
      rawPos: pos,
      tense: t,
      voice: v,
      mood: m,
      person: p,
      number: n,
      declension: conjLabel,
      formExplanation: explanation,
    };
  }

  if (pos === 'VPAR') {
    const c = CASE_NAMES[parts[0]] || parts[0];
    const n = NUMBER_NAMES[parts[1]] || parts[1];
    const g = GENDER_NAMES[parts[2]] || parts[2];
    const t = TENSE_NAMES[parts[3]] || parts[3];
    const v = VOICE_NAMES[parts[4]] || parts[4];
    const isGerundive = t === 'Future' && v === 'Passive';
    const explanation = isGerundive
      ? `Gerundive / Future Passive Participle — ${c} ${n} ${g}`
      : `${t} ${v} Participle — ${c} ${n} ${g}`;
    return {
      pos: isGerundive ? 'Gerundive / Participle' : 'Participle (Verbal)',
      rawPos: pos,
      case: c,
      number: n,
      gender: g,
      tense: t,
      voice: v,
      mood: 'Participle',
      formExplanation: explanation,
    };
  }

  if (pos === 'ADV') {
    const deg = DEGREE_NAMES[parts[0]] || DEGREE_NAMES[entryExtra] || 'Positive';
    return {
      pos: 'Adverb',
      rawPos: pos,
      degree: deg,
      formExplanation: deg !== 'Positive' ? `Adverb (${deg})` : 'Adverb (Indeclinable)',
    };
  }

  if (pos === 'PREP') {
    const gov = CASE_NAMES[entryExtra] || CASE_NAMES[parts[0]] || entryExtra;
    return {
      pos: 'Preposition',
      rawPos: pos,
      case: gov,
      formExplanation: gov ? `Preposition governing the ${gov} case` : 'Preposition',
    };
  }

  return {
    pos: posLabel,
    rawPos: pos,
    formExplanation: posLabel,
  };
}

interface IrregularForm {
  lemma: string;
  headword: string;
  pos: string;
  rawPos: string;
  case?: string;
  number?: string;
  gender?: string;
  tense?: string;
  voice?: string;
  mood?: string;
  person?: string;
  formExplanation: string;
  senses: string;
}

const BUILTIN_SCHOLASTIC_FORMS: Record<string, IrregularForm[]> = {
  sum: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Indicative', person: '1st', number: 'Singular', formExplanation: '1st Person Singular Present Active Indicative', senses: 'to be, exist, subsist' }],
  es: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Indicative', person: '2nd', number: 'Singular', formExplanation: '2nd Person Singular Present Active Indicative', senses: 'to be, exist, subsist' }],
  est: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Indicative', person: '3rd', number: 'Singular', formExplanation: '3rd Person Singular Present Active Indicative', senses: 'is, exists, subsists; (in Scholastic definitions: expresses essential predication or real existence)' }],
  sumus: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Indicative', person: '1st', number: 'Plural', formExplanation: '1st Person Plural Present Active Indicative', senses: 'we are, exist' }],
  sunt: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Indicative', person: '3rd', number: 'Plural', formExplanation: '3rd Person Plural Present Active Indicative', senses: 'they are, exist, subsist' }],
  sit: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Subjunctive', person: '3rd', number: 'Singular', formExplanation: '3rd Person Singular Present Active Subjunctive', senses: 'may be, is (in Scholastic indirect questions "utrum sit..." and "videtur quod non sit..." clauses)' }],
  sint: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Subjunctive', person: '3rd', number: 'Plural', formExplanation: '3rd Person Plural Present Active Subjunctive', senses: 'may be, are (in subjunctive clauses)' }],
  esset: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Imperfect', voice: 'Active', mood: 'Subjunctive', person: '3rd', number: 'Singular', formExplanation: '3rd Person Singular Imperfect Active Subjunctive', senses: 'would be, might be, were (in counterfactual or subordinate clauses)' }],
  essent: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Imperfect', voice: 'Active', mood: 'Subjunctive', person: '3rd', number: 'Plural', formExplanation: '3rd Person Plural Imperfect Active Subjunctive', senses: 'would be, might be, were' }],
  esse: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb / Substantivized Infinitive', rawPos: 'V', tense: 'Present', voice: 'Active', mood: 'Infinitive', formExplanation: 'Present Active Infinitive (often substantivized in Aquinas as "the act of being / existence")', senses: 'to be, to exist; as noun: the act of being (actus essendi), existence' }],
  fuit: [{ lemma: 'sum', headword: 'sum, esse, fui, futurus', pos: 'Verb', rawPos: 'V', tense: 'Perfect', voice: 'Active', mood: 'Indicative', person: '3rd', number: 'Singular', formExplanation: '3rd Person Singular Perfect Active Indicative', senses: 'was, has been' }],
  ens: [{ lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Nominative', number: 'Singular', gender: 'Neuter', formExplanation: 'Nominative/Accusative Singular (Substantivized Participle of sum)', senses: 'being, that which is (id quod habet esse)' }],
  entis: [{ lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Genitive', number: 'Singular', gender: 'Neuter', formExplanation: 'Genitive Singular (3rd declension)', senses: 'of being, of that which exists' }],
  enti: [{ lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Dative', number: 'Singular', gender: 'Neuter', formExplanation: 'Dative Singular (3rd declension)', senses: 'to/for being' }],
  ente: [{ lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Ablative', number: 'Singular', gender: 'Neuter', formExplanation: 'Ablative Singular (3rd declension)', senses: 'by/with/from/concerning being (ens, entis)' }],
  entia: [{ lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Nominative', number: 'Plural', gender: 'Neuter', formExplanation: 'Nominative/Accusative Plural Neuter (3rd declension -i stem)', senses: 'beings, existing things' }],
  entium: [{ lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Genitive', number: 'Plural', gender: 'Neuter', formExplanation: 'Genitive Plural (3rd declension)', senses: 'of beings, of existing things' }],
  entibus: [
    { lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Ablative', number: 'Plural', gender: 'Neuter', formExplanation: 'Ablative Plural (3rd declension)', senses: 'by/with/from/concerning beings (ens, entis)' },
    { lemma: 'ens', headword: 'ens, entis (n./m.)', pos: 'Noun / Participle', rawPos: 'N', case: 'Dative', number: 'Plural', gender: 'Neuter', formExplanation: 'Dative Plural (3rd declension)', senses: 'to/for beings (ens, entis)' },
  ],
  uterque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Nominative', number: 'Singular', gender: 'Masculine', formExplanation: 'Nominative Singular Masculine (Pronominal)', senses: 'each (of two), both, either; in Scholastic disputation: both sides/arguments' }],
  utraque: [
    { lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Nominative', number: 'Singular', gender: 'Feminine', formExplanation: 'Nominative/Ablative Singular Feminine or Nominative/Accusative Plural Neuter', senses: 'each (of two), both, either' },
    { lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Ablative', number: 'Singular', gender: 'Feminine', formExplanation: 'Ablative Singular Feminine (Pronominal)', senses: 'in/by each (of two), on both sides' },
  ],
  utrumque: [
    { lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Accusative', number: 'Singular', gender: 'Neuter', formExplanation: 'Nominative/Accusative Singular Neuter or Accusative Singular Masculine', senses: 'each (of two), both (things), both together' },
    { lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Nominative', number: 'Singular', gender: 'Neuter', formExplanation: 'Nominative Singular Neuter (Pronominal)', senses: 'each (of two), both (things)' },
  ],
  utriusque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Genitive', number: 'Singular', gender: 'Common (M/F)', formExplanation: 'Genitive Singular All Genders (-ius pronominal genitive)', senses: 'of each (of two), of both' }],
  utrique: [
    { lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Dative', number: 'Singular', gender: 'Common (M/F)', formExplanation: 'Dative Singular All Genders (-i pronominal dative) or Nominative Plural Masculine', senses: 'to/for each (of two), to both; both (plural)' },
    { lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Nominative', number: 'Plural', gender: 'Masculine', formExplanation: 'Nominative Plural Masculine', senses: 'both (parties/sides)' },
  ],
  utramque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Accusative', number: 'Singular', gender: 'Feminine', formExplanation: 'Accusative Singular Feminine', senses: 'each (of two), both (e.g., in utramque partem: on both sides of a disputed question)' }],
  utroque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Ablative', number: 'Singular', gender: 'Masculine', formExplanation: 'Ablative Singular Masculine/Neuter (e.g., utroque modo: in both ways)', senses: 'by/in each (of two), in both (ways/respects)' }],
  utrisque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Ablative', number: 'Plural', gender: 'All genders', formExplanation: 'Dative/Ablative Plural All Genders', senses: 'to/by both (sides/things)' }],
  utrosque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Accusative', number: 'Plural', gender: 'Masculine', formExplanation: 'Accusative Plural Masculine', senses: 'both' }],
  utrasque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Accusative', number: 'Plural', gender: 'Feminine', formExplanation: 'Accusative Plural Feminine', senses: 'both' }],
  utrorumque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Genitive', number: 'Plural', gender: 'Masculine', formExplanation: 'Genitive Plural Masculine/Neuter', senses: 'of both' }],
  utrarumque: [{ lemma: 'uterque', headword: 'uterque, utraque, utrumque', pos: 'Pronoun / Pronominal Adjective', rawPos: 'PRON', case: 'Genitive', number: 'Plural', gender: 'Feminine', formExplanation: 'Genitive Plural Feminine', senses: 'of both' }],
  denique: [{ lemma: 'denique', headword: 'denique (adv.)', pos: 'Adverb', rawPos: 'ADV', formExplanation: 'Adverb (Indeclinable connective)', senses: 'finally, at last, in short, in fine, ultimately' }],
  quousque: [{ lemma: 'quousque', headword: 'quousque (adv./conj.)', pos: 'Adverb / Conjunction', rawPos: 'ADV', formExplanation: 'Adverb / Subordinating Conjunction', senses: 'until, how long, how far, up to the point that' }],
  quandoque: [{ lemma: 'quandoque', headword: 'quandoque (adv.)', pos: 'Adverb', rawPos: 'ADV', formExplanation: 'Temporal Adverb (Indeclinable)', senses: 'sometimes, at some time, now and then, whenever (frequent in Aquinas: quandoque... quandoque = sometimes... at other times)' }],
};

function expandSyncopatedVerbForms(word: string): string[] {
  const out: string[] = [];
  // e.g. quaesieris -> quaesiveris, quaesierunt -> quaesiverunt, cognosse -> cognovisse, amasti -> amavisti
  if (word.endsWith('ieris')) out.push(word.replace(/ieris$/, 'iveris'));
  if (word.endsWith('ierit')) out.push(word.replace(/ierit$/, 'iverit'));
  if (word.endsWith('ierint')) out.push(word.replace(/ierint$/, 'iverint'));
  if (word.endsWith('ierunt')) out.push(word.replace(/ierunt$/, 'iverunt'));
  if (word.endsWith('ieram')) out.push(word.replace(/ieram$/, 'iveram'));
  if (word.endsWith('ierat')) out.push(word.replace(/ierat$/, 'iverat'));
  if (word.endsWith('ierant')) out.push(word.replace(/ierant$/, 'iverant'));
  if (word.endsWith('issem')) out.push(word.replace(/issem$/, 'ivissem'));
  if (word.endsWith('isset')) out.push(word.replace(/isset$/, 'ivisset'));
  if (word.endsWith('issent')) out.push(word.replace(/issent$/, 'ivissent'));
  if (word.endsWith('isse')) out.push(word.replace(/isse$/, 'ivisse'));
  if (word.endsWith('asti')) out.push(word.replace(/asti$/, 'avisti'));
  if (word.endsWith('arunt')) out.push(word.replace(/arunt$/, 'averunt'));
  if (word.endsWith('asse')) out.push(word.replace(/asse$/, 'avisse'));
  if (word.endsWith('asset')) out.push(word.replace(/asset$/, 'avisset'));
  return out;
}

export function parseWordMorphology(rawWord: string): MorphologicalParse[] {
  ensureIndexes();
  const whitakerDict = getWhitakerDict();
  const clean = cleanLatinString(rawWord);
  if (!clean) return [];

  const candidateWords = Array.from(
    new Set([...generateOrthographicVariants(clean), ...expandSyncopatedVerbForms(clean)])
  );

  const results: MorphologicalParse[] = [];
  const seenKey = new Set<string>();

  // 1. Check built-in Scholastic & irregular forms first
  for (const cand of candidateWords) {
    const builtins = BUILTIN_SCHOLASTIC_FORMS[cand];
    if (builtins) {
      for (const b of builtins) {
        const key = `${b.lemma}|${b.pos}|${b.formExplanation}`;
        if (!seenKey.has(key)) {
          seenKey.add(key);
          results.push({
            lemma: b.lemma,
            headword: b.headword,
            pos: b.pos,
            rawPos: b.rawPos,
            case: b.case,
            number: b.number,
            gender: b.gender,
            tense: b.tense,
            voice: b.voice,
            mood: b.mood,
            person: b.person,
            formExplanation: b.formExplanation,
            stemUsed: cand,
            endingUsed: '',
            entry: {
              stems: [b.lemma, '', '', ''],
              pos: b.rawPos,
              decl: 0,
              var: 0,
              extra: '',
              age: 'X',
              area: 'E',
              freq: 'A',
              senses: b.senses,
            },
            score: 120,
          });
        }
      }
    }
  }

  // 2. Check Whitaker UNIQUES.LAT
  for (const cand of candidateWords) {
    const uniqs = whitakerDict.uniques[cand];
    if (uniqs) {
      for (const u of uniqs) {
        const decoded = decodeMorphString(u.pos, 0, u.morph, '');
        const key = `${cand}|${u.pos}|${decoded.formExplanation}`;
        if (!seenKey.has(key)) {
          seenKey.add(key);
          results.push({
            lemma: cand,
            headword: cand,
            ...decoded,
            stemUsed: cand,
            endingUsed: '',
            entry: {
              stems: [cand, '', '', ''],
              pos: u.pos,
              decl: 0,
              var: 0,
              extra: '',
              age: 'X',
              area: 'X',
              freq: 'B',
              senses: u.senses,
            },
            score: 100,
          });
        }
      }
    }
  }

  // 3. Stem + Ending morphological decomposition
  for (const cand of candidateWords) {
    const maxEndLen = Math.min(cand.length, 10);
    for (let endLen = maxEndLen; endLen >= 0; endLen--) {
      const stemPart = cand.slice(0, cand.length - endLen);
      const endPart = cand.slice(cand.length - endLen);
      const rules = endingIndex!.get(endPart);
      if (!rules) continue;

      for (const rule of rules) {
        const stemIdx = rule.stem - 1;
        if (stemIdx < 0 || stemIdx > 3) continue;
        const matchingEntries = stemIndex![stemIdx].get(stemPart);
        if (!matchingEntries) continue;

        for (const entry of matchingEntries) {
          // Check POS compatibility (VPAR and SUPINE rules apply to V entries)
          const posCompatible =
            entry.pos === rule.pos ||
            (entry.pos === 'V' && (rule.pos === 'VPAR' || rule.pos === 'SUPINE')) ||
            (entry.pos === 'PACK' && rule.pos === 'PRON');
          if (!posCompatible) continue;

          // Check declension & variant compatibility (0 in rule or entry is wildcard)
          if (rule.decl !== 0 && entry.decl !== 0 && rule.decl !== entry.decl) continue;
          if (rule.var !== 0 && entry.var !== 0 && rule.var !== entry.var) continue;

          const { lemma, headword } = reconstructHeadword(entry);
          const decoded = decodeMorphString(rule.pos, entry.decl, rule.morph, entry.extra);

          const dedupKey = `${lemma}|${decoded.pos}|${decoded.formExplanation}`;
          if (seenKey.has(dedupKey)) continue;
          seenKey.add(dedupKey);

          let score = (FREQ_SCORE[entry.freq] || 25) + (FREQ_SCORE[rule.freq] || 25) / 2;
          if (entry.area === 'E' || entry.age === 'E' || entry.age === 'F') {
            score += 18; // Boost Ecclesiastical & Scholastic vocabulary
          }
          if (cand === clean) {
            score += 10; // Exact orthographic match bonus
          }
          // Demote archaic/poetic 2nd-person singular passive "-are" / "-ere" / "-ire" (for "-aris" / "-eris" / "-iris") so active infinitives ("investigare", "tradere", "dicere", "audire") win (BUG-05)
          if (
            rule.pos === 'V' &&
            (rule.ending === 'are' || rule.ending === 'ere' || rule.ending === 'ire') &&
            rule.morph.includes('PASSIVE') &&
            rule.morph.includes('2 S')
          ) {
            score -= 45;
          }
          if (rule.pos === 'V' && rule.morph.includes('ACTIVE') && rule.morph.includes('INF')) {
            score += 20;
          }
          // Demote Locative case on plural/general nouns so Ablative/Dative Plural ("limitibus") wins (BUG-05)
          if (decoded.case === 'Locative') {
            score -= 40;
          }
          // Demote rare Future Imperatives ("-to" / "-tote" / "-nto") so Perfect Passive Participles ("finito", "posito", "dicto") win
          if (rule.pos === 'V' && rule.morph.includes('FUT') && rule.morph.includes('IMP')) {
            score -= 35;
          }
          // Demote rare archaic deponent variant "secor" when "secundus" (second / following) is available
          if (lemma === 'secor') {
            score -= 45;
          }

          results.push({
            lemma,
            headword,
            ...decoded,
            stemUsed: stemPart,
            endingUsed: endPart,
            entry,
            score,
          });
        }
      }
    }
  }

  // 4. Whitaker tackon / prefix fallback when no direct parse matched
  if (results.length === 0 && whitakerDict.tackons) {
    for (const tackon of whitakerDict.tackons) {
      const part = tackon.particle?.toLowerCase();
      if (part && clean.length > part.length + 2 && clean.endsWith(part)) {
        const stemCand = clean.slice(0, -part.length);
        const subParses = parseWordMorphology(stemCand);
        for (const sp of subParses) {
          const isPack = sp.rawPos === 'PRON' || sp.rawPos === 'PACK' || sp.lemma === 'uter' || sp.lemma === 'qui' || sp.lemma === 'quis';
          const compoundLemma = isPack && part === 'que' && sp.lemma === 'uter' ? 'uterque' : `${sp.lemma}${part}`;
          results.push({
            ...sp,
            lemma: compoundLemma,
            headword: isPack && compoundLemma === 'uterque' ? 'uterque, utraque, utrumque' : `${sp.headword} (+ -${part})`,
            endingUsed: `${sp.endingUsed}${part}`,
            score: sp.score - 5,
          });
        }
        if (results.length > 0) break;
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 16);
}
