export type ScholasticSectionType =
  | 'prooemium'
  | 'objection'
  | 'sed_contra'
  | 'corpus'
  | 'reply'
  | 'other';

export interface EncliticInfo {
  particle: 'que' | 'ne' | 've' | 'cum' | 'met';
  meaning: string;
}

export interface NormalizedToken {
  raw: string;
  clean: string;
  baseWord: string;
  enclitic?: EncliticInfo;
  compoundParts?: string[];
  variants: string[];
}

const SCHOLASTIC_COMPOUNDS: Record<string, string[]> = {
  inquantum: ['in', 'quantum'],
  intantum: ['in', 'tantum'],
  idest: ['id', 'est'],
  seipso: ['se', 'ipso'],
  seipsum: ['se', 'ipsum'],
  seipsam: ['se', 'ipsam'],
  seipsis: ['se', 'ipsis'],
  seipsa: ['se', 'ipsa'],
  seipsos: ['se', 'ipsos'],
  seipsas: ['se', 'ipsas'],
  suiipsius: ['sui', 'ipsius'],
  sibiipsi: ['sibi', 'ipsi'],
  huiusmodi: ['huius', 'modi'],
  eiusmodi: ['eius', 'modi'],
  cuiusmodi: ['cuius', 'modi'],
  quemadmodum: ['quem', 'ad', 'modum'],
  quodammodo: ['quodam', 'modo'],
  nullomodo: ['nullo', 'modo'],
  aliquomodo: ['aliquo', 'modo'],
  omnimodo: ['omni', 'modo'],
  tantummodo: ['tantum', 'modo'],
  propterea: ['propter', 'ea'],
  quare: ['qua', 're'],
  quapropter: ['qua', 'propter'],
  quamobrem: ['quam', 'ob', 'rem'],
  nihilominus: ['nihilo', 'minus'],
  quinimmo: ['quin', 'immo'],
  siquidem: ['si', 'quidem'],
};

const NON_ENCLITIC_QUE = new Set([
  'atque',
  'ac',
  'itaque',
  'namque',
  'neque',
  'nec',
  'ubique',
  'undique',
  'utique',
  'usque',
  'abusque',
  'adusque',
  'absque',
  'quinque',
  'quoque',
  'quaque',
  'plerique',
  'pleraeque',
  'pleraque',
  'plerumque',
  'plerisque',
  'plerasque',
  'plerosque',
  'uterque',
  'utraque',
  'utrumque',
  'utriusque',
  'utrique',
  'utramque',
  'utroque',
  'utrisque',
  'utrosque',
  'utrasque',
  'quisque',
  'quaeque',
  'quidque',
  'quodque',
  'cuiusque',
  'cuique',
  'quemque',
  'quamque',
  'quoque',
  'quique',
  'quibusque',
  'quosque',
  'quasque',
  'unusquisque',
  'unaquaeque',
  'unumquodque',
  'uniuscuiusque',
  'unicuique',
  'unumquemque',
  'unamquamque',
  'unoquoque',
  'unaquaque',
  'quicumque',
  'quaecumque',
  'quodcumque',
  'quidcumque',
  'cuiuscumque',
  'cuicumque',
  'quemcumque',
  'quamcumque',
  'quocumque',
  'quacumque',
  'quibuscumque',
  'quoscumque',
  'quascumque',
  'quorumcumque',
  'quarumcumque',
  'qualiscumque',
  'qualecumque',
  'quantuscumque',
  'quantacumque',
  'quantumcumque',
  'quotcumque',
  'ubicumque',
  'quandocumque',
  'quomodocumque',
  'quotienscumque',
  'denique',
  'quousque',
  'quandoque',
  'utrobique',
  'usquequaque',
  'circumquaque',
  'oblique',
  'adaeque',
  'aeque',
  'inique',
  'antique',
  'longinque',
  'propinque',
  'quorumque',
  'quarumque',
]);

const PRONOUN_CUM_BASES: Record<string, string> = {
  mecum: 'me',
  tecum: 'te',
  secum: 'se',
  nobiscum: 'nobis',
  vobiscum: 'vobis',
  quocum: 'quo',
  quacum: 'qua',
  quibuscum: 'quibus',
};

const VERB_NE_TARGETS = new Set([
  'sitne',
  'estne',
  'suntne',
  'eratne',
  'fuitne',
  'potestne',
  'possitne',
  'debetne',
  'debeatne',
  'habetne',
  'habeatne',
  'videturne',
  'diciturne',
  'utrumne',
  'anne',
  'nonne',
  'necne',
]);

const VALID_VE_TARGETS = new Set([
  'plusve',
  'minusve',
  'bisve',
  'terve',
  'duove',
  'triave',
  'magisve',
  'autve',
  'velve',
]);

export function cleanLatinString(raw: string): string {
  if (/^[A-Za-z]+$/.test(raw)) {
    return raw.toLowerCase().replace(/j/g, 'i');
  }
  return raw
    .trim()
    .replace(
      /^[^a-zA-Z\u00C0-\u00FF\u0100-\u017E\u00C6\u00E6\u0152\u0153]+|[^a-zA-Z\u00C0-\u00FF\u0100-\u017E\u00C6\u00E6\u0152\u0153]+$/g,
      ''
    )
    .replace(/\u00E6/gi, 'ae')
    .replace(/\u0153/gi, 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/j/g, 'i');
}

export function generateOrthographicVariants(word: string): string[] {
  const base = cleanLatinString(word);
  const out = new Set<string>([base]);

  // Medieval & Ecclesiastical ci <-> ti before vowel (e.g., condicio <-> conditio, definitio <-> definicio)
  if (/ci([aeou])/i.test(base)) {
    out.add(base.replace(/ci([aeou])/g, 'ti$1'));
  }
  if (/ti([aeou])/i.test(base)) {
    out.add(base.replace(/ti([aeou])/g, 'ci$1'));
  }

  // quatuor <-> quattuor, litera <-> littera, etc.
  if (base.startsWith('quatuor')) {
    out.add(base.replace(/^quatuor/, 'quattuor'));
  }
  if (base.startsWith('quattuor')) {
    out.add(base.replace(/^quattuor/, 'quatuor'));
  }

  // u <-> v variations in stems
  if (base.includes('u')) {
    out.add(base.replace(/u/g, 'v'));
  }
  if (base.includes('v')) {
    out.add(base.replace(/v/g, 'u'));
  }

  // ae <-> oe <-> e (caelum / coelum / celum, poena / pena)
  if (base.includes('ae')) {
    out.add(base.replace(/ae/g, 'e'));
    out.add(base.replace(/ae/g, 'oe'));
  }
  if (base.includes('oe')) {
    out.add(base.replace(/oe/g, 'ae'));
    out.add(base.replace(/oe/g, 'e'));
  }

  // michi / nichil
  if (base === 'michi') out.add('mihi');
  if (base === 'nichil') out.add('nihil');
  if (base === 'charitas') out.add('caritas');
  if (base.startsWith('charit')) out.add(base.replace(/^charit/, 'carit'));

  return Array.from(out);
}

export function normalizeLatinWord(raw: string): NormalizedToken {
  const clean = cleanLatinString(raw);
  const compoundParts = SCHOLASTIC_COMPOUNDS[clean];

  let baseWord = clean;
  let enclitic: EncliticInfo | undefined;

  if (PRONOUN_CUM_BASES[clean]) {
    baseWord = PRONOUN_CUM_BASES[clean];
    enclitic = {
      particle: 'cum',
      meaning: 'with (enclitic preposition -cum)',
    };
  } else if (
    clean.length > 4 &&
    clean.endsWith('que') &&
    !NON_ENCLITIC_QUE.has(clean) &&
    !clean.endsWith('cumque') &&
    !clean.endsWith('quaque') &&
    !clean.endsWith('quoque') &&
    !clean.endsWith('antiqua') &&
    !/^(antiqu|iniqu|aequ|relinqu|sequ|consequ|exsequ|persequ|prosequ|obsequ|assequ|eloqu|colloqu|loqu|propink|propinqu|torqu|coqu|linqu|delinqu)/.test(
      clean
    )
  ) {
    baseWord = clean.slice(0, -3);
    enclitic = {
      particle: 'que',
      meaning: 'and (enclitic conjunction -que)',
    };
  } else if (VERB_NE_TARGETS.has(clean) && clean !== 'nonne' && clean !== 'necne' && clean !== 'anne') {
    baseWord = clean.slice(0, -2);
    enclitic = {
      particle: 'ne',
      meaning: 'whether / interrogative particle (-ne)',
    };
  } else if (VALID_VE_TARGETS.has(clean)) {
    baseWord = clean.slice(0, -2);
    enclitic = {
      particle: 've',
      meaning: 'or (enclitic conjunction -ve)',
    };
  } else if (clean.endsWith('met') && ['egomet', 'memet', 'temet', 'semet', 'sibimet', 'nosmet', 'vosmet', 'ipsemets'].includes(clean)) {
    baseWord = clean.slice(0, -3);
    enclitic = {
      particle: 'met',
      meaning: 'self / own (intensive enclitic -met)',
    };
  }

  const variants = generateOrthographicVariants(baseWord);

  return {
    raw,
    clean,
    baseWord,
    enclitic,
    compoundParts,
    variants,
  };
}

export function classifyScholasticSection(citation: string, text: string): ScholasticSectionType {
  const c = citation.toLowerCase();
  const t = text.trim().toLowerCase();
  if (/\bpr\.|\bprooem|\bprol/.test(c)) {
    return 'prooemium';
  }
  if (/\barg\b|\bobiect|\bobj\b/.test(c) || t.startsWith('ad primum sic proceditur') || t.startsWith('videtur quod')) {
    return 'objection';
  }
  if (/\bs\.\s*c\.|\bsed contra/.test(c) || t.startsWith('sed contra')) {
    return 'sed_contra';
  }
  if (/\bco\.|\bcorp/.test(c) || t.startsWith('respondeo dicendum')) {
    return 'corpus';
  }
  if (/\bad\s+[0-9]|\bad\s+arg/.test(c) || /^ad\s+(primum|secundum|tertium|quartum|quintum|sextum|septimum|octavum|nonum|decimum)\s+(ergo\s+)?dicendum/.test(t)) {
    return 'reply';
  }
  return 'other';
}

export function extractParagraphCitationAndText(
  rawParagraphText: string,
  titleAttr?: string
): {
  citation: string;
  corpusId?: string;
  sectionType: ScholasticSectionType;
  cleanText: string;
} {
  let cleanText = rawParagraphText.replace(/\s+/g, ' ').trim();
  let corpusId: string | undefined;
  let citationFromBracket = '';

  const normalizedTitleAttr = (titleAttr || '')
    .replace(/\u00AA/g, '')
    .replace(/\u00BA/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. If titleAttr is provided, try matching "[id] <titleAttr>" first so multi-part citations (e.g., "s. c. 2", "qc. 2 ad 1") never partially strip
  const cleanTextNormalizedOrd = cleanText.replace(/\u00AA/g, '').replace(/\u00BA/g, '');
  if (normalizedTitleAttr) {
    const escapedTitle = normalizedTitleAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const exactTitleRe = new RegExp(String.raw`^\[(\d+)\]\s*(${escapedTitle})\s*`, 'i');
    const exactMatch = cleanTextNormalizedOrd.match(exactTitleRe);
    if (exactMatch) {
      corpusId = exactMatch[1];
      citationFromBracket = normalizedTitleAttr;
      // Compute corresponding length in original cleanText (accounting for any ordinal indicators)
      const rawIdAndTitleRe = new RegExp(
        String.raw`^\[(\d+)\]\s*` +
          normalizedTitleAttr
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\b(I|II|III|IV)\b/g, '$1[\\u00AA\\u00BA]?')
            .replace(/\s+/g, '\\s+') +
          String.raw`\s*`,
        'i'
      );
      const rawMatch = cleanText.match(rawIdAndTitleRe);
      if (rawMatch) {
        cleanText = cleanText.slice(rawMatch[0].length).trim();
      } else {
        cleanText = cleanTextNormalizedOrd.slice(exactMatch[0].length).trim();
      }
    }
  }

  if (!corpusId) {
    const citationUnit = String.raw`(?:pr\.|prol\.|prima|secunda|tertia|qc\.\s*\d+|q\.\s*\d+|a\.\s*\d+|arg\.\s*\d+|s\.\s*c\.(?:\s*\d+)?|co\.|ad\s*\d+|ad\s+arg\.|ad\s+obiecta|expos\.|lect\.\s*\d+|in\s+\w+\.|tr\.\s*\d+|resp\.|n\.\s*\d+|cap\.\s*\d+|lib\.\s*\d+|d\.\s*\d+|dist\.\s*\d+)`;
    // Match Corpus Thomisticum reference prefix greedily across all citation units before the opening sentence
    const prefixMatch = cleanText.match(
      new RegExp(
        String.raw`^\[(\d+)\]\s*((?:[A-Za-z\u00AA\u00BA.,\s-]*?${citationUnit}\s*)+)(?=[A-Z\u00C6\u0152"\u00AB])`
      )
    );
    if (prefixMatch) {
      corpusId = prefixMatch[1];
      citationFromBracket = prefixMatch[2]
        .replace(/\u00AA/g, '')
        .replace(/\u00BA/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      cleanText = cleanText.slice(prefixMatch[0].length).trim();
    } else {
      const bracketRefMatch = cleanText.match(
        /^\[(\d+)\]\s*([^\n]*?(?:\s+pr\.|\s+q\.\s*\d+|\s+qc\.\s*\d+|\s+a\.\s*\d+|\s+co\.|\s+s\.\s*c\.(?:\s*\d+)?|\s+arg\.\s*\d+|\s+ad\s+\d+|\s+expos\.|\s+n\.\s*\d+|\s+cap\.\s*\d+)+)/
      );
      if (bracketRefMatch) {
        corpusId = bracketRefMatch[1];
        citationFromBracket = bracketRefMatch[2]
          .replace(/\u00AA/g, '')
          .replace(/\u00BA/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        cleanText = cleanText.slice(bracketRefMatch[0].length).trim();
      }
    }
  }

  const normalizedTitle = normalizedTitleAttr || citationFromBracket;
  const sectionType = classifyScholasticSection(normalizedTitle, cleanText);

  return {
    citation: normalizedTitle,
    corpusId,
    sectionType,
    cleanText,
  };
}

const ABBREVIATION_WORDS = new Set([
  'eccli',
  'eccl',
  'sap',
  'prov',
  'deut',
  'gen',
  'exod',
  'lev',
  'num',
  'ios',
  'iud',
  'reg',
  'par',
  'esdr',
  'neh',
  'tob',
  'iudith',
  'esth',
  'iob',
  'ps',
  'psalm',
  'cant',
  'is',
  'isa',
  'ier',
  'lam',
  'bar',
  'ez',
  'ezech',
  'dan',
  'os',
  'ioel',
  'amos',
  'abd',
  'ion',
  'mich',
  'nah',
  'hab',
  'soph',
  'agg',
  'zach',
  'mal',
  'mach',
  'matth',
  'marc',
  'luc',
  'ioan',
  'io',
  'act',
  'rom',
  'cor',
  'gal',
  'eph',
  'phil',
  'col',
  'thess',
  'thessalon',
  'tim',
  'tit',
  'philem',
  'hebr',
  'iac',
  'petr',
  'apoc',
  'metaphys',
  'metaph',
  'met',
  'phys',
  'ethic',
  'eth',
  'pol',
  'polit',
  'rhet',
  'poster',
  'prior',
  'anal',
  'top',
  'elench',
  'categ',
  'periherm',
  'anim',
  'cael',
  'gener',
  'meteor',
  'hist',
  'part',
  ' Trin',
  'trin',
  'civ',
  'conf',
  'confess',
  'hom',
  'homil',
  'epist',
  'ep',
  'cap',
  'lib',
  'dist',
  'art',
  'quaest',
  'obj',
  'arg',
  'ad',
  'sc',
  'scil',
  'idest',
  'viz',
  'cf',
  'ib',
  'ibid',
  'sent',
  'quodl',
  'pot',
  'verit',
  'mal',
  'spir',
  'comp',
  'cg',
  'th',
  'cael',
  'hier',
  'div',
  'nom',
  'eccl',
  'q',
  'a',
  'c',
  's',
  'd',
  'l',
  'n',
  'v',
  'p',
  'i',
  'ii',
  'iii',
  'iv',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
  'xi',
  'xii',
  'xiii',
  'xiv',
  'xv',
  'xvi',
  'xvii',
  'xviii',
  'xix',
  'xx',
  'xxi',
  'xxii',
  'xxiii',
  'xxiv',
  'xxv',
  'xxx',
  'xl',
  'l',
  'lx',
  'lxx',
  'lxxx',
  'xc',
  'c',
]);

export function splitIntoSentences(cleanText: string): string[] {
  const text = cleanText.replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '.' || ch === '?' || ch === '!') {
      // Look behind for preceding word
      const before = text.slice(start, i).trim();
      const lastTokenMatch = before.match(/([A-Za-z\u00C0-\u00FF\u0100-\u017E]+)$/);
      const lastToken = lastTokenMatch ? lastTokenMatch[1].toLowerCase() : '';

      // Check what follows the period
      const after = text.slice(i + 1);
      const nextParenClose = after.startsWith(')');
      const afterSkipParen = nextParenClose ? after.slice(1) : after;

      if (ch === '.' && ABBREVIATION_WORDS.has(lastToken)) {
        // E.g. "II Thessalon. III." -> if followed by ", " or lowercase or Roman numeral, not end of sentence.
        // Even if followed by Capital letter, if lastToken is 'cap', 'lib', 'dist', 'eccli', 'thessalon', etc.
        // wait: what if the sentence actually ends with "ut dicitur II Thessalon. III." or "(I Metaphys.)."?
        const nextTrimmed = afterSkipParen.trimStart();
        const nextWordMatch = nextTrimmed.match(/^([A-Za-z]+)/);
        const nextWord = nextWordMatch ? nextWordMatch[1] : '';
        const isNextRoman = /^[IVXLCDM]+([.,;\s]|$)/.test(nextTrimmed);

        if (isNextRoman || /^[a-z,]/.test(nextTrimmed)) {
          continue;
        }
        if (['cap', 'lib', 'dist', 'art', 'q', 'a', 's'].includes(lastToken) && nextWord) {
          continue;
        }
      }

      // If period is immediately followed by '.)', let the closing paren be included
      if (nextParenClose && after.slice(1).startsWith('.')) {
        continue;
      }

      const endIdx = nextParenClose ? i + 2 : i + 1;
      const rest = text.slice(endIdx);
      if (rest.length === 0 || /^\s+[A-Z\u00C6\u0152\u00AB"'(]/.test(rest)) {
        const candidate = text.slice(start, endIdx).trim();
        if (candidate) {
          sentences.push(candidate);
        }
        start = endIdx;
        while (start < text.length && /\s/.test(text[start])) {
          start++;
        }
        i = start - 1;
      }
    }
  }

  if (start < text.length) {
    const tail = text.slice(start).trim();
    if (tail) {
      sentences.push(tail);
    }
  }

  return sentences;
}

export function findContainingSentence(
  paragraphText: string,
  wordCharOffset: number,
  titleAttr?: string
): {
  sentence: string;
  sentenceStartOffset: number;
  citation: string;
  corpusId?: string;
  sectionType: ScholasticSectionType;
} {
  const { citation, corpusId, sectionType, cleanText } = extractParagraphCitationAndText(
    paragraphText,
    titleAttr
  );
  const sentences = splitIntoSentences(cleanText);
  if (sentences.length === 0) {
    return { sentence: cleanText, sentenceStartOffset: 0, citation, corpusId, sectionType };
  }

  let runningOffset = 0;
  for (const s of sentences) {
    const idx = cleanText.indexOf(s, runningOffset);
    const start = idx >= 0 ? idx : runningOffset;
    const end = start + s.length;
    if (wordCharOffset >= start && wordCharOffset <= end) {
      return { sentence: s, sentenceStartOffset: start, citation, corpusId, sectionType };
    }
    runningOffset = end;
  }

  return { sentence: sentences[0], sentenceStartOffset: 0, citation, corpusId, sectionType };
}
