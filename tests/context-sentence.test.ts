import { describe, it, expect } from 'vitest';
import { analyzeWordInContext } from '../src/core/context-analyzer';

describe('Task 5: Context-Aware Scholastic Sentence Analyzer, Grammar Assistant & Sentence Translator', () => {
  it('disambiguates case using governing prepositions (e.g., de ente, praeter philosophicas disciplinas)', () => {
    const sentence1 =
      'Praeterea, doctrina non potest esse nisi de ente, nihil enim scitur nisi verum, quod cum ente convertitur.';
    const resEnte = analyzeWordInContext('ente', sentence1, 'I q. 1 a. 1 arg. 2');
    expect(resEnte.selectedParse?.case).toBe('Ablative');
    expect(resEnte.selectedParse?.number).toBe('Singular');
    expect(resEnte.disambiguationReason.toLowerCase()).toContain('preposition');
    expect(resEnte.contextualMeaning.toLowerCase()).toContain('being');

    const sentence2 =
      'Videtur quod non sit necessarium, praeter philosophicas disciplinas, aliam doctrinam haberi.';
    const resDisciplinas = analyzeWordInContext('disciplinas', sentence2, 'I q. 1 a. 1 arg. 1');
    expect(resDisciplinas.selectedParse?.case).toBe('Accusative');
    expect(resDisciplinas.selectedParse?.number).toBe('Plural');
    expect(resDisciplinas.disambiguationReason).toContain('praeter');
  });

  it('disambiguates ambiguous -ae endings via modifier agreement (huius doctrinae -> Genitive Singular)', () => {
    const sentence = 'Primo, de necessitate huius doctrinae.';
    const res = analyzeWordInContext('doctrinae', sentence, 'I q. 1 a. 1 pr.');
    expect(res.selectedParse?.case).toBe('Genitive');
    expect(res.selectedParse?.number).toBe('Singular');
    expect(res.disambiguationReason).toContain('huius');
  });

  it('detects Scholastic grammatical constructions (quod + subjunctive, gerundive of obligation, ad + gerund, ablative absolute)', () => {
    const s1 = 'Videtur quod non sit necessarium, praeter philosophicas disciplinas, aliam doctrinam haberi.';
    const r1 = analyzeWordInContext('sit', s1, 'I q. 1 a. 1 arg. 1');
    expect(r1.grammarConstructions.some((g) => g.name.includes('Quod') || g.name.includes('Subjunctive'))).toBe(true);
    expect(r1.scholasticSectionGuide.sectionType).toBe('objection');

    const s2 =
      'Respondeo dicendum quod necessarium fuit ad humanam salutem, esse doctrinam quandam secundum revelationem divinam.';
    const r2 = analyzeWordInContext('dicendum', s2, 'I q. 1 a. 1 co.');
    expect(r2.grammarConstructions.some((g) => g.name.includes('Gerundive') || g.name.includes('Respondeo'))).toBe(true);
    expect(r2.scholasticSectionGuide.sectionType).toBe('corpus');

    const s3 =
      'Omnis Scriptura divinitus inspirata utilis est ad docendum, ad arguendum, ad corripiendum.';
    const r3 = analyzeWordInContext('docendum', s3, 'I q. 1 a. 1 s. c.');
    expect(r3.grammarConstructions.some((g) => g.name.includes('Gerund'))).toBe(true);

    // DEF-007: Positive match on feminine -ndam gerundive ("Ad ostendendam veritatem") and negative exclusion of ordinal "ad secundum"
    const sGerundiveFem = 'Ad ostendendam veritatem procedit.';
    const rGerundiveFem = analyzeWordInContext('ostendendam', sGerundiveFem, 'Contra Gentiles, lib. 1 cap. 2');
    expect(
      rGerundiveFem.grammarConstructions.some((g) => g.name.includes('Ad + Accusative Gerund'))
    ).toBe(true);

    const sOrdinal = 'Et sic ad secundum patet responsio.';
    const rOrdinal = analyzeWordInContext('secundum', sOrdinal, 'I q. 1 a. 2 ad 2');
    expect(
      rOrdinal.grammarConstructions.some((g) => g.name.includes('Ad + Accusative Gerund'))
    ).toBe(false);
  });

  it('DEF-018: disambiguates repeated words in the same sentence using the clicked occurrence offset rather than always the first occurrence', () => {
    const sentence =
      'Praeterea, doctrina non potest esse nisi de ente, nihil enim scitur nisi verum, quod cum ente convertitur.';
    const firstIdx = sentence.indexOf('de ente') + 3;
    const secondIdx = sentence.indexOf('cum ente') + 4;

    const resFirst = analyzeWordInContext('ente', sentence, 'I q. 1 a. 1 arg. 2', sentence, firstIdx);
    expect(resFirst.disambiguationReason).toContain('"de"');

    const resSecond = analyzeWordInContext('ente', sentence, 'I q. 1 a. 1 arg. 2', sentence, secondIdx);
    expect(resSecond.disambiguationReason).toContain('"cum"');
  });

  it('distinguishes literal translation vs. contextual interpretation and provides interlinear + reference sentence translations', () => {
    const sentence =
      'Respondeo dicendum quod necessarium fuit ad humanam salutem, esse doctrinam quandam secundum revelationem divinam, praeter philosophicas disciplinas, quae ratione humana investigantur.';
    const res = analyzeWordInContext('salutem', sentence, 'I q. 1 a. 1 co.');

    expect(res.literalVsContextual.literal).toBeTruthy();
    expect(res.literalVsContextual.contextual).toBeTruthy();
    expect(res.literalVsContextual.nuanceExplanation).toContain('salvation');

    expect(res.sentenceTranslation.interlinearGloss.length).toBeGreaterThan(10);
    expect(res.sentenceTranslation.literalTranslation).toBeTruthy();
    expect(res.sentenceTranslation.contextualTranslation).toBeTruthy();
    expect(res.sentenceTranslation.referenceTranslation).toContain('It was necessary for man\'s salvation');
    expect(res.sentenceTranslation.contextualTranslation).toBe(res.sentenceTranslation.referenceTranslation);
  });

  it('never outputs "Latin term in Corpus Thomisticum" for unknown tokens, falls back to raw Latin / lowercase proper names, and does not claim a fluent sentence translation without a reference', () => {
    const sentence = 'Ego sapientia effudi flumina: ego quasi trames aquae immensae defluo.';
    const res = analyzeWordInContext('sapientia', sentence, 'Super Sent., pr.');
    const joined = res.sentenceTranslation.interlinearGloss.map((t) => t.gloss).join(' ');
    expect(joined).not.toContain('Latin term in Corpus Thomisticum');
    expect(joined).toContain('Wisdom');
    expect(joined).toContain('rivers / torrents / streams');

    const fluviusRes = analyzeWordInContext('fluvius', 'ego quasi fluvius Dorix.', 'Unknown Work, q. 99');
    expect(fluviusRes.sentenceTranslation.interlinearGloss.map((t) => t.gloss)).toContain('Dorix');
    expect(fluviusRes.sentenceTranslation.contextualTranslation).toBe('');
  });

  it('never outputs "Thomistic technical term" in interlinear glosses and accurately glosses snp1001.html sentences (Finito prooemio, operis, Magister, tradere, Secunda, dividitur, utendum)', () => {
    const s1 =
      'Finito prooemio, hoc est initium praesentis operis in quo Magister divinorum nobis doctrinam tradere intendit quantum ad inquisitionem veritatis et destructionem erroris: unde et argumentativo modo procedit.';
    const s2 =
      'Et in duas partes dividitur. Secunda ibi: hic considerandum est utrum virtutibus sit utendum, an fruendum. Ea autem de quibus in hac doctrina considerandum est, cadunt in considerationem.';

    const r1 = analyzeWordInContext('operis', s1, 'I Sent., d. 1 div.');
    const r2 = analyzeWordInContext('partes', s2, 'I Sent., d. 1 div.');

    const allGlosses = [
      ...r1.sentenceTranslation.interlinearGloss,
      ...r2.sentenceTranslation.interlinearGloss,
    ];

    for (const item of allGlosses) {
      expect(
        item.gloss.toLowerCase(),
        `Token "${item.word}" had placeholder gloss "${item.gloss}"`
      ).not.toContain('thomistic technical term');
      expect(item.gloss.toLowerCase()).not.toContain('technical scholastic');
      expect(item.gloss).not.toContain('divideed');
      expect(item.gloss).not.toContain('hand overed');
    }

    const byWord = Object.fromEntries(allGlosses.map((g) => [g.word.replace(/[,:.]/g, '').toLowerCase(), g]));
    expect(byWord['operis'].gloss.toLowerCase()).toContain('work');
    expect(byWord['magister'].gloss.toLowerCase()).toMatch(/master|teacher/);
    expect(byWord['tradere'].morphShort).toContain('inf.');
    expect(byWord['secunda'].gloss.toLowerCase()).toContain('second');
    expect(byWord['partes'].gloss.toLowerCase()).toContain('part');
    expect(byWord['dividitur'].gloss.toLowerCase()).toContain('divided');
    expect(byWord['utendum'].gloss.toLowerCase()).toContain('use');
  });
});
