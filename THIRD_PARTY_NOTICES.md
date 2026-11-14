# Third-Party Notices, Data Provenance & Licenses

**Schola Thomistica — Latin Reader** bundles derived lexical and parallel-text datasets in `src/data/` (packaged in `dist/extension/data/`). Each source, its upstream repository, and its license are documented below.

---

## 1. Whitaker's Words (`whitaker-dict.json`, `whitaker-inflects.json`)
- **Author:** Col. William A. Whitaker (USAF, Ret.)
- **Upstream Source:** `mk270/whitakers-words` (`DICTLINE.GEN`, `INFLECTS.LAT`, `UNIQUES.LAT`, `ADDONS.LAT`)
- **License:** Public Domain / Open Educational Release by William Whitaker ("freely available for any purpose").

## 2. Thomas-Lexikon (`thomistic-lexicon.json`)
- **Author:** Ludwig Schütz (2nd ed., Paderborn: Ferdinand Schöningh, 1895) + Curated English Thomistic Philosophical & Theological Layer
- **Upstream Source:** Ludwig Schütz, *Thomas-Lexikon: Sammlung, Übersetzung und Erklärung der in sämtlichen Werken des hl. Thomas von Aquin vorkommenden Kunstausdrücke und wissenschaftlichen Aussprüche* (1895).
- **License:** Public Domain (published 1895); curated English glosses and notes licensed under MIT.

## 3. Ecclesiastical Latin Dictionary (`ecclesiastical-dict.json`)
- **Upstream Sources:**
  - `ecclesia-dev/latin` Liturgical & Ecclesiastical Latin Vocabulary
  - Public-domain Patristic/Vulgate/Scholastic glosses and Whitaker area-`E` (Ecclesiastical) entries
- **License:** MIT License / Public Domain.

## 4. Wiktionary & Victionarium (`wiktionary-latin.json`)
- **Author:** Wiktionary & Victionarium Contributors
- **Upstream Source:** English Wiktionary (`https://en.wiktionary.org/`) and Latin Victionarium (`https://la.wiktionary.org/`)
- **License:** Creative Commons Attribution-ShareAlike 4.0 International (**CC BY-SA 4.0**, `https://creativecommons.org/licenses/by-sa/4.0/`). Each entry in the extension UI links directly to its canonical `https://en.wiktionary.org/wiki/{lemma}#Latin` page.

## 5. Charlton T. Lewis & Charles Short, *A Latin Dictionary* (`lewis-short-core.json`)
- **Authors:** Charlton T. Lewis and Charles Short (Oxford: Clarendon Press, 1879)
- **Upstream Digital Edition:** Perseus Digital Library (`PerseusDL/canonical-latinLit`) / `chartings/lewis-short-json`
- **License:** Print edition (1879) is in the Public Domain; Perseus XML digitization is licensed under Creative Commons Attribution-ShareAlike 3.0 United States (**CC BY-SA 3.0 US**).

## 6. Parallel English Reference Corpus (`summa-english.json`)
- ***Summa Theologiae* (`30,118` keys / `97.5%` title coverage):**
  - **Translator:** Fathers of the English Dominican Province (London: Burns Oates & Washbourne, 1920)
  - **Upstream Source:** Public Domain 1920 edition (`https://www.newadvent.org/summa/` / `Geremia/AquinasOperaOmnia`)
  - **License:** Public Domain.
- ***Scriptum super Sententiis* & *Summa Contra Gentiles* (`Geremia/AquinasOperaOmnia` & `Geremia23/AquinasLatinEnglish`):**
  - **Upstream Sources:**
    - `https://github.com/Geremia/AquinasOperaOmnia` (`Sentences.htm`, `Sent1.htm`–`Sent4.htm`, `ContraGentiles*.htm`)
    - `https://huggingface.co/datasets/Geremia23/AquinasLatinEnglish` (`ittb_la_en`)
  - **License & Commercial Store Distribution Note:** The *Summa Theologiae* (1920 Dominican Fathers) is in the public domain worldwide. Sections of the *Scriptum super Sententiis* and *Summa Contra Gentiles* sourced from `Geremia/AquinasOperaOmnia` (including prologue/Q.1 selections from Ralph McInerny, *Thomas Aquinas: Selected Writings*, Penguin, 1998) and `Geremia23/AquinasLatinEnglish` (CC-BY-NC-SA 4.0) are bundled for personal/academic research and non-commercial educational study. Before commercial or public Chrome Web Store redistribution, either verify upstream permissions for non-ST sections or build with *Summa Theologiae*-only public-domain sections.
