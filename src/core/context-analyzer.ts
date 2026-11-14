import {
  cleanLatinString,
  classifyScholasticSection,
  ScholasticSectionType,
} from './normalizer';
import { MorphologicalParse } from './morphology';
import { analyzeWord, WordAnalysisResult } from './dictionaries';
import {
  translateLatinSentence,
  SentenceTranslationResult,
} from './sentence-translator';

export interface GrammarConstructionNote {
  name: string;
  trigger: string;
  explanation: string;
}

export interface ScholasticSectionGuide {
  sectionType: ScholasticSectionType;
  label: string;
  readingAdvice: string;
}

export interface ContextualAnalysisResult {
  wordAnalysis: WordAnalysisResult;
  selectedParse?: MorphologicalParse;
  disambiguationReason: string;
  contextualMeaning: string;
  literalVsContextual: {
    literal: string;
    contextual: string;
    nuanceExplanation: string;
  };
  grammarConstructions: GrammarConstructionNote[];
  scholasticSectionGuide: ScholasticSectionGuide;
  sentenceTranslation: SentenceTranslationResult;
}

const ABLATIVE_PREPS = new Set([
  'a',
  'ab',
  'abs',
  'absque',
  'coram',
  'cum',
  'de',
  'e',
  'ex',
  'prae',
  'pro',
  'sine',
]);

const ACCUSATIVE_PREPS = new Set([
  'ad',
  'adversum',
  'adversus',
  'ante',
  'apud',
  'circa',
  'circiter',
  'circum',
  'contra',
  'erga',
  'extra',
  'infra',
  'inter',
  'intra',
  'iuxta',
  'ob',
  'penes',
  'per',
  'post',
  'praeter',
  'prope',
  'propter',
  'secundum',
  'supra',
  'trans',
  'ultra',
  'versus',
]);

const DUAL_CASE_PREPS = new Set(['in', 'sub', 'super']);

const GENITIVE_SG_MODIFIERS = new Set([
  'huius',
  'cuius',
  'eius',
  'ipsius',
  'illius',
  'istius',
  'unius',
  'ullius',
  'nullius',
  'solius',
  'totius',
  'alterius',
  'utriusque',
  'cuiuslibet',
  'alicuius',
]);

const DATIVE_SG_MODIFIERS = new Set([
  'huic',
  'cui',
  'ei',
  'ipsi',
  'illi',
  'isti',
  'uni',
  'ulli',
  'nulli',
  'soli',
  'toti',
  'alteri',
  'utrique',
  'cuilibet',
  'alicui',
  'mihi',
  'tibi',
  'sibi',
]);

const ACCUSATIVE_SG_MODIFIERS = new Set([
  'hunc',
  'hanc',
  'quem',
  'quam',
  'eum',
  'eam',
  'eandem',
  'quendam',
  'quandam',
  'aliam',
  'alium',
  'ipsam',
  'illam',
  'istam',
  'unam',
  'nullam',
  'totam',
  'suam',
  'meam',
  'tuam',
]);

const SECTION_GUIDES: Record<ScholasticSectionType, { label: string; readingAdvice: string }> = {
  prooemium: {
    label: 'Prooemium (Prologue & Division of the Question)',
    readingAdvice:
      'In the Prooemium, St. Thomas outlines the order of inquiry and enumerates the specific articles ("Circa quae quaerenda sunt...") to be disputed in this Question.',
  },
  objection: {
    label: 'Obiectio / Argumentum (Initial Objection)',
    readingAdvice:
      'Introduced by "Ad N sic proceditur. Videtur quod..." or "Praeterea": this states a counter-argument against Thomas\'s thesis. Do not confuse an Objection with Thomas\'s own conclusion!',
  },
  sed_contra: {
    label: 'Sed Contra (Authority on the Contrary)',
    readingAdvice:
      'Introduced by "Sed contra est quod...": cites a concise scriptural, patristic, or philosophical principle pointing toward the affirmative or negative resolution of the question.',
  },
  corpus: {
    label: 'Respondeo / Corpus (Magistral Determination)',
    readingAdvice:
      'Introduced by "Respondeo dicendum quod...": this is the core of the article where St. Thomas draws his foundational distinctions and demonstrates the true resolution of the question.',
  },
  reply: {
    label: 'Responsio ad Obiecta (Reply to an Objection)',
    readingAdvice:
      'Introduced by "Ad primum/secundum ergo dicendum quod...": applies the principles established in the Corpus to resolve each initial objection by distinguishing ("secundum quid" vs. "simpliciter").',
  },
  other: {
    label: 'Scholastic Exposition / Treatise Text',
    readingAdvice:
      'Continuous philosophical or theological exposition by St. Thomas Aquinas. Watch for structural markers ("Primo... Secundo...", "Unde...", "Ex quo patet...").',
  },
};

export function detectGrammarConstructions(sentence: string): GrammarConstructionNote[] {
  const s = sentence.trim();
  const lower = s.toLowerCase();
  const notes: GrammarConstructionNote[] = [];

  if (/\b(videtur|dicendum|dicitur|sciendum|considerandum|manifestum\s+est|patet|sequitur|contingit|accidit)\s+(est\s+)?quod\b/i.test(s)) {
    notes.push({
      name: 'Scholastic Quod-Clause (Substantive Indirect Discourse)',
      trigger: 'videtur / dicendum / sciendum ... quod + Indicative or Subjunctive',
      explanation:
        'Whereas Classical Latin strongly prefers the Accusative + Infinitive after verbs of saying, thinking, or seeming, Ecclesiastical and Scholastic Latin frequently uses "quod" (or "quia") followed by the subjunctive (for reported/contested claims like "Videtur quod non sit...") or indicative (for asserted facts like "Respondeo dicendum quod necessarium fuit...").',
    });
  }

  if (/\b\w+nd(am|um|os|as|ae|is|i|o|a|us|orum|arum)\b/i.test(s)) {
    const NON_GERUND_ND = new Set([
      'secundum',
      'secundam',
      'secundos',
      'secundas',
      'mundum',
      'mundos',
      'quendam',
      'quandam',
      'quosdam',
      'quasdam',
      'eundem',
      'eandem',
      'eosdem',
      'easdem',
      'profundum',
      'iucundum',
      'fecundum',
    ]);
    const adGerundMatches = Array.from(s.matchAll(/\bad\s+(\w+nd(?:um|am|os|as))\b/gi));
    if (adGerundMatches.some((m) => !NON_GERUND_ND.has(m[1].toLowerCase()))) {
      notes.push({
        name: 'Ad + Accusative Gerund / Gerundive of Purpose',
        trigger: 'ad + -ndum / -ndam / -ndos / -ndas',
        explanation:
          'Expresses purpose ("in order to...", "for the sake of..."): e.g., "ad docendum, ad arguendum" ("for teaching, for reproving") or "ad ostendendam veritatem" ("for showing the truth").',
      });
    }
    if (/\b(dicendum|quaerenda|consideranda|considerandum|sciendum|inquirenda|suscipienda|exponenda)\b/i.test(s)) {
      notes.push({
        name: 'Gerundive of Obligation (Passive Periphrastic)',
        trigger: '-ndus, -nda, -ndum + (est / sunt / sint)',
        explanation:
          'Combines the future passive participle (gerundive) with a form of "sum" to express necessity or obligation: e.g., "Respondeo dicendum [est] quod..." ("I answer that it must be said that..."), "quaerenda sunt decem" ("ten things must be investigated").',
      });
    }
  }

  if (/\b(ut|ne)\s+[^.;,]+?\b\w+(tur|ntur|at|ant|et|ent|it|int|sit|sint|esset|essent|fiat|fiant|possit|possint)\b/i.test(s)) {
    notes.push({
      name: 'Subjunctive Purpose / Result Clause (Ut / Ne)',
      trigger: 'ut / ne + Subjunctive verb',
      explanation:
        'Introduces a purpose ("in order that...") or result ("so that...") clause with its verb in the subjunctive mood: e.g., "ut intentio nostra ... comprehendatur" ("in order that our intention may be encompassed within certain limits").',
    });
  }

  if (/\b(cum|licet|quamvis)\s+[^.;]+?\b(sit|sint|esset|essent|habeat|habeant|concedantur|possit|possint)\b/i.test(s)) {
    notes.push({
      name: 'Causal / Concessive Subjunctive Clause (Cum / Licet)',
      trigger: 'cum ("since/although") or licet ("even though") + Subjunctive',
      explanation:
        'In Scholastic Latin, "cum" + subjunctive expresses a logical reason ("since, inasmuch as"), while "licet" + subjunctive introduces a concession ("although, even though...") typically answered by "tamen" ("nevertheless") in the main clause.',
    });
  }

  if (/\b(inquantum|secundum\s+quod|prout|sub\s+ratione)\b/i.test(s)) {
    notes.push({
      name: 'Scholastic Reduplicative / Formal Specification',
      trigger: 'inquantum / secundum quod / prout / sub ratione',
      explanation:
        'A hallmark of Thomistic precision: specifies the exact formal aspect ("ratio formalis") under which a predicate belongs to a subject (e.g., considering creatures "inquantum referuntur ad Deum", insofar as they are ordered to God).',
    });
  }

  if (/\b(remota|existente|posito|posita|excluso|exclusa|habit[ao]|fact[ao]|cessante)\s+\w+/i.test(s)) {
    notes.push({
      name: 'Ablative Absolute',
      trigger: 'Participle + Noun in the Ablative case',
      explanation:
        'A self-contained participial phrase in the ablative case expressing an attendant circumstance, condition, or cause ("when/since/if X has been removed/posited..."): e.g., "remota enim ab homine differentia rationali" ("once the rational difference has been removed from man").',
    });
  }

  if (/\b(oportet|necesse\s+est|necessarium\s+fuit|necessarium\s+est|videtur|dicitur|manifestum\s+est)\b[^.]+?\b(esse|haberi|fieri|tradi|inveniri|cognosci|instru|tractare|tractari)\b/i.test(s)) {
    notes.push({
      name: 'Accusative + Infinitive / Complementary Infinitive',
      trigger: 'Subject Accusative + Infinitive (e.g., "sacram doctrinam esse scientiam")',
      explanation:
        'Indirect statement or impersonal complement where the subject of the infinitive stands in the Accusative case and the verb is an Infinitive: e.g., "Respondeo dicendum sacram doctrinam esse scientiam" ("I answer that sacred doctrine is a science") or "aliam doctrinam haberi" ("another doctrine to be had").',
    });
  }

  if (notes.length === 0 && lower.includes('est')) {
    notes.push({
      name: 'Scholastic Categorical Predication',
      trigger: 'Subject (Nominative) + Copula / Verb + Predicate',
      explanation:
        'Direct declarative predication in Scholastic Latin prose. Identify the nominative subject first, then the main finite verb, and finally any prepositional qualifications ("secundum...", "per...", "in...").',
    });
  }

  return notes;
}

export function analyzeWordInContext(
  rawWord: string,
  sentence: string,
  citation?: string,
  fullParagraph?: string,
  charOffsetInSentence?: number
): ContextualAnalysisResult {
  const wordAnalysis = analyzeWord(rawWord);
  const cleanTarget = wordAnalysis.normalizedWord;
  const tokens: Array<{ raw: string; clean: string; startOffset: number }> = [];
  for (const m of sentence.matchAll(/\S+/g)) {
    const raw = m[0];
    const clean = cleanLatinString(raw);
    if (clean.length > 0) {
      tokens.push({ raw, clean, startOffset: m.index ?? 0 });
    }
  }

  const targetIndices: number[] = [];
  tokens.forEach((t, idx) => {
    if (t.clean === cleanTarget) targetIndices.push(idx);
  });
  let targetIdx = targetIndices.length > 0 ? targetIndices[0] : -1;
  if (
    targetIndices.length > 1 &&
    typeof charOffsetInSentence === 'number' &&
    charOffsetInSentence >= 0
  ) {
    let bestDist = Infinity;
    for (const idx of targetIndices) {
      const dist = Math.abs(tokens[idx].startOffset - charOffsetInSentence);
      if (dist < bestDist) {
        bestDist = dist;
        targetIdx = idx;
      }
    }
  }

  // Contextual scoring over wordAnalysis.morphologicalParses
  const scoredParses = wordAnalysis.morphologicalParses.map((p) => ({
    parse: p,
    contextScore: p.score,
    reasons: [] as string[],
  }));

  if (targetIdx >= 0 && scoredParses.length > 0) {
    // Check preceding 1..3 tokens for prepositions or modifiers
    const prev1 = targetIdx >= 1 ? tokens[targetIdx - 1].clean : '';
    const prev2 = targetIdx >= 2 ? tokens[targetIdx - 2].clean : '';
    const prev3 = targetIdx >= 3 ? tokens[targetIdx - 3].clean : '';
    const next1 = targetIdx + 1 < tokens.length ? tokens[targetIdx + 1].clean : '';

    const nearbyPreps = [prev1, prev2, prev3].filter(
      (w) => ABLATIVE_PREPS.has(w) || ACCUSATIVE_PREPS.has(w) || DUAL_CASE_PREPS.has(w)
    );
    const activePrep = nearbyPreps[0];

    for (const item of scoredParses) {
      const p = item.parse;

      // 1. Preposition governance
      if (activePrep && (p.rawPos === 'N' || p.rawPos === 'ADJ' || p.rawPos === 'PRON' || p.rawPos === 'VPAR')) {
        if (ABLATIVE_PREPS.has(activePrep) && p.case === 'Ablative') {
          item.contextScore += 80;
          item.reasons.push(
            `Governed by the preposition "${activePrep}" (+ Ablative case) in "${activePrep} ... ${rawWord}"`
          );
        } else if (ACCUSATIVE_PREPS.has(activePrep) && p.case === 'Accusative') {
          item.contextScore += 80;
          item.reasons.push(
            `Governed by the preposition "${activePrep}" (+ Accusative case) in "${activePrep} ... ${rawWord}"`
          );
        } else if (DUAL_CASE_PREPS.has(activePrep)) {
          if (p.case === 'Ablative' || p.case === 'Accusative') {
            item.contextScore += 50;
            item.reasons.push(
              `Follows the preposition "${activePrep}" (governing ${p.case} in this phrase)`
            );
          }
        }
      }

      // 2. Modifier agreement (e.g., huius doctrinae -> Genitive Singular)
      if (
        (GENITIVE_SG_MODIFIERS.has(prev1) || GENITIVE_SG_MODIFIERS.has(next1)) &&
        p.case === 'Genitive' &&
        p.number === 'Singular'
      ) {
        const mod = GENITIVE_SG_MODIFIERS.has(prev1) ? prev1 : next1;
        item.contextScore += 75;
        item.reasons.push(
          `Agrees with the Genitive Singular determiner "${mod}" in "${prev1 === mod ? `${mod} ${rawWord}` : `${rawWord} ${mod}`}"`
        );
      }

      if (
        (DATIVE_SG_MODIFIERS.has(prev1) || DATIVE_SG_MODIFIERS.has(next1)) &&
        p.case === 'Dative' &&
        p.number === 'Singular'
      ) {
        const mod = DATIVE_SG_MODIFIERS.has(prev1) ? prev1 : next1;
        item.contextScore += 70;
        item.reasons.push(`Agrees with the Dative Singular pronoun/determiner "${mod}"`);
      }

      if (
        (ACCUSATIVE_SG_MODIFIERS.has(prev1) || ACCUSATIVE_SG_MODIFIERS.has(next1)) &&
        p.case === 'Accusative' &&
        p.number === 'Singular'
      ) {
        const mod = ACCUSATIVE_SG_MODIFIERS.has(prev1) ? prev1 : next1;
        item.contextScore += 70;
        item.reasons.push(`Agrees in case and number with the Accusative Singular modifier "${mod}"`);
      }

      // 3. Subjunctive in quod/ut/ne/cum/licet/utrum clauses
      if (p.rawPos === 'V' && p.mood === 'Subjunctive') {
        if (/\b(videtur\s+quod|utrum|ut|ne|licet|quamvis|cum)\b/i.test(sentence)) {
          item.contextScore += 45;
          item.reasons.push(
            'Subjunctive mood required by the subordinate clause ("videtur quod / utrum / ut / licet / cum") in this sentence'
          );
        }
      }

      // 4. Gerundive of obligation after Respondeo / est / sunt
      if (p.pos.includes('Gerundive') && (prev1 === 'respondeo' || next1 === 'quod' || next1 === 'est' || next1 === 'sunt')) {
        item.contextScore += 65;
        item.reasons.push(
          'Functions as a Scholastic Gerundive of Obligation (passive periphrastic with implicit/explicit "est/sunt")'
        );
      }

      // 5. Complementary / Subjective Infinitive after impersonal or modal expressions (BUG-05: "necessarium est primo investigare")
      if (p.rawPos === 'V' && p.mood === 'Infinitive') {
        if (
          /\b(necessarium|necesse|oportet|convenit|decet|licet|potest|possunt|possit|possint|debet|debent|debeat|videtur|dicitur|contingit|manifestum\s+est|patet|intendit|incipit|vult|voluit)\b/i.test(
            sentence
          )
        ) {
          item.contextScore += 75;
          item.reasons.push(
            'Complementary / Subjective Infinitive governed by the modal or impersonal verb in this clause'
          );
        }
      }
    }
  }

  scoredParses.sort((a, b) => b.contextScore - a.contextScore);
  const best = scoredParses[0];
  const selectedParse = best?.parse;

  const disambiguationReason =
    best && best.reasons.length > 0
      ? best.reasons.join('; ')
      : selectedParse
      ? `Identified as ${selectedParse.formExplanation} of ${selectedParse.headword} based on morphological inflection and Scholastic usage frequency.`
      : `Analyzed as ${wordAnalysis.partOfSpeech} (${wordAnalysis.headword}) in Scholastic Latin context.`;

  const sectionType = classifyScholasticSection(citation || '', sentence);
  const guideMeta = SECTION_GUIDES[sectionType];
  const scholasticSectionGuide: ScholasticSectionGuide = {
    sectionType,
    label: guideMeta.label,
    readingAdvice: guideMeta.readingAdvice,
  };

  const grammarConstructions = detectGrammarConstructions(sentence);
  const sentenceTranslation = translateLatinSentence(sentence, citation, fullParagraph);

  // Build literal vs contextual interpretation for the selected word
  const literalSense =
    wordAnalysis.classicalMeaning ||
    selectedParse?.entry.senses ||
    wordAnalysis.ecclesiasticalMeaning;

  const baseContextual = wordAnalysis.ecclesiasticalMeaning || selectedParse?.entry.senses || rawWord;
  const contextualMeaning =
    wordAnalysis.isThomisticKeyTerm || baseContextual !== selectedParse?.entry.senses
      ? baseContextual
      : selectedParse
      ? `${baseContextual} (${selectedParse.formExplanation})`
      : baseContextual;

  const nuanceExplanation = wordAnalysis.isThomisticKeyTerm
    ? `In Thomas Aquinas (${citation || 'Scholastic context'}), "${rawWord}" (${wordAnalysis.headword}) carries its technical Thomistic/Ecclesiastical sense: ${wordAnalysis.ecclesiasticalMeaning} ${wordAnalysis.thomisticNote || ''}`.trim()
    : cleanTarget.startsWith('salut')
    ? `In Christian and Thomistic theology ("ad humanam salutem"), "salus, salutis" specifically means eternal spiritual salvation in God (beatitude), whereas in Classical Latin it meant physical health, safety, or a greeting.`
    : selectedParse
    ? `Here "${rawWord}" stands in the ${selectedParse.formExplanation} (${disambiguationReason}). Literal lexical sense: "${literalSense.split(';')[0]}"; in this clause it functions to express: "${contextualMeaning.split(';')[0]}".`
    : `Used here in ${guideMeta.label} with the sense: ${contextualMeaning}.`;

  return {
    wordAnalysis,
    selectedParse,
    disambiguationReason,
    contextualMeaning,
    literalVsContextual: {
      literal: literalSense,
      contextual: contextualMeaning,
      nuanceExplanation,
    },
    grammarConstructions,
    scholasticSectionGuide,
    sentenceTranslation,
  };
}
