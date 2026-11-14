import { describe, it, expect } from 'vitest';
import { analyzeWord } from '../src/core/dictionaries';

describe('Task 4: Morphological Analyzer & Multi-Dictionary Lexical Engine', () => {
  it('accurately parses nouns, verbs, comparatives, and participles from Summa Theologiae I q. 1', () => {
    const doctrinam = analyzeWord('doctrinam');
    expect(doctrinam.primaryLemma).toContain('doctrina');
    expect(doctrinam.partOfSpeech).toContain('Noun');
    expect(doctrinam.morphologicalParses.some((p) => p.case === 'Accusative' && p.number === 'Singular')).toBe(true);

    const investigantur = analyzeWord('investigantur');
    expect(investigantur.primaryLemma).toContain('investigo');
    expect(
      investigantur.morphologicalParses.some(
        (p) =>
          p.tense === 'Present' &&
          p.voice === 'Passive' &&
          p.mood === 'Indicative' &&
          p.person === '3rd' &&
          p.number === 'Plural'
      )
    ).toBe(true);

    const comprehendatur = analyzeWord('comprehendatur');
    expect(comprehendatur.primaryLemma).toContain('comprehendo');
    expect(
      comprehendatur.morphologicalParses.some(
        (p) =>
          p.tense === 'Present' &&
          p.voice === 'Passive' &&
          p.mood === 'Subjunctive' &&
          p.person === '3rd' &&
          p.number === 'Singular'
      )
    ).toBe(true);

    const altiora = analyzeWord('altiora');
    expect(altiora.morphologicalParses.some((p) => p.degree === 'Comparative' && p.number === 'Plural')).toBe(true);

    const entibus = analyzeWord('entibus');
    expect(entibus.primaryLemma).toContain('ens');
    expect(
      entibus.morphologicalParses.some(
        (p) => (p.case === 'Ablative' || p.case === 'Dative') && p.number === 'Plural'
      )
    ).toBe(true);
  });

  it('handles syncopated perfect forms such as quaesieris (quaesiveris) and irregular verbs (esset, fuit, est)', () => {
    const quaesieris = analyzeWord('quaesieris');
    expect(quaesieris.primaryLemma).toContain('quaero');
    expect(quaesieris.morphologicalParses.length).toBeGreaterThan(0);

    const esset = analyzeWord('esset');
    expect(esset.primaryLemma).toContain('sum');
    expect(
      esset.morphologicalParses.some((p) => p.tense === 'Imperfect' && p.mood === 'Subjunctive')
    ).toBe(true);

    for (const copula of ['sum', 'est', 'sit', 'sunt']) {
      const res = analyzeWord(copula);
      expect(res.primaryLemma).toBe('sum');
      expect(res.ecclesiasticalMeaning.toLowerCase()).not.toContain('take up');
    }
  });

  it('prioritizes Ecclesiastical and Thomistic meanings over strictly Classical meanings', () => {
    const sac = analyzeWord('sacramentum');
    expect(sac.isThomisticKeyTerm).toBe(true);
    expect(sac.ecclesiasticalMeaning.toLowerCase()).toContain('sacrament');
    expect(sac.classicalMeaning?.toLowerCase()).toContain('oath');

    const gratia = analyzeWord('gratia');
    expect(gratia.isThomisticKeyTerm).toBe(true);
    expect(gratia.ecclesiasticalMeaning.toLowerCase()).toContain('grace');
    expect(gratia.thomisticNote).toContain('Gratia non tollit naturam');
  });

  it('provides specialized Thomistic philosophical context and multi-dictionary sources for actus, potentia, essentia, substantia, accidens', () => {
    for (const term of ['actus', 'potentia', 'essentia', 'substantia', 'accidens']) {
      const res = analyzeWord(term);
      expect(res.isThomisticKeyTerm, `${term} should be marked Thomistic key term`).toBe(true);
      expect(res.thomisticNote, `${term} should have a Thomistic note`).toBeTruthy();
      const sources = res.dictionaryEntries.map((d) => d.source);
      expect(sources).toContain('Thomistic Lexicon');
      expect(sources).toContain('Ecclesiastical Latin Dictionary');
      expect(sources).toContain('Wiktionary');
      expect(sources).toContain('Lewis & Short');
      expect(sources).toContain("Whitaker's Words");
    }
  });

  it('includes Wiktionary, Ecclesiastical Latin Dictionary, Lewis & Short, and Whitaker entries even for non-curated words like veritas or flumina', () => {
    const veritas = analyzeWord('veritas');
    const vSources = veritas.dictionaryEntries.map((d) => d.source);
    expect(vSources).toContain('Ecclesiastical Latin Dictionary');
    expect(vSources).toContain('Wiktionary');
    expect(vSources).toContain('Lewis & Short');
    expect(vSources).toContain("Whitaker's Words");

    const flumina = analyzeWord('flumina');
    const fSources = flumina.dictionaryEntries.map((d) => d.source);
    expect(fSources).toContain('Lewis & Short');
    expect(fSources).toContain('Wiktionary');
    expect(fSources).toContain("Whitaker's Words");

    // M2: Never emit duplicate source badges (at most 1 entry per dictionary source)
    const scientia = analyzeWord('scientia');
    const sciSources = scientia.dictionaryEntries.map((d) => d.source);
    expect(new Set(sciSources).size).toBe(sciSources.length);
  });

  it('analyzes Scholastic compounds and enclitic words (inquantum, Deoque)', () => {
    const inq = analyzeWord('inquantum');
    expect(inq.compoundBreakdown).toBeDefined();
    expect(inq.ecclesiasticalMeaning.toLowerCase()).toContain('insofar as');

    const deoque = analyzeWord('Deoque');
    expect(deoque.enclitic?.particle).toBe('que');
    expect(deoque.primaryLemma.toLowerCase()).toContain('deus');
  });

  it('prioritizes 1st-declension abstract nouns in -ia (such as sapientia, scientia, potentia, essentia) over neuter plural participles', () => {
    const sapientia = analyzeWord('sapientia');
    expect(sapientia.primaryLemma).toBe('sapientia');
    expect(sapientia.partOfSpeech).toContain('Noun');
    expect(sapientia.morphologicalParses[0].rawPos).toBe('N');
    expect(sapientia.morphologicalParses[0].number).toBe('Singular');
  });

  it('DEF-004 & DEF-006: parses uterque family (uterque, utraque, utrumque, utriusque, utrique) with >=2 dictionary sources and preserves denique/quousque/quandoque lemmas', () => {
    for (const form of ['uterque', 'utraque', 'utrumque', 'utriusque', 'utrique', 'utroque']) {
      const res = analyzeWord(form);
      expect(res.primaryLemma, `Expected uterque lemma for ${form}`).toBe('uterque');
      expect(res.partOfSpeech, `Expected Pronoun/Adjective POS for ${form}`).not.toBe('Latin Word');
      expect(res.dictionaryEntries.length, `Expected >=2 dictionary sources for ${form}`).toBeGreaterThanOrEqual(2);
      expect(res.ecclesiasticalMeaning.toLowerCase()).not.toBe(form);
      expect(res.ecclesiasticalMeaning.toLowerCase()).toMatch(/each|both/);
    }

    const denique = analyzeWord('denique');
    expect(denique.primaryLemma).toBe('denique');
    expect(denique.headword).not.toBe('decem');
    expect(denique.enclitic).toBeUndefined();
    expect(denique.ecclesiasticalMeaning.toLowerCase()).toMatch(/finally|at last|in short/);

    const quousque = analyzeWord('quousque');
    expect(quousque.primaryLemma).toBe('quousque');
    expect(quousque.partOfSpeech).not.toBe('Latin Word');
    expect(quousque.enclitic).toBeUndefined();
    expect(quousque.ecclesiasticalMeaning.toLowerCase()).toMatch(/how long|how far|until/);

    const quandoque = analyzeWord('quandoque');
    expect(quandoque.primaryLemma).toBe('quandoque');
    expect(quandoque.enclitic).toBeUndefined();
    expect(quandoque.ecclesiasticalMeaning.toLowerCase()).toMatch(/sometimes|at some time|whenever/);
  });

  it('NEW-002: reconstructs accurate lemmas and headwords for -er consonant-stem adjectives (noster, sacer, pulcher, miser) and 3rd-declension -is adjectives without spurious -us', () => {
    for (const [form, expectedLemma, expectedHeadwordPrefix] of [
      ['noster', 'noster', 'noster, nostr'],
      ['nostra', 'noster', 'noster, nostr'],
      ['sacer', 'sacer', 'sacer, sacr'],
      ['sacram', 'sacer', 'sacer, sacr'],
      ['pulcher', 'pulcher', 'pulcher, pulchr'],
      ['miser', 'miser', 'miser, miser'],
    ] as const) {
      const res = analyzeWord(form);
      expect(res.primaryLemma, `Wrong lemma for ${form}`).toBe(expectedLemma);
      expect(res.primaryLemma).not.toBe(`${expectedLemma}us`);
      expect(res.headword).toContain(expectedHeadwordPrefix);
    }

    for (const [form, expectedLemma] of [
      ['naturalis', 'naturalis'],
      ['naturale', 'naturalis'],
      ['formalis', 'formalis'],
      ['possibilis', 'possibilis'],
      ['similis', 'similis'],
    ] as const) {
      const res = analyzeWord(form);
      expect(res.primaryLemma, `Wrong lemma for ${form}`).toBe(expectedLemma);
    }
  });
});
