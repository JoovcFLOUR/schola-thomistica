# Changelog

All notable changes to **Schola Thomistica** (`corpus-thomisticum/`) are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). For the full prompt ledger, root-cause analyses, and contributor handoff guide, see [`DEVELOPMENT_LOG.md`](./DEVELOPMENT_LOG.md).

---

## [1.2.0] - 2026-11-14

### Fixed
- **DeepSeek V4.1 Flash 1017 Independent Browser QA Audit Remediation (`BUG-01`–`BUG-09` & `OBS-01`):**
  - **`BUG-01` (P1 — `qui` / `quis` Definition & Saved Entry Migration):** Fixed `qui, quae, quod` and `quis, quid` in `thomistic-lexicon.json` and `ecclesiastical-dict.json` (which previously inherited `"be able"` from the irregular verb `queo, quire`), removed the truncated `poss` key, and added automatic migration in `VocabularyStore.mergeSnapshot()` to repair any saved `qui`/`quis`/`quod` entry with `translation: "be able"`.
  - **`BUG-02` (P1 — Deletion Tombstones & Sync Consistency):** Added `deletedLemmas` tombstones to `VocabularyStoreSnapshot` so deleted entries never resurrect from stale `chrome.storage` snapshots or cross-tab sync events.
  - **`BUG-03` & `BUG-04` (P1/P2 — Keyboard Word Navigation, Modal Focus Trap, Skip Link & Tab Semantics):** Added WAI-ARIA roving `tabindex` (`role="button"`, `ArrowRight`/`ArrowLeft`/`ArrowDown`/`ArrowUp` + `Enter`/`Space`) on `.ct-word` spans (keeping page tab stops at `1`), added `Tab`/`Shift+Tab` focus trapping and opener focus restoration to `#st-phrasepump-modal`, wired `#st-skip-link` to focus `#st-sidepanel`, and added `role="tablist"` / `role="tab"` / `aria-selected` to side-panel tabs.
  - **`BUG-05` (P2 — Infinitive Disambiguation, `limitibus` Case & `intentio` Nuance):** Demoted archaic 2nd-singular passive `-are`/`-ere`/`-ire` forms and `Locative` plural parses so `investigare` after `necessarium est` parses as **Present Active Infinitive** (`"to investigate"`) and `limitibus` parses as **Ablative/Dative Plural**; added curated Thomistic vs. Classical meaning for `intentio`.
  - **`BUG-06` & `OBS-01` (P2 — Parallel Corpus Loading State & Saved Sentence Hydration):** Side-by-Side EN columns now display `"Loading Reference Translation..."` while `summa-english.json` loads instead of prematurely showing `"No Bundled Reference Translation"`, and saving a word before parallel corpus load automatically upgrades `sentenceTranslation` in the background.
  - **`BUG-07`, `BUG-08` & `BUG-09` (P2/P3 — Mobile 375px Layout, Due-Only PhrasePump Queue & Polish):** Fixed 375px mobile overflow and popup button wrapping, restricted PhrasePump review sessions to `dueEntries` when due cards exist, preserved `#st-popup` when pressing `Escape` inside `#st-sidepanel` search inputs, separated Anki `Back` (`translation`) from `CustomDefinition`, stripped trailing punctuation from interlinear word cards, and unified version `1.2.0` across `manifest.json`, `package.json`, and `data-st-version`.

### Added
- **Corpus-Wide Parallel English Translations from `isidore.co/aquinas` (`80,695` Total Verified Sections — `82.3%` of Complete Opera Omnia):**
  - Integrated all 276 bilingual HTML works from `Geremia/AquinasOperaOmnia` (`https://isidore.co/aquinas`) + `Geremia23/AquinasLatinEnglish`, adding **`27,471` new verified English sections** across *De Veritate* (`94.8%`), *De Potentia* (`98.9%`), *De Virtutibus* (`81.9%`), *De Anima* (`95.0%`), *De Spiritualibus Creaturis* (`100%`), *Quodlibeta I–XII*, *Metaphysics* (`99.6%`), *Ethics* (`99.5%`), *Physics* (`97.7%`), *De Anima Commentary* (`99.9%`), *De Caelo* (`99.3%`), *Posterior Analytics* (`97.5%`), *Peryermeneias* (`99.1%`), *Super Boetium De Trinitate* (`99.3%`), *Psalms* (`99.4%`), *Job* (`100%`), *Catena Aurea* (`99.9%`), *John* (`100%`), *Pauline Epistles* (`98.5%–100%`), *Compendium Theologiae* (`100%`), *De Ente et Essentia* (`100%`), *De Principiis Naturae* (`100%`), *De Substantiis Separatis* (`100%`), *De Regno* (`100%`), *Credo* (`100%`), and *Pater Noster* (`100%`).
- **Lemma-Linked Custom Word Definitions & Personal Study Notes (`#st-popup-note-editor` & `Vocab` Tab):**
  - Users can now write their own custom definition (`customDefinition`) and personal annotations (`notes`) for any Latin word, linked by lemma across the entire Corpus Thomisticum.
  - Displays a top-priority `My Definition & Note` card inside `#st-popup` above the 5 dictionaries, updates inline `data-gloss` mini-glosses on all occurrences of the lemma on the page, supports inline editing in the `Vocab` tab, powers `PhrasePump` active-recall prompts, and exports `CustomDefinition` and `Notes` columns in Anki TSV.
- **Independent Quality Audit & Re-Audit Remediation (`DEF-001`–`DEF-019`, `NEW-001`–`NEW-006`, 50/50 Automated Tests + `tsc --noEmit`):**
  - Added `VocabularyStore.mergeSnapshot()` and `StatsTracker.mergeSnapshot()` with `updatedAt` resolution and `chrome.storage.onChanged` live sync (`DEF-001`, `DEF-002`).
  - Added `src/core/data-loader.ts` to externalize `src/data/*.json` into `dist/extension/data/*.json`, shrinking `content.js` from `51.1 MB` to `157.6 KB`, `study.js` from `51.0 MB` to `92.2 KB`, and cutting real Chromium `DOMContentLoaded` on arm64 Raspberry Pi from `5,066 ms` to `227 ms` (`DEF-003`).
  - Added full `uterque, utraque, utrumque` pronominal declension + Whitaker tackon support (`DEF-004`) and dictionary-validated enclitic protection for `denique`, `quousque`, `quandoque` (`DEF-006`).
  - Added WCAG 2.2 AA accessibility (`#st-skip-link`, `< 20` page tab stops, `role="dialog"`, `aria-modal="true"`, `aria-live="polite"`, `:focus-visible`, `prefers-reduced-motion: reduce`) (`DEF-010`) and generated `16/48/128` PNG extension icons (`DEF-016`).
- **Live Internet Website Parity (`https://www.corpusthomisticum.org/*`):**
  - Added `"world": "MAIN"` content script (`neutralize-perseus.js`) and capture-phase `dblclick` listener to disable Corpus Thomisticum's legacy Perseus popup on the live website.
  - Added bidirectional `chrome.storage.local` hydration so saved vocabulary, FSRS review schedules, and reading preferences stay synchronized between `https://www.corpusthomisticum.org/*` and the local offline archive (`http://127.0.0.1:8765/*`).
- ***Scriptum super Sententiis* (*Commentary on the Sentences*) & *Summa Contra Gentiles* Parallel English Corpus (`53,224` Total Sections):**
  - Integrated `Sentences.htm` and `Sent*.htm` (`Geremia/AquinasOperaOmnia`) + `Geremia23/AquinasLatinEnglish` (`289,470` parallel segments), adding `19,000+` verified sections of the *Commentary on the Sentences* (`snp0000.html`, `snp0001.html`, `snp1001.html`, `snp1003.html`, `snp1008.html`, `snp1009.html`, `snp1026.html`, and 98%–100% of Books II, III, and IV `snp2000.html`–`snp4050.html`) and `4,200` sections of *Summa Contra Gentiles* (`scg*.html`).
  - Added all `614` Question Prologues (`I q. 1 pr.`–`Suppl. q. 99 pr.`) and the General Prologue (`sth0000.html` — `Summa theologiae, pr.`) of the *Summa Theologiae*.
- **Side-by-Side Bilingual Reading Mode (`Side-by-Side EN` / Shortcut `B`):**
  - Added global topbar toggle (`#st-bilingual-toggle`) and tri-state per-paragraph toggle (`.st-para-side-btn`) that split paragraphs into a 2-column parallel layout (**Latin on the left**, **English reference translation on the right**) while keeping the **Interlinear Word-by-Word Gloss drawer underneath**.
- **5-Dictionary Integration Inside the Word Popup (`#st-popup`):**
  - Added **Ecclesiastical Latin Dictionary** (`20,154` entries) and **Wiktionary Latin-English & Victionarium Dictionary** (`23,006` offline entries + live `en.wiktionary.org` REST API enrichment), alongside **Thomistic Lexicon** (`1,950` entries), **Lewis & Short** (`22,637` entries), and **Whitaker's Words** (`38,088` entries).
- **3 Distinct Progressive Reading Modes (`Assisted`, `Guided Scholastic`, `Independent Reader`):**
  - `Assisted Reading`: Displays inline interlinear mini-glosses (`data-gloss`) directly beneath core Thomistic terms and saved learning words (`1–3`), plus unseen word dotted underlines and open Side Panel.
  - `Guided Scholastic`: Hides inline mini-glosses and unseen word underlines; highlights only core Thomistic philosophical/theological terms (`CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS`) and saved vocabulary (`1–3`).
  - `Independent Reader`: Auto-collapses the Side Panel and removes all Thomistic, unseen, and learned (`2–3`) highlights for distraction-free reading.
- **Popup & PhrasePump UX Enhancements:**
  - Added `🔊` (Ecclesiastical Latin TTS + syllabic phonetic guide), `⧉` (copy lemma & definition), `×` (close popup), and inline `✓ Saved` confirmation toast in `#st-popup`.
  - Added exercise mode selector (`#st-phrasepump-mode`), visual progress bar (`.st-phrasepump-progress-bar`), and `Space` key answer reveal (`ev.preventDefault()`) in `#st-phrasepump-modal`.

### Changed
- **Smart Scroll-Following & Viewport-Flipping Popup (`positionPopup`):**
  - `#st-popup` now tracks the selected word during page scroll and flips above the word (`data-placement="above"`) whenever space below is insufficient, keeping the `1 • New .. 4 • Known` rating bar at the top of the popup.
- **Multi-Threaded Offline Archive Server (`scripts/serve-archive.py`):**
  - Upgraded from `socketserver.TCPServer` to `socketserver.ThreadingTCPServer`.

### Removed
- Removed raw truncated stem keys (`s1`/`s2`) from `reconstruct_whitaker_lemma` in `scripts/build-dictionaries.py` (which previously caused `sumo` stem `"sum"` to overwrite `sum, esse` with `"take up"`).
- Removed unverified 4/5-word prefix fallback (`incipits`) from `src/core/sentence-translator.ts` and enforced a strict bidirectional full-paragraph content-word overlap gate (`overlap >= 0.70` and `reverse_overlap >= 0.65`), eliminating `358` false-positive translation matches.
- Removed `"Latin term in Corpus Thomisticum"` and `"Thomistic technical term (...):"` placeholder prefixes from interlinear gloss generation.

---

## [1.0.0] - 2026-11-03

### Added
- Initial release of **Schola Thomistica**:
  - Full offline mirror of `https://www.corpusthomisticum.org/` (`1,217` files, `111.72 MiB` in `archive/`).
  - Latin orthographic normalizer, enclitic parser, Whitaker morphological engine, context-aware Scholastic sentence disambiguator, and Scholastic grammar assistant.
  - Personal vocabulary store with Anki TSV / JSON export and FSRS v4.5/v5 spaced-repetition scheduler.
  - Manifest V3 browser extension with Scriptorium Parchment and Nocturne Dark Mode themes.
