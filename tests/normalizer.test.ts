import { describe, it, expect } from 'vitest';
import {
  normalizeLatinWord,
  generateOrthographicVariants,
  extractParagraphCitationAndText,
  splitIntoSentences,
  findContainingSentence,
} from '../src/core/normalizer';

describe('Task 3: Latin Orthographic Normalizer, Enclitic Splitter & Sentence Tokenizer', () => {
  it('normalizes punctuation, case, ligatures, and j/v variants', () => {
    const res1 = normalizeLatinWord('«Quaestio»');
    expect(res1.clean).toBe('quaestio');

    const res2 = normalizeLatinWord('Iustitia,');
    expect(res2.clean).toBe('iustitia');

    const res3 = normalizeLatinWord('cælestis');
    expect(res3.clean).toBe('caelestis');
  });

  it('recognizes Scholastic fused compounds (inquantum, idest, seipso, intantum)', () => {
    const inq = normalizeLatinWord('inquantum');
    expect(inq.compoundParts).toEqual(['in', 'quantum']);

    const idest = normalizeLatinWord('idest');
    expect(idest.compoundParts).toEqual(['id', 'est']);

    const seipso = normalizeLatinWord('seipso');
    expect(seipso.compoundParts).toEqual(['se', 'ipso']);

    const intantum = normalizeLatinWord('intantum');
    expect(intantum.compoundParts).toEqual(['in', 'tantum']);
  });

  it('splits true enclitics (-que, -ne, -ve, -cum) while preserving non-enclitic words', () => {
    const deoque = normalizeLatinWord('Deoque');
    expect(deoque.baseWord).toBe('deo');
    expect(deoque.enclitic?.particle).toBe('que');

    const secum = normalizeLatinWord('secum');
    expect(secum.baseWord).toBe('se');
    expect(secum.enclitic?.particle).toBe('cum');

    // Words that naturally end in -que or -ne or -ve must NOT be stripped as enclitics
    for (const nonEnclitic of [
      'atque',
      'itaque',
      'ubique',
      'quinque',
      'utrumque',
      'quaecumque',
      'denique',
      'quousque',
      'quandoque',
      'utrobique',
      'usquequaque',
      'oblique',
      'adaeque',
      'ratione',
      'homine',
      'fine',
      'ordine',
      'sine',
      'active',
      'abstractive',
    ]) {
      const parsed = normalizeLatinWord(nonEnclitic);
      expect(parsed.enclitic, `Should not strip enclitic from ${nonEnclitic}`).toBeUndefined();
      expect(parsed.baseWord).toBe(nonEnclitic);
    }
  });

  it('generates medieval and Ecclesiastical orthographic variants', () => {
    const cond = generateOrthographicVariants('condicio');
    expect(cond).toContain('condicio');
    expect(cond).toContain('conditio');

    const quat = generateOrthographicVariants('quatuor');
    expect(quat).toContain('quattuor');
  });

  it('extracts Corpus Thomisticum citation and classifies Scholastic section type', () => {
    const raw =
      '[28236] Iª q. 1 a. 1 co. Respondeo dicendum quod necessarium fuit ad humanam salutem, esse doctrinam quandam secundum revelationem divinam.';
    const extracted = extractParagraphCitationAndText(raw, 'I q. 1 a. 1 co.');
    expect(extracted.citation).toBe('I q. 1 a. 1 co.');
    expect(extracted.corpusId).toBe('28236');
    expect(extracted.sectionType).toBe('corpus');
    expect(extracted.cleanText.startsWith('Respondeo dicendum quod')).toBe(true);

    const obj = extractParagraphCitationAndText('[28233] Iª q. 1 a. 1 arg. 1 Ad primum sic proceditur.', 'I q. 1 a. 1 arg. 1');
    expect(obj.sectionType).toBe('objection');

    const sc = extractParagraphCitationAndText('[28235] Iª q. 1 a. 1 s. c. Sed contra est quod dicitur.', 'I q. 1 a. 1 s. c.');
    expect(sc.sectionType).toBe('sed_contra');

    const ad = extractParagraphCitationAndText('[28237] Iª q. 1 a. 1 ad 1 Ad primum ergo dicendum.', 'I q. 1 a. 1 ad 1');
    expect(ad.sectionType).toBe('reply');
  });

  it('strips [1] Super Sent., pr. reference prefix from Prooemium text without swallowing the opening sentence', () => {
    const prooemiumRaw =
      '[1] Super Sent., pr. Ego sapientia effudi flumina: ego quasi trames aquae immensae defluo.';
    const prooemium = extractParagraphCitationAndText(prooemiumRaw, 'Super Sent., pr.');
    expect(prooemium.citation).toBe('Super Sent., pr.');
    expect(prooemium.sectionType).toBe('prooemium');
    expect(prooemium.cleanText).toBe(
      'Ego sapientia effudi flumina: ego quasi trames aquae immensae defluo.'
    );

    // DEF-005: Complex Super Sent. citations with s. c. 2, qc. 1, etc. must strip completely
    const sentSc2Raw =
      '[90] Super Sent., lib. 1 d. 1 q. 1 a. 2 s. c. 2 Praeterea, omnis virtus vel est theologica, vel cardinalis.';
    const sentSc2 = extractParagraphCitationAndText(
      sentSc2Raw,
      'Super Sent., lib. 1 d. 1 q. 1 a. 2 s. c. 2'
    );
    expect(sentSc2.corpusId).toBe('90');
    expect(sentSc2.citation).toBe('Super Sent., lib. 1 d. 1 q. 1 a. 2 s. c. 2');
    expect(sentSc2.sectionType).toBe('sed_contra');
    expect(sentSc2.cleanText).toBe(
      'Praeterea, omnis virtus vel est theologica, vel cardinalis.'
    );

    const sentQcRaw =
      '[25] Super Sent., q. 1 a. 3 qc. 2 ad 1 Ad primum ergo dicendum, quod sacra doctrina est una scientia.';
    const sentQc = extractParagraphCitationAndText(sentQcRaw);
    expect(sentQc.corpusId).toBe('25');
    expect(sentQc.citation).toBe('Super Sent., q. 1 a. 3 qc. 2 ad 1');
    expect(sentQc.sectionType).toBe('reply');
    expect(sentQc.cleanText).toBe(
      'Ad primum ergo dicendum, quod sacra doctrina est una scientia.'
    );
  });

  it('splits Scholastic paragraphs into sentences without breaking on abbreviations or Roman numerals', () => {
    const paragraph =
      '[28233] Iª q. 1 a. 1 arg. 1 Ad primum sic proceditur. Videtur quod non sit necessarium, praeter philosophicas disciplinas, aliam doctrinam haberi. Ad ea enim quae supra rationem sunt, homo non debet conari, secundum illud Eccli. III, altiora te ne quaesieris. Sed ea quae rationi subduntur, sufficienter traduntur in philosophicis disciplinis. Superfluum igitur videtur, praeter philosophicas disciplinas, aliam doctrinam haberi.';
    const { cleanText } = extractParagraphCitationAndText(paragraph, 'I q. 1 a. 1 arg. 1');
    const sentences = splitIntoSentences(cleanText);
    expect(sentences).toHaveLength(5);
    expect(sentences[2]).toContain('secundum illud Eccli. III, altiora te ne quaesieris.');

    const offset = cleanText.indexOf('quaesieris');
    const found = findContainingSentence(paragraph, offset, 'I q. 1 a. 1 arg. 1');
    expect(found.sentence).toBe(
      'Ad ea enim quae supra rationem sunt, homo non debet conari, secundum illud Eccli. III, altiora te ne quaesieris.'
    );
    expect(found.sectionType).toBe('objection');
  });
});
