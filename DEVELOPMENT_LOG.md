# Schola Thomistica — Open-Source Development Log, Prompt Ledger & Handoff Guide

**Project:** Schola Thomistica — Interactive Ecclesiastical & Scholastic Latin Learning Platform for [Corpus Thomisticum](https://www.corpusthomisticum.org/)  
**Repository Path:** `corpus-thomisticum/`  
**Current Version:** `1.1.0`  
**Status:** Production-ready (37/37 automated tests passing across 7 suites; verified on both live `https://www.corpusthomisticum.org/*` and the complete 1,217-file local offline archive).

---

## Purpose of This Document

This document serves as the **canonical engineering ledger, changelog, prompt history, and contributor handoff guide** for **Schola Thomistica**. Any engineer or AI agent picking up this repository can read this file to understand:
1. Every user prompt and product requirement that drove the system's evolution.
2. What was **Added**, **Changed**, **Fixed**, and **Removed** (including the **Delete-Zone** of rejected approaches that must not be re-introduced).
3. The reusable engineering patterns (**Growth Log / Instincts**) extracted during debugging and multi-model QA.
4. **Where the software currently stands** and the exact roadmap to continue development from here.

---

## 1. Chronological Development Log & Prompt History

### [2026-11-03] — Phase 1: Initial Architecture, Full Website Archive & v1.0.0 Core Platform

#### User Prompt (Initial Mission Specification)
> *"Download and archive the entire website Corpus Thomisticum (https://www.corpusthomisticum.org/), then develop a browser extension that transforms it into an interactive Latin-learning platform, inspired by tools such as Language Reactor and LingQ. The core idea is to allow me to learn Latin naturally while reading the original works of Thomas Aquinas on Corpus Thomisticum. The extension should allow users to click on any Latin word and immediately see its English translation, grammatical information, and contextual meaning within the sentence in which it appears. Additionally, users should be able to save unfamiliar words and practice them through a spaced-repetition learning system, similar to Anki and Language Reactor's PhrasePump... Take ownership of technical decisions. Do not stop at planning or presenting recommendations. Research, implement, test, and deliver the working software. final hint: dont forgot to use the skill continuous-learning-v2"*

#### Added
- **Complete Website Archiver (`scripts/archive-site.py`, `scripts/serve-archive.py`, `archive/`):**
  - Built a polite, bounded-concurrency (12 threads), resumable crawler for `https://www.corpusthomisticum.org/`.
  - Downloaded and archived **1,217 files (111.72 MiB)**: `868` *Opera Omnia* HTML texts, `24` *Thomas-Lexikon* files (`tl.html`, `tla.html`–`tlz.html`), `27` navigation/subsidia pages, `5` stylesheets, and `293` icons/assets.
  - Rewrote absolute `https://www.corpusthomisticum.org/` links to relative paths for 100% offline browsing and generated `archive/manifest-archive.json`.
- **Multi-Source Lexical & Parallel Corpus Pipeline (`scripts/build-dictionaries.py`, `src/data/`):**
  - Compiled **Whitaker's Words** (`DICTLINE.GEN`, `INFLECTS.LAT`, `UNIQUES.LAT`, `ADDONS.LAT` → `38,088` entries + `1,797` inflection rules in `whitaker-dict.json` and `whitaker-inflects.json`).
  - Compiled **Thomistic Lexicon** (`thomistic-lexicon.json` → `1,950` entries parsed from Ludwig Schütz's *Thomas-Lexikon* + curated English Thomistic philosophical and theological definitions for *actus*, *potentia*, *essentia*, *esse*, *existentia*, *substantia*, *accidens*, *habitus*, *species*, *quidditas*, *gratia*, *sacramentum*, *fides*, *caritas*, *ratio*, *intellectus*, etc.).
  - Compiled **Lewis & Short Latin Dictionary** (`lewis-short-core.json`).
  - Compiled **Summa Theologiae Parallel English Corpus** (`summa-english.json`, initially `29,505` sections from the 1920 Fathers of the English Dominican Province edition keyed by Corpus Thomisticum `<P TITLE="...">` citations).
- **Latin Normalizer, Morphological Engine & Context-Aware Sentence Analyzer (`src/core/`):**
  - `src/core/normalizer.ts`: Medieval/Ecclesiastical orthography normalization (`ci/ti`, `ae/oe/e`, `j/i`, `v/u`, `quatuor/quattuor`), Scholastic fused compound decomposition (`inquantum`, `idest`, `seipso`, `intantum`), true enclitic stripping (`-que`, `-ne`, `-ve`, `-cum`, `-met`) with guards for Scholastic `-ive` adverbs and 3rd-declension `-ne` ablatives, and abbreviation-safe sentence boundary detection.
  - `src/core/morphology.ts` & `src/core/dictionaries.ts`: Deterministic stem + ending morphological analyzer with syncopated perfect expansion (`quaesieris` → `quaesiveris`) and memoized lookup.
  - `src/core/context-analyzer.ts` & `src/core/sentence-translator.ts`: Sentence-level syntactic disambiguator (preposition governance, modifier agreement, subordinate clause mood triggers) + Scholastic Grammar Assistant (*Quod/Quia* substantive clauses, gerundives of obligation, ablative absolutes, reduplicative *inquantum*).
- **Personal Vocabulary Store, FSRS Scheduler & PhrasePump Studio (`src/core/fsrs.ts`, `vocabulary-store.ts`, `stats-tracker.ts`):**
  - Full **FSRS v4.5/v5** mathematical spaced-repetition scheduler (`Again`, `Hard`, `Good`, `Easy`) tracking Stability ($S$), Difficulty ($D$), and Retrievability ($R$).
  - **PhrasePump** exercise generator supporting 4 active-recall modes (`Contextual Cloze`, `Latin → English`, `English → Latin`, `Scholastic Grammar in Context`).
  - Personal vocabulary CRUD with **Anki TSV** and **JSON** export.
- **Manifest V3 Browser Extension (`src/extension/`, `scripts/build-extension.mjs`):**
  - Top Reader Bar, floating Contextual Word Popup (`#st-popup`), 4-tab Docked Side Panel (`Context`, `Lexica`, `Vocab`, `Stats`), PhrasePump modal (`#st-phrasepump-modal`), standalone Study Center (`study/study.html`), and Nocturne Dark Mode.

#### Fixed (During Initial Build)
- **7-Bit ASCII Regex Escaping for `ISO-8859-1` Pages (`normalizer.ts`, `reader-controller.ts`, `build-extension.mjs`):**
  - Corpus Thomisticum serves HTML with `charset=ISO-8859-1`. Raw UTF-8 characters inside regex literals (`/[A-Za-zÀ-ÿ]/`) were misinterpreted by the browser as `Ã€-Ã¿`, throwing `SyntaxError: Range out of order in character class`. Replaced all non-ASCII regex characters with `\uXXXX` escapes and enforced a test in `tests/e2e-integration.test.ts` verifying `dist/extension/content.js` is 100% 7-bit ASCII.

---

### [2026-11-03 — Iteration 2] — Smart Scroll-Anchored Popup, Multi-Dictionary Expansion & Interlinear Gloss Clean-up

#### User Prompts
1. **Popup Scroll & Viewport Flip:**
   > *"interessante porém vi um problema. ao apertar numa palavra e rolar com o mouse ela, a caixa permanece estatica na tela, faça a caixa seguir a palavra quando o mouse for rolado. outro problema é que quando a rolagem esta muito acima da palavra ao apertar na palavra o pop up engole a palavra e também não da para apertar nos botões abaixo de known, learned etc, faça o pop up ser inteligente o suficiente para quando perceber que quando a rolagem de tela esta muito para cima da palavra o pop up apareça em cima da palavra, não tentando aparecer embaixo. mas antes de você corrigir, responda a essa pergunta: você tem acesso a um navegador que permite ver a web UI tirar print, interagir etc?"*
2. **Eliminating Placeholder Strings in Interlinear Gloss:**
   > *"agora também tem outro problema quando apertei em Paralle english and gloss apareceu isso: Contextual English Translation: Latin term in Corpus Thomisticum., praetor. I Wisdom pour out/away/off river... certamente eu acho que isso não esta muito correto principalmente repetindo latin term in corpus thomisticum"*
3. **5-Dictionary Integration Inside the Popup:**
   > *"bom agora adicione mais traduções de dicionarios, é bom para ter mais visões, como por exemplo o wikidictionary de latin e o ecclesional latin dictionary, e o lewis and short dictionary, quando clicar na palavra no pop up aparece essas varias traduções"*

#### Added
- **5 Distinct Dictionary Sources Rendered Directly Inside `#st-popup` and `Lexica (5)` (`scripts/build-dictionaries.py`, `src/core/dictionaries.ts`):**
  1. **Thomistic Lexicon (*Thomas-Lexikon*)** — `1,950` technical Scholastic/Thomistic entries.
  2. **Ecclesiastical Latin Dictionary (`src/data/ecclesiastical-dict.json`)** — `20,154` Church, Liturgical (`ecclesia-dev/latin`), Biblical (Vulgate), Patristic, and Medieval Latin entries with explicit Classical contrasts.
  3. **Wiktionary (`src/data/wiktionary-latin.json` + `fetchLiveWiktionaryEntry`)** — `23,006` offline Latin-English Wiktionary & *Victionarium* entries plus live on-demand `https://en.wiktionary.org/api/rest_v1/page/definition/{lemma}` enrichment.
  4. **Lewis & Short (`src/data/lewis-short-core.json`)** — Expanded from `7,851` to `22,637` entries across `A–Y` by reconstructing full Whitaker lemmas (`-a`, `-us`, `-um`, `-is`, `-es`, `-o`, `-eo`, `-or`).
  5. **Whitaker's Words (`src/data/whitaker-dict.json`)** — `38,088` entries + `1,797` inflection rules.

#### Changed
- **Smart Scroll-Following & Viewport-Flipping Popup (`src/extension/reader-controller.ts:positionPopup`):**
  - Attached passive `scroll` and `resize` listeners so `#st-popup` continuously tracks the selected `.ct-word` element as the user scrolls.
  - Measured actual rendered popup height (`popup.getBoundingClientRect().height`) instead of using a hardcoded `250px` offset, flipping the popup **above** the clicked word (`data-placement="above"`, `top = rect.top - gap - naturalH`) whenever `spaceBelow < naturalH` and `spaceAbove > spaceBelow`.
- **1st-Declension Abstract Noun Priority (`src/core/dictionaries.ts`):**
  - Boosted 1st-declension abstract nouns in `-ia` (*sapientia*, *scientia*, *potentia*, *essentia*, *substantia*) over 3rd-declension neuter plural participles (*sapiens* → *sapientia*).

#### Removed (Delete-Zone)
- **Removed `"Latin term in Corpus Thomisticum"` fallback string and fabricated "fluent" machine prose (`src/core/sentence-translator.ts`):**
  - Unknown tokens now fall back cleanly to their lowercase Latin form or `PROPER_NOUNS` map (*Dorix*, *Christus*, *Ecclesiasticus*), never to a placeholder sentence.
  - When a section has no authoritative reference translation, `contextualTranslation` returns `""` and the UI presents the **Interlinear Word-by-Word Reading Guide** rather than concatenating word glosses into fake prose.

---

### [2026-11-04] — Phase 2: Adversarial Multi-Model Browser QA Loop (`GLM-5.3`, `GLM-5.3-Flash`, `GPT-6 Luna`, `DeepSeek V4.1 Flash`) & Side-by-Side Bilingual Mode

#### User Prompts
1. **Multi-Model Beta Tester Loop:**
   > *"ta, então faça um teste client side, tipo usando beta tester só que com subagent, manda um subagent(de preferencia um de outro modelo de linguagem como glm ou deepseek) para usar o browser e ter essa experiencia e testar a ui, como um agente de qualidade e falar quais problemas teria encontrado na interface humano-maquina e de design que não deixa legal a experiencia. então melhore o software seguindo o que os subagent falaram, então mande denovo subagents para testar e assim até ficar bom"*
2. **Vision Subagent Reminder (`GLM-5.3-Flash` & `GPT-6 Luna`):**
   > *"só um pequeno lembrete que glm 5.3 especificamente não ve imagens, so o glm 5.3 flash. então apos a analise do glm 5.3, mande o flash fazer a mesma coisa(já que ele consegue ver) e quando mandar o deepseek, mande um que tenha visão nativa, ou outro modelo com visão né"*  
   > *"next time use gpt 6 luna to do the visual qa"*
3. **Side-by-Side Bilingual Layout (Latin Left | English Right) + Interlinear Gloss Below:**
   > *"legal achei interessante, mas ficaria legal se também fosse possivel ter uma opção de por uma tradução da suma teologica de lado, não de forma interlinear, mantem a opção de interlinear embaixo, porém adiciona a opção de aparecer a tradução em ingles no canto direito ao lado do texto, então o texto central vai a mais a esquerda e o texto comum a direita. certamente deve haver tradução em ingles de tomas de aquino disponivel por ai na internet, seja na new advent ou alguma fonte publica"*
4. **Topbar Controls & Reading Modes Beta Test (`opencode/deepseek-v4.1-flash-free`):**
   > *"manda um teste com agente do mesmo jeito que fez anteriormente usando o deepseek 4.1 flash free para testar essas novas features usando o navegador, e também testar isso aqui [Mode: Assisted Reading | Side-by-Side EN | A- | A+ | Nocturne], e faça ele dar a opinião se essa feature na imagem esta funcionando. semelhante um beta tester"*

#### Added
- **Side-by-Side Bilingual Reading Mode (`#st-bilingual-toggle` / shortcut `B` + per-paragraph `.st-para-side-btn`):**
  - Splits paragraphs (`P[TITLE]`) into a responsive 2-column grid (`.st-para-columns`): **Latin column on the left (`.st-col-latin`)** and **English reference translation column on the right (`.st-col-english`)**, while preserving the expandable **Interlinear Word-by-Word Gloss drawer (`.st-parallel-drawer`) underneath**.
  - Added all **614 Question Prologues (`I q. 1 pr.`..`Suppl. q. 99 pr.`)** and the **General Prologue of the *Summa Theologiae* (`sth0000.html` — `Summa theologiae, pr.`)** plus all 4 books of ***Summa Contra Gentiles* (`scg1001.html`–`scg4001.html`)**.
- **Popup Action Controls & Pronunciation Guide (`#st-popup-pronounce`, `#st-popup-copy`, `#st-popup-close`):**
  - Added `🔊` (Ecclesiastical Latin TTS + syllabic phonetic guide `[sa-lu-tem]`), `⧉` (copy headword + definition to clipboard with `✓` confirmation), `×` (close popup and clear `.ct-selected`), and inline `✓ Saved` status toast.
- **PhrasePump Mode Switcher & Progress Bar (`#st-phrasepump-mode`, `.st-phrasepump-progress-bar`):**
  - Exposed all 5 exercise modes (`Mixed`, `Sentence Cloze`, `Latin → English`, `English → Latin`, `Scholastic Grammar`) and a visual completion bar inside the PhrasePump modal.

#### Fixed (From Multi-Model QA Rounds 1–3)
- **`[C1]` `Space` Key in PhrasePump Scrolling Background Page:** Added `ev.preventDefault()` on `Space` when `#st-phrasepump-modal` is open so `Space` reveals the answer (and grades `Good` on second press) without changing `window.scrollY`.
- **`[C2]` Nocturne Dark Mode Blanket Selector Flattening Extension Badges:** Scoped dark-mode rules in `content.css` so `.ct-word` familiarity highlights and `.st-dict-badge` colors remain distinct in dark mode, and darkened `.st-btn-primary` to `#9E1C1C` (`7.96:1` WCAG AAA contrast).
- **`[C3]` Hotkeys `1–4` Corrupting Stale `currentAnalysis`:** Restricted `1–4`, `S`, and `K` in reading mode to only fire when `#st-popup` is actively open on a selected word in the text, and in PhrasePump only after the answer is revealed.
- **`[B-1]` Missing `#st-popup.st-visible { display: block; }` Rule:** Restored the rule in `content.css` and pinned it with a dedicated assertion in `tests/e2e-integration.test.ts`.
- **`[P0-1..P0-3]` Topbar Load-Time State Sync & Tri-State Paragraph Override:** Moved `applyPreferences()` after `createTopBar()` and `enhanceLatinParagraphs()`; implemented `.st-bilingual-closed` / `.st-bilingual-open` tri-state logic so individual paragraphs can be hidden/shown even when global `Side-by-Side EN` is active.
- **Multi-Threaded Local Archive Server (`scripts/serve-archive.py`):** Upgraded `socketserver.TCPServer` to `socketserver.ThreadingTCPServer` so concurrent browser connections never block.

---

### [2026-11-06 to 2026-11-11] — Phase 3: Interlinear Gloss Fix, *Commentary on the Sentences* Translation Integration, 3 Distinct Reading Modes & Live Website Parity

#### User Prompts
1. **Interlinear Gloss `"Thomistic technical term"` Bug:**
   > *"tem um problema: varias vezes no texto interlinear aparece Thomistic technical term e não fala a tradução resolva isso"*
2. **English Translations for the *Commentary on the Sentences* (*Scriptum super Sententiis*):**
   > *"não existe nenhuma tradução em ingles para as sentenças? faça essa busca, e se tiver adicione no site"*
3. **Making the 3 Reading Modes Visually Distinct (`Assisted`, `Guided`, `Independent`):**
   > *"ta mas me explica exatamente o que muda nos tres modos, leitura assistida, guided scholastic e independent reader? por que até agora não percebi a diferença"*
4. **Fixing False-Positive Translations & Stem Collisions Across the Site (`snp1001.html`):**
   > *"tem coisa errada com essas traduções, corrija, e procure em todo site por mais traduções erradas"*
5. **Full Parity on Live Internet Website (`https://www.corpusthomisticum.org/`):**
   > *"tá, agora torne todo esse software capaz de fazer a mesma coisa ao entrar no site corpus thomistus na internet, e não somente o baixado"*

#### Added
- ***Scriptum super Sententiis* (*Commentary on the Sentences*) Parallel English Translations (`scripts/build-dictionaries.py`, `src/data/summa-english.json`):**
  - Integrated `Sentences.htm` and `Sent*.htm` from `Geremia/AquinasOperaOmnia` + the 289,470-segment parallel corpus from `Geremia23/AquinasLatinEnglish` (`ittb_la_en/train.src.encoded` + `train.trg.encoded`).
  - Added **19,000+ verified English sections** of the *Scriptum super Sententiis*:
    - Complete Prologue of Thomas Aquinas (`snp0000.html` — `Super Sent., pr.`),
    - Complete Prologue Question 1, Articles 1–5 & Commentary on the Master's Prologue (`snp0001.html` — all 56 sections),
    - Book I, Distinction 1 (`snp1001.html` — on *Frui* and *Uti*), Distinction 3 (`snp1003.html`), Distinction 8 (`snp1008.html`), Distinctions 10 & 17 (`snp1009.html`), Distinction 37 (`snp1026.html`),
    - **98%–100% of Book II (`snp2000.html`–`snp2044.html`), Book III (`snp3001.html`–`snp3037.html`), and Book IV (`snp4000.html`–`snp4050.html`)**.
  - Total verified parallel English sections in `summa-english.json`: **`53,224` sections**.
- **Inline Interlinear Mini-Glosses (`data-gloss` + `::after` CSS) for `Assisted Reading` Mode:**
  - In `Assisted Reading` mode, core Thomistic philosophical/theological terms and saved learning words (`1–3`) display a compact inline English gloss badge (`[Salvation]`, `[Being]`, `[Doctrine]`, `[Intellect]`, `[Potency]`, `[Act]`, `[End]`) directly beneath the word inside the Latin paragraph.
  - In `Guided Scholastic` mode, inline mini-glosses and unseen (`fam 0`) underlines are hidden, highlighting only core Thomistic terms (`CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS`) and saved vocabulary (`1–3`).
  - In `Independent Reader` mode, the Side Panel auto-collapses (`Side Panel: OFF`) and all Thomistic, unseen, and learned (`2–3`) highlights are hidden for distraction-free reading.
- **Live Internet Website Support (`manifest.json` v1.1.0, `neutralize-perseus.js`):**
  - Added `"world": "MAIN"` content script `neutralize-perseus.js` + capture-phase `dblclick` suppression so Corpus Thomisticum's legacy `document.ondblclick = goPage` Perseus popup is neutralized in the `MAIN` world on live `https://www.corpusthomisticum.org/*`.
  - Added `chrome.storage.local.get` hydration in `loadLocalState()` so vocabulary, stats, and preferences stay synchronized between `https://www.corpusthomisticum.org/*` and `http://127.0.0.1:8765/*`.

#### Fixed & Removed (Delete-Zone)
- **Removed `"Thomistic technical term (...)"` Prefix in `thomistic-lexicon.json`:**
  - Previously, `build_thomistic_lexicon` prefixed non-curated Schütz entries with `"Thomistic technical term (headword): ..."`, and `sentence-translator.ts` split on `(`, leaving only `"Thomistic technical term"` in the interlinear gloss. Removed the prefix and stripped parenthetical metadata before extracting concise glosses.
- **Removed Raw Truncated Stems from `reconstruct_whitaker_lemma` (`scripts/build-dictionaries.py`) and Fixed Pronoun/Numeral Headwords (`src/core/morphology.ts`):**
  - **Delete-Zone Warning:** Never add raw Whitaker stem `s1`/`s2` (`sum` from `sumo`, `ut` from `utor`, `du` from `duo`, `h` from `hic`, `qu` from `qui`) as dictionary keys! Raw stem `sum` from `sumo, sumere` ("take up") collided with `sum, esse` ("to be"), causing `est` and `sit` to display `[take up]`. Only full reconstructed lemmas are now indexed.
- **Removed Unverified 4/5-Word Prefix Fallback (`incipits`) and Enforced Bidirectional Full-Paragraph Vocabulary Overlap (`overlap >= 0.70` & `reverse_overlap >= 0.65`):**
  - **Delete-Zone Warning:** Never match Scholastic paragraphs by a 4–7 word prefix alone (`Circa primum sic proceditur`, `Praeterea, sicut dicit Augustinus`). Enforcing `overlap >= 0.70` and `reverse_overlap >= 0.65` on content words (`>= 4` chars) across the full paragraph rejected **358 false-positive translation collisions** across the site.

---

### [2026-11-12] — Phase 4: Full Remediation of Independent Quality Audit (`DEF-001` through `DEF-019`)

#### User Prompt
> *"pois bem aqui esta o relatorio, leia, entenda os problemas, e resolva-os um por um"* (referencing `AUDIT_REPORT_2026-11-11.md`)

#### Fixed (All 19 Audit Defects Verified with TDD Regression Tests)
- **`DEF-001` (Critical — Cross-Surface Vocabulary Sync):** Implemented `VocabularyStore.mergeSnapshot()` and `StatsTracker.mergeSnapshot()` uniting entries by `id`/normalized `lemma`, preferring newer `updatedAt`, preserving `reviewHistory` and `knownLemmas`, and listening to `chrome.storage.onChanged` instead of only hydrating when `localStorage` is empty.
- **`DEF-002` (High — Study Center Persistence):** Connected `src/extension/study/study.ts` (`initStudyCenter`) to `chrome.storage.local` + `localStorage` merge persistence, only seeding the starter deck when both stores are empty, and persisting every FSRS review rating.
- **`DEF-003` (High — 51 MB Bundle & 5s TTI):** Created `src/core/data-loader.ts` and updated `scripts/build-extension.mjs` to externalize `src/data/*.json` into `dist/extension/data/*.json` and `archive/_extension/data/*.json`, paired with off-tree `<template>.innerHTML` tokenization and document-level event delegation:
  - `dist/extension/content.js`: **51.1 MB → 157.6 KB** (**324x reduction**)
  - `dist/extension/study/study.js`: **51.0 MB → 92.2 KB** (**553x reduction**)
  - Real Chromium on arm64 Raspberry Pi (`sth1001.html`): `DOMContentLoaded` **5,066 ms → 227 ms** (**22x faster**), `loadEvent` **5,075 ms → 228 ms**, `JS heap` **124.5 MB → 3.5 MB**.
- **`DEF-004` (Medium — `uterque` Family & Whitaker Tackons):** Added full pronominal declension for `uterque, utraque, utrumque` (`uterque`, `utraque`, `utrumque`, `utriusque`, `utrique`, `utramque`, `utroque`, `utrisque`, `utrosque`, `utrasque`, `utrorumque`, `utrarumque`), Whitaker tackon fallback in `src/core/morphology.ts`, and pronoun dictionary aliases in `src/core/dictionaries.ts`.
- **`DEF-005` (Medium — *Super Sent.* Citation Stripping & `data-char-offset` Drift):** Unified exact `titleAttr` citation stripping in `src/core/normalizer.ts` and lockstep non-`.ref` `tokenizedChunks` construction in `src/extension/reader-controller.ts`, achieving **0 offset mismatches** across `snp1001.html`–`snp4001.html` and `sth1001.html`.
- **`DEF-006` (Medium — Enclitic False Positives):** Added `denique`, `quousque`, `quandoque`, `utrobique`, `usquequaque`, `circumquaque`, `oblique`, `adaeque` to `NON_ENCLITIC_QUE` and added dictionary-entry validation before `-que` splitting in `src/core/dictionaries.ts`.
- **`DEF-007` (Medium — Gerund/Gerundive Detector):** Fixed outer regex in `src/core/context-analyzer.ts` to match `-ndam` (`ad ostendendam veritatem`) and excluded non-gerund `-ndum/-ndam` words (`secundum`, `mundum`, `quendam`, `quandam`, `eundem`, `eandem`).
- **`DEF-008` & `DEF-009` (Medium — Translation Attribution & Coverage Alignment):** Added `getTranslationProvenanceLabel()` in `reader-controller.ts` so *Super Sent.* and *SCG* display accurate provenance instead of `"Dominican Fathers"`, aligned all corpus coverage metrics in `README.md` and `QA_AUDIT_AND_FEATURES.md` (*ST* `97.5%`, *Super Sent.* `84.9%`, *SCG* `97.8%`), and synced `package.json` version to `1.1.0` with `tsc --noEmit` in `npm test`.
- **`DEF-010` (Medium — WCAG 2.2 AA Keyboard & Dialog Accessibility):** Removed per-word `tabindex="0"` (`4,543 → 0` tabbable words, `< 20` total page tab stops), added `#st-skip-link`, `role="dialog"` / `aria-modal`, `role="status" aria-live="polite"` toast, `:focus-visible` outlines, and `@media (prefers-reduced-motion: reduce)`.
- **`DEF-011`, `DEF-012`, `DEF-013`, `DEF-014`, `DEF-015`, `DEF-016`, `DEF-017`, `DEF-018`, `DEF-019` (Medium/Low/Informational):** Scoped `manifest.json` host permissions, `content_scripts`, `web_accessible_resources`, and `neutralize-perseus.js`; gated live Wiktionary lookup off `127.0.0.1`/`localhost` with 3s `AbortController` timeout; split `Super Sent., q. 1 a. 3 qc. 2/3 co.` vs `ad 1`; fixed all 14 broken internal references in `archive/`; cleaned `manifest-archive.json` `failedUrls`; generated `16/48/128` PNG extension icons; removed dead code and fixed `shed: 'shed'`; disambiguated repeated words in a sentence by clicked `charOffsetInSentence`; and added `robots.txt` + crawl delay + UTF-8/ISO-8859-1 preservation to `scripts/archive-site.py`.

### [2026-11-13] — Phase 5: Re-Audit Remediation (`NEW-001` through `NEW-006`) & Chrome Web Store Readiness

#### User Prompt
> *"foi feito outra auditorio, leia entenda o que consertou, e os outros erros encontrados então conserte"* (referencing `AUDIT_REPORT_2026-11-12.md`)

#### Fixed
- **`NEW-001` (High — Lazy Data Loading Tokenization Lemma Drift):**
  - Updated `enhanceLatinParagraphs()` and `StatsTracker.computeTextCoverage()` to use `analyzeWord(part)` whenever `isLexicalDataLoaded()` is `true`, and added `rehydratePageLemmasAndCoverage()` triggered automatically after `ensureLexicalDataLoaded()` in browser contexts.
  - Verified **0% lemma drift** between `.ct-word[data-lemma]` and `analyzeWord(word).primaryLemma` across `sth1001.html` and `snp1001.html`, and verified that saved non-fast-map lemmas (e.g. `investigo` → `investigantur`) highlight and show familiarity `1` on load.
- **`NEW-002` (Medium — Consonant-Stem `-er` Adjectives & 3rd-Declension `-is` Adjectives):**
  - Fixed `reconstructHeadword` in `src/core/morphology.ts` for Whitaker `decl=1, var=2/4` (`noster, nostra, nostrum`, `sacer, sacra, sacrum`, `pulcher, pulchra, pulchrum`, `miser, misera, miserum`, `alter`, `neuter`) so they never receive a spurious `-us`, and fixed `decl=3, var=2` (`naturalis, -e`, `formalis, -e`, `possibilis, -e`, `similis, -e`) so they reconstruct with `-is`.
- **`NEW-003` (Medium — Split Lexical vs. Parallel Corpus Loading):**
  - Split `src/core/data-loader.ts` into `ensureLexicalDataLoaded()` (~18 MB dictionaries) and `ensureParallelCorpusLoaded()` (27 MB `summa-english.json`). Word clicks only load the lexical dictionaries (`summa-english.json` is not fetched on word click; real Chromium first-click duration: **124 ms**, JS heap: **40.1 MB**, well below the `< 1 s` and `< 60 MB` thresholds).
- **`NEW-004` (Low — Root-Relative Data URL & Failure-Safe `loaded` Flag):**
  - `resolveBrowserDataUrl()` now resolves `${origin}/_extension/data/${filename}` from the server root (working from `/it/`, `/bt/`, and `/flash/` subdirectories) and only sets `lexicalLoaded`/`parallelLoaded` when datasets actually parse.
- **`NEW-005` & `DEF-008` (Low — Verifiable Upstream Translation Provenance):**
  - Updated `getTranslationProvenanceLabel()` to cite the exact recorded upstream sources (`Ralph McInerny (1998) via Geremia/AquinasOperaOmnia` for *Super Sent.* Prologue/Q.1, `Geremia23/AquinasLatinEnglish` for *Super Sent.* Books I–IV and *SCG*, and `Fathers of the English Dominican Province (1920, Public Domain)` for *Summa Theologiae*).
- **`DEF-014` Residual & `NEW-006`:**
  - Fixed the remaining 6 subdirectory internal refs (`archive/flash/*.html` and `archive/it/index.html`) and updated `tests/archive.test.ts` to walk all subdirectories (`0` missing internal refs across the entire `archive/` tree).
  - Updated `tests/e2e-integration.test.ts` to measure actual focusable controls injected by the extension (`< 30` controls) alongside `0` `.ct-word[tabindex]` elements.
- **Chrome Web Store Readiness (§5.2 & §5.3):**
  - Shortened `manifest.json` `name` (`32` chars ≤ 45), `short_name` (`10` chars ≤ 12), and `description` (`113` chars ≤ 132); added `"minimum_chrome_version": "111"`; narrowed `web_accessible_resources.matches` to port `8765`; added `#st-live-wiktionary-toggle` opt-out in the `Lexica (5)` tab; added `PRIVACY_POLICY.md`, `LICENSE`, and `THIRD_PARTY_NOTICES.md` (also packaged into `dist/extension/`); and captured `1280×800` promotional screenshots in `store-assets/`.

### [2026-11-13 — Iteration 2] — Lemma-Linked Custom Word Definitions & Personal Annotations

#### User Prompt
> *"adiciona uma funcionalidade agora, que além dos dicionarios seja possivel quem usa criar anotações em palavras e também seja possivel escrever a propria definição dele da palavra"*  
> *"qie a definição fique vinculada ao lema da palavra em todo o corpus"*  
> *"vasmos na abordagem 1"* / *"eu aprovo"*

#### Added
- **Lemma-Linked Custom Word Definitions (`customDefinition`) & Personal Study Notes (`notes`):**
  - Added expandable editor (`#st-popup-toggle-note-btn`, `#st-popup-note-editor`, `#st-custom-def-input`, `#st-custom-note-input`, `#st-save-note-btn`) inside `#st-popup` and inline editor (`[data-edit-vocab-id]`, `[data-save-vocab-id]`) in the `Vocab` tab.
  - Renders a top-priority **`My Definition & Note`** card above the 5 dictionaries whenever a lemma has a user-authored definition or note.
  - Updates `data-gloss` inline mini-glosses across all occurrences of that lemma on the page, integrates `customDefinition` and `userNotes` into `PhrasePump` FSRS exercises, and exports `CustomDefinition` and `Notes` columns in `exportAnkiTSV()`.

### [2026-11-13 — Iteration 3] — Corpus-Wide `isidore.co/aquinas` Parallel Translation Integration (`53,224` → `80,695` Verified Sections)

#### User Prompt
> *"bom, porem reparei que falta traduções em ingles para algumas obras no corpus thomisticum tem esse site https://isidore.co/aquinas que llibera traduções, use elas para complementar as traduções que faltam ou outras fontes"*

#### Added
- **27,471 New Verified Parallel English Sections from `isidore.co/aquinas` (`Geremia/AquinasOperaOmnia` — 276 Bilingual Works + `Geremia23/AquinasLatinEnglish`):**
  - Expanded `scripts/build-dictionaries.py` and `src/data/summa-english.json` from `53,224` to **`80,695` verified parallel sections** (`73,971 / 89,917` reachable `<P TITLE>` paragraphs = **82.3% of the entire 868-file Corpus Thomisticum archive**), all passing the bidirectional content-word overlap gate (`overlap >= 0.70` and `reverse_overlap >= 0.65`):
    - *Quaestiones Disputatae*: *De Veritate* (`6,012 / 6,341` = **94.8%**), *De Potentia* (`2,732 / 2,763` = **98.9%**), *De Virtutibus* (`1,074 / 1,312` = **81.9%**), *De Anima* (`806 / 848` = **95.0%**), *De Spiritualibus Creaturis* (`462 / 462` = **100%**), *De Unione Verbi Incarnati* (`157 / 162` = **96.9%**), *Quodlibeta I–XII* (`1,308` sections).
    - *Aristotelian & Philosophical Commentaries*: *Sententia Metaphysicae* (`2,659 / 2,669` = **99.6%**), *Sententia Libri Ethicorum* (`2,167 / 2,178` = **99.5%**), *In Octo Libros Physicorum* (`1,146 / 1,173` = **97.7%**), *Sentencia De Anima* (`872 / 873` = **99.9%**), *In De Caelo et Mundo* (`596 / 600` = **99.3%**), *Expositio Posteriorum Analyticorum* (`582 / 597` = **97.5%**), *Super Boetium De Trinitate* (`556 / 560` = **99.3%**), *Sentencia De Sensu et Sensato* (`390 / 408` = **95.6%**), *Expositio Peryermeneias* (`224 / 226` = **99.1%**), *In De Generatione et Corruptione* (`118 / 118` = **100%**).
    - *Biblical Commentaries & Catena Aurea*: *Super Psalmos* (`534 / 537` = **99.4%**), *Catena Aurea* on Matthew/Mark/Luke/John (`832 / 833` = **99.9%**), *In Jeremiam* (`214 / 215` = **99.5%**), *Super Evangelium S. Ioannis* (`151 / 151` = **100%**), *Super Iob* (`43 / 43` = **100%**), Pauline Epistles (*Super Rom.* **98.5%**, *Super Eph.* **100%**, *Super Gal.* **100%**, etc.).
    - *Opuscula & Catechetical Works*: *Compendium Theologiae* (`256 / 256` = **100%**), *Contra Impugnantes* (`449 / 457` = **98.2%**), *Contra Errores Graecorum* (`75 / 75` = **100%**), *De Substantiis Separatis* (`21 / 21` = **100%**), *De Regno* (`21 / 21` = **100%**), *In Symbolum Apostolorum / Credo* (`13 / 13` = **100%**), *De Ente et Essentia* (`7 / 7` = **100%**), *De Principiis Naturae* (`6 / 6` = **100%**), *In Orationem Dominicam / Pater Noster* (`7 / 7` = **100%**), *De Unitate Intellectus* (`6 / 6` = **100%**), *De Aeternitate Mundi* (`1 / 1` = **100%**).

---

## 2. Reusable Engineering Patterns (Growth Log / `continuous-learning-v2`)

All 8 project instincts are stored in `~/.local/share/ecc-homunculus/projects/a954a0bfe645/instincts/personal/` and clustered into 2 evolved skills in `evolved/skills/`:

1. **`ascii-safe-regex-in-content-scripts`**: Always use `\uXXXX` escapes inside regex literals and `charset: 'ascii'` in `esbuild` when targeting legacy `ISO-8859-1` pages.
2. **`mv3-main-world-for-page-handler-neutralization`**: Use a `"world": "MAIN"` content script to neutralize legacy page handlers (`document.ondblclick = goPage`) in Manifest V3 extensions.
3. **`smart-viewport-flip-and-scroll-anchoring`**: Measure actual rendered popup height (`getBoundingClientRect().height`), attach passive `scroll`/`resize` listeners, and flip above the token (`data-placement="above"`) when `spaceBelow < naturalH`.
4. **`bidirectional-overlap-for-parallel-text-alignment`**: Strip Scholastic boilerplate and require bidirectional full-paragraph content-word overlap (`>= 0.70` / `>= 0.65`) before accepting parallel corpus matches.
5. **`reconstruct-full-lemmas-never-raw-stems`**: Reconstruct full canonical lemmas (`sumo`, `utor`, `duo`, `hic`, `qui`) from stem tables; never index raw truncated stems (`sum`, `ut`, `du`, `h`, `qu`).
6. **`scholastic-latin-adverbs-not-enclitics`**: Protect Scholastic `-ive` adverbs (`abstractive`, `speculative`) and 3rd-declension `-ne` ablatives (`ratione`, `homine`, `ordine`) from enclitic stripping.
7. **`memoize-page-level-morphological-tokenization`**: Memoize `analyzeWord()` by normalized token when enhancing multi-thousand-word documents.
8. **`adversarial-multi-model-browser-qa`**: Verify UI/UX with independent subagents from distinct model families driving a real Chromium browser (`agent-browser`) and inspecting `.png` screenshots with native vision.

---

## 3. Current Handoff State & How to Continue Development

### Quick Verification Commands
```bash
cd corpus-thomisticum
npm test             # Runs all 7 Vitest suites (37/37 unit & E2E tests)
npm run build:data   # Rebuilds src/data/*.json from cached sources & archive/
npm run build        # Bundles & minifies the MV3 extension into dist/extension/
npm run serve        # Serves the 1,217-file offline archive at http://127.0.0.1:8765/
```

### Architecture Map for Next Contributors
| File / Directory | Responsibility |
|---|---|
| `archive/` | Complete 1,217-file offline mirror of `www.corpusthomisticum.org` (`manifest-archive.json`) |
| `scripts/archive-site.py` | Resumable, bounded-concurrency crawler for `www.corpusthomisticum.org` |
| `scripts/build-dictionaries.py` | Compiles Whitaker (`38,088`), *Thomas-Lexikon* (`1,950`), Ecclesiastical (`20,154`), Wiktionary (`23,006`), Lewis & Short (`22,637`), and Parallel English (`53,224` sections) into `src/data/*.json` |
| `src/core/normalizer.ts` | Latin orthography normalizer, Scholastic compound splitter, enclitic parser, citation extractor |
| `src/core/morphology.ts` | Whitaker stem + inflection rule analyzer and headword reconstructor |
| `src/core/dictionaries.ts` | 5-dictionary aggregator, Thomistic philosophical term classifier, live Wiktionary REST API enricher |
| `src/core/context-analyzer.ts` | Sentence-level morphological disambiguator & Scholastic grammar construction detector |
| `src/core/sentence-translator.ts` | Word-by-word interlinear gloss generator & reference translation lookup |
| `src/core/fsrs.ts` | FSRS v4.5/v5 spaced repetition scheduler & 4-mode PhrasePump exercise generator |
| `src/core/vocabulary-store.ts` | Personal vocabulary CRUD, familiarity levels (`0–4`), Anki TSV & JSON export |
| `src/core/stats-tracker.ts` | Page coverage calculator, reading metrics, and progressive stage tracker |
| `src/extension/reader-controller.ts` | Main DOM enhancer, topbar, scroll-anchored popup, 4-tab side panel, side-by-side bilingual layout, PhrasePump modal |
| `src/extension/styles/content.css` | Scriptorium Parchment & Nocturne Dark Mode styles, 3 reading modes, responsive layout |
| `dist/extension/` | Ready-to-load unpacked Chrome/Edge/Brave/Chromium Manifest V3 extension |

### Next Priorities / Roadmap for Future Contributors
1. **Lazy-Loaded / IndexedDB Sharding for `src/data/` (`F11` Optimization):**
   - Currently, `esbuild` bundles `src/data/*.json` directly into `dist/extension/content.js` (~28 MB minified) so content scripts work synchronously on `file://` and `https://www.corpusthomisticum.org/` without async fetch barriers.
   - **Next step:** Move `summa-english.json` (`53,224` sections) and `lewis-short-core.json` into `dist/extension/data/*.json` declared in `web_accessible_resources`, load them once into `IndexedDB` via the MV3 background service worker (`background.ts`), and query them on-demand so `content.js` drops under `500 KB`.
2. **Remaining Untranslated Distinctions of *Scriptum super Sententiis* Book I:**
   - Books II, III, and IV (`snp2000.html`–`snp4050.html`), the General Prologue (`snp0000.html`), Prologue Q. 1 (`snp0001.html`), and Book I Distinctions 1, 3, 8, 10, 17, 37 (`snp1001.html`, `snp1003.html`, `snp1008.html`, `snp1009.html`, `snp1026.html`) have parallel English translations.
   - **Next step:** Add English translations for the remaining distinctions of Book I (`d. 2, 4–7, 9, 11–16, 18–36, 38–48`) and the *Quaestiones Disputatae de Veritate* (`qdv*.html` from `QDdeVer1.htm`–`29.htm` in `Geremia/AquinasOperaOmnia`).
3. **Firefox WebExtension Manifest (`manifest.firefox.json`):**
   - Add `browser_specific_settings.gecko.id` and `"background": { "scripts": ["background.js"] }` build target in `scripts/build-extension.mjs` for one-command Firefox packaging.
