import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../src/data');

describe('Task 2: Multi-Source Lexical, Thomistic & Parallel Translation Data Pipeline', () => {
  it('compiles Whitaker Words dictionary entries, stems, uniques, and inflections', () => {
    const dictPath = path.join(DATA_DIR, 'whitaker-dict.json');
    const inflectsPath = path.join(DATA_DIR, 'whitaker-inflects.json');
    expect(fs.existsSync(dictPath)).toBe(true);
    expect(fs.existsSync(inflectsPath)).toBe(true);

    const dict = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
    const inflects = JSON.parse(fs.readFileSync(inflectsPath, 'utf-8'));

    expect(dict.entries.length).toBeGreaterThan(35000);
    expect(Object.keys(dict.uniques).length).toBeGreaterThan(50);
    expect(inflects.rules.length).toBeGreaterThan(1500);
  });

  it('compiles Thomistic & Ecclesiastical Lexicon with Classical vs. Thomistic contrasts and Thomas-Lexikon entries', () => {
    const lexPath = path.join(DATA_DIR, 'thomistic-lexicon.json');
    expect(fs.existsSync(lexPath)).toBe(true);
    const lex = JSON.parse(fs.readFileSync(lexPath, 'utf-8'));

    expect(Object.keys(lex.entries).length).toBeGreaterThan(1000);

    for (const term of ['actus', 'potentia', 'essentia', 'substantia', 'accidens', 'doctrina', 'gratia', 'sacramentum']) {
      expect(lex.entries[term], `Missing Thomistic lexicon entry for ${term}`).toBeDefined();
      expect(lex.entries[term].thomisticMeaning).toBeTruthy();
      expect(lex.entries[term].classicalMeaning).toBeTruthy();
    }
  });

  it('compiles Lewis & Short dictionary core entries', () => {
    const lsPath = path.join(DATA_DIR, 'lewis-short-core.json');
    expect(fs.existsSync(lsPath)).toBe(true);
    const ls = JSON.parse(fs.readFileSync(lsPath, 'utf-8'));
    expect(Object.keys(ls.entries).length).toBeGreaterThan(2000);
    expect(ls.entries['scientia'] || ls.entries['doctrina']).toBeTruthy();
  });

  it('compiles Summa Theologiae parallel English reference index keyed by Corpus Thomisticum TITLE citations', () => {
    const summaPath = path.join(DATA_DIR, 'summa-english.json');
    expect(fs.existsSync(summaPath)).toBe(true);
    const summa = JSON.parse(fs.readFileSync(summaPath, 'utf-8'));

    expect(summa.sections['I q. 1 a. 1 co.']).toContain('It was necessary for man\'s salvation');
    expect(summa.sections['I q. 1 a. 1 arg. 1']).toContain('besides philosophical science');
    expect(summa.sections['I q. 1 a. 1 s. c.']).toContain('All Scripture, inspired of God');
    expect(summa.sections['I q. 1 a. 1 ad 1']).toContain('beyond man\'s knowledge');
    // General Prologue (sth0000.html), Question Prologues (I q. 1 pr.), and Super Sent., pr. (snp0000.html)
    expect(summa.sections['Summa theologiae, pr.']).toContain('Catholic truth');
    expect(summa.sections['I q. 1 pr.']).toContain('To place our purpose within proper limits');
    expect(summa.sections['I q. 2 pr.']).toContain('chief aim of sacred doctrine');
    expect(summa.sections['Super Sent., pr.'].toLowerCase()).toContain('poured out rivers');

    // Commentary on the Sentences (Scriptum super Sententiis — Prologue Q.1 + Books I, II, III, IV)
    expect(summa.sections['Super Sent., q. 1 pr.']).toContain('The Master puts a prologue');
    expect(summa.sections['Super Sent., q. 1 a. 1 co.']).toContain('contemplation of God');
    expect(summa.sections['Super Sent., q. 1 a. 5 co.']).toContain('fourfold way of interpreting Sacred Scripture');
    expect(summa.sections['Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 1']).toContain('act of the intellect');
    expect(summa.sections['Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 1']).not.toContain('essential differences of action');
    expect(summa.sections['Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 2']).toContain('vision is the whole reward');
    expect(summa.sections['Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 2']).not.toContain('nourishment');
    expect(summa.sections['Super Sent., lib. 2 d. 1 q. 1 a. 1 co.']).toContain('first simply and first in some genus');
    expect(summa.sections['Super Sent., lib. 3 d. 1 q. 1 a. 1 co.']).toContain('union of two or three things');
    expect(summa.sections['Super Sent., lib. 4 d. 1 q. 1 a. 1 qc. 1 co.']).toContain('sacrament');

    // DEF-013: Super Sent., q. 1 a. 3 qc. 2 co. vs ad 1 and qc. 3 co. vs ad 1 must have distinct translations
    expect(summa.sections['Super Sent., q. 1 a. 3 qc. 2 co.']).toBeTruthy();
    expect(summa.sections['Super Sent., q. 1 a. 3 qc. 2 ad 1']).toBeTruthy();
    expect(summa.sections['Super Sent., q. 1 a. 3 qc. 2 co.']).not.toBe(
      summa.sections['Super Sent., q. 1 a. 3 qc. 2 ad 1']
    );
    expect(summa.sections['Super Sent., q. 1 a. 3 qc. 3 co.']).toBeTruthy();
    expect(summa.sections['Super Sent., q. 1 a. 3 qc. 3 ad 1']).toBeTruthy();
    expect(summa.sections['Super Sent., q. 1 a. 3 qc. 3 co.']).not.toBe(
      summa.sections['Super Sent., q. 1 a. 3 qc. 3 ad 1']
    );

    // Isidore.co / AquinasOperaOmnia Corpus-Wide Translations (Quaestiones Disputatae, Aristotelian & Biblical Commentaries, Opuscula, Catena Aurea)
    expect(Object.keys(summa.sections).length).toBeGreaterThan(75000);
    expect(summa.sections['De veritate, q. 1 a. 1 arg. 1']).toContain('Augustine');
    expect(summa.sections['De veritate, q. 1 a. 1 co.']).toBeTruthy();
    expect(summa.sections['De potentia, q. 1 a. 1 co.']).toBeTruthy();
    expect(summa.sections['De spiritualibus creaturis, a. 1 co.']).toBeTruthy();
    expect(summa.sections['Q. d. de anima, a. 1 co.']).toBeTruthy();
    expect(summa.sections['De ente et essentia, pr.']).toContain('small mistake in the beginning');
    expect(summa.sections['De ente et essentia, cap. 1']).toBeTruthy();
    expect(summa.sections['De principiis naturae, cap. 1']).toBeTruthy();
    expect(summa.sections['Compendium theologiae, lib. 1 cap. 1']).toBeTruthy();
    expect(summa.sections['De substantiis separatis, cap. 1']).toBeTruthy();
    expect(summa.sections['In Symbolum Apostolorum, pr.']).toBeTruthy();
    expect(summa.sections['In orationem dominicam, pr.']).toBeTruthy();
    expect(summa.sections['Super Io., cap. 1 l. 1']).toBeTruthy();
    expect(summa.sections['Super Eph., cap. 1 l. 1']).toBeTruthy();
    expect(summa.sections['Super Gal., cap. 1 l. 1']).toBeTruthy();
    expect(summa.sections['Super Iob, cap. 1']).toBeTruthy();
    expect(summa.sections['Super Psalmo 1 n. 1']).toBeTruthy();
    expect(summa.sections['Catena in Mt., cap. 1 l. 1']).toBeTruthy();
  });
});
