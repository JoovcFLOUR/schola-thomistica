# Schola Thomistica — Feature Specification, QA Audit Checklist & Test Registry

**Product:** Schola Thomistica — Corpus Thomisticum Interactive Latin-Learning Platform & Offline Archive  
**Version:** `1.1.0` (Manifest V3 Browser Extension + Offline Archive Suite)  
**Target Environments:** Live `https://www.corpusthomisticum.org/*` and Local Offline Archive (`http://127.0.0.1:8765/*`)  
**Automated Verification Command:** `cd corpus-thomisticum && npm test` (`7/7` suites, `37/37` tests passing)

---

## 1. Executive Deliverable Summary (Auditor Quick-Check)

| Deliverable Category | Verified Metric / Artifact | Location in Repository |
|---|---|---|
| **Offline Website Mirror** | **1,217 crawled site files (111.72 MiB)** — `868` *Opera Omnia* HTML texts, `24` *Thomas-Lexikon* files, `27` navigation/subsidia pages, `5` stylesheets, `293` icons/assets (plus `manifest-archive.json`, `demo-reader.html`, and `_extension/` in `archive/`) | `corpus-thomisticum/archive/`<br>`archive/manifest-archive.json` |
| **Whitaker's Words Engine** | **38,088** dictionary entries + **1,797** inflection rules + irregular `UNIQUES` & `ADDONS` | `src/data/whitaker-dict.json`<br>`src/data/whitaker-inflects.json` |
| **Thomistic Lexicon (*Thomas-Lexikon*)** | **1,950** technical Scholastic & Thomistic headwords with Aquinas citations, Latin quotes, and philosophical axioms | `src/data/thomistic-lexicon.json` |
| **Ecclesiastical Latin Dictionary** | **20,154** Church, Liturgical, Vulgate, Patristic & Medieval Latin entries with Classical contrasts | `src/data/ecclesiastical-dict.json` |
| **Wiktionary (Latin-English & Victionarium)** | **23,006** pre-bundled entries + live on-demand `en.wiktionary.org` REST API enrichment on the live site | `src/data/wiktionary-latin.json` |
| **Lewis & Short Latin Dictionary** | **22,637** Classical & Late Latin entries (`A–Y`) reconstructed to full canonical lemmas | `src/data/lewis-short-core.json` |
| **Parallel English Reference Corpus** | **80,695 verified sections (`82.3%` of all paragraphs across the entire 868-file archive)** — *Summa Theologiae* (`99.8%`), *Summa Contra Gentiles* (`99.7%`), *Scriptum super Sententiis* (`86.5%`), *Quaestiones Disputatae* (*De Veritate* `94.8%`, *De Potentia* `98.9%`, *De Anima* `95.0%`, *De Spiritualibus Creaturis* `100%`, *De Virtutibus* `81.9%`, *Quodlibeta I–XII*), Aristotelian Commentaries (*Metaphysics* `99.6%`, *Ethics* `99.5%`, *Physics* `97.7%`, *De Anima* `99.9%`, *De Caelo* `99.3%`, *Posterior Analytics* `97.5%`, *Peryermeneias* `99.1%`), Biblical Commentaries (*Catena Aurea* `100%`, *John* `100%`, *Job* `100%`, *Psalms* `99.4%`, *Pauline Epistles*), and *Opuscula* (*De Ente et Essentia* `100%`, *De Principiis Naturae* `100%`, *Compendium Theologiae* `100%`, *De Regno* `100%`, *De Substantiis Separatis* `100%`, *Credo* `100%`, *Pater Noster* `100%`) | `src/data/summa-english.json` |
| **Manifest V3 Browser Extension** | Ready-to-load unpacked extension (`content.js` 157.4 KB 100% 7-bit ASCII, `study.js` 92.1 KB, external lazy-loaded `data/*.json` shards, `neutralize-perseus.js` MAIN-world script, `background.js`, `icons/`, `popup/`, `study/`) | `corpus-thomisticum/dist/extension/` |

---

## 2. Complete Feature Inventory & What the Software Delivers

### Subsystem A: Dual-Surface Operation (Live Internet Site + Complete Offline Archive)
1. **Live Internet Website Integration (`https://www.corpusthomisticum.org/*`):**
   - Automatically activates at `document_end` on any work page across `https://www.corpusthomisticum.org/*` and `http://www.corpusthomisticum.org/*`.
   - **Legacy Perseus Popup Neutralization (`neutralize-perseus.js`):** Runs a `"world": "MAIN"` content script + capture-phase `dblclick` listener so Corpus Thomisticum's built-in `document.ondblclick = goPage` (which otherwise opens an intrusive popup window to `perseus.tufts.edu`) is completely disabled (`window.document.ondblclick === null`).
2. **Complete Offline Website Archive (`archive/` & `scripts/serve-archive.py`):**
   - Contains all 1,217 files of Corpus Thomisticum with internal links rewritten to relative paths so the entire corpus works without internet access.
   - Multi-threaded local server (`ThreadingTCPServer` on `http://127.0.0.1:8765/`) serves all archived pages with the extension pre-injected.
3. **Cross-Origin State Synchronization (`chrome.storage.local` + `localStorage`):**
   - Saved vocabulary, FSRS spaced-repetition schedules, reading statistics, and UI preferences synchronize automatically between `https://www.corpusthomisticum.org/*`, `http://127.0.0.1:8765/*`, the toolbar popup (`popup.html`), and the Study Center (`study.html`).

---

### Subsystem B: Interactive Word Tokenization & Scroll-Anchored Smart Popup (`#st-popup`)
1. **Non-Destructive Latin Tokenization (`.ct-word`) & WCAG 2.2 AA Keyboard Ergonomics (`DEF-010`):**
   - Every Latin word inside `<P>` elements is wrapped in an interactive `<span class="ct-word">` with `data-word`, `data-lemma`, `data-familiarity="0..4"`, `data-thomistic`, `data-gloss`, and exact `data-char-offset` (verified `0` offset drift across `snp1001`–`snp4001` and `sth1001`), while preserving original `<SPAN CLASS="ref">` citation numbers (`[28236]`) and `<A NAME="...">` anchors intact.
   - Keeps total page tab stops `< 60` (no per-word `tabindex="0"`), provides a `#st-skip-link` to jump straight to the Side Panel, and marks `#st-popup` and `#st-phrasepump-modal` with `role="dialog"`, `aria-modal`, `aria-live="polite"` status toasts, `:focus-visible` outlines, and `prefers-reduced-motion: reduce`.
2. **Scroll-Anchored Smart-Flip Positioning (`positionPopup`):**
   - Tracks the selected word in real time during mouse-wheel scrolling (`scroll`) and window resizing (`resize`).
   - Measures the popup's actual rendered height (`popup.getBoundingClientRect().height`) and compares `spaceBelow` vs. `spaceAbove`:
     - Places **below** the word (`data-placement="below"`) when `spaceBelow >= naturalH`.
     - Automatically flips **above** the word (`data-placement="above"`, `top = rect.top - 8 - naturalH`) when the word is near the bottom of the screen, never covering ("swallowing") the clicked word and never clipping the rating buttons.
3. **Popup Header Actions & Sticky Top Rating Bar:**
   - **`🔊` Pronounce Button (`#st-popup-pronounce`):** Speaks the Latin word using Ecclesiastical phonology (`speechSynthesis`) AND displays an inline syllabic/phonetic guide (`🔊 Eccl. pronunciation: [sa-lu-tem]`).
   - **`⧉` Copy Button (`#st-popup-copy`):** Copies `headword — definition` to the clipboard and shows `✓`.
   - **`×` Close Button (`#st-popup-close`) & `Escape` Key:** Closes the popup and clears `.ct-selected` from the word.
   - **Top Familiarity Rating Bar (`1 • New`, `2 • Familiar`, `3 • Learned`, `4 • Known`):** Positioned above the dictionary list so rating a word requires zero inner scrolling on any screen height, with an immediate `✓ Saved "..." as ...` confirmation toast.

---

### Subsystem C: 5-Dictionary Comparison Engine (In-Popup & Side Panel `Lexica (5)`)
Clicking any Latin word immediately displays up to **5 distinct, deduplicated dictionary perspectives** both inside `#st-popup` and in the `Lexica (5)` tab:
1. **`Thomistic Lexicon` (*Thomas-Lexikon* & Curated Scholastic Layer):** Explains how St. Thomas Aquinas uses the term in metaphysics, psychology, ethics, and theology, complete with Latin usage quotations and Scholastic axioms.
2. **`Ecclesiastical Latin Dictionary`:** Church, Liturgical, Biblical (*Vulgata*), Patristic, and Medieval senses, explicitly contrasting Ecclesiastical meaning with Classical meaning (e.g., *sacramentum*: "sacred sign effecting grace" vs. Classical "military oath").
3. **`Wiktionary`:** Numbered Latin-English definitions + *Victionarium* etymologies, with automatic live `https://en.wiktionary.org/api/rest_v1/page/definition/{lemma}` enrichment when online.
4. **`Lewis & Short`:** Comprehensive philological definitions from the Perseus Project edition.
5. **`Whitaker's Words`:** Concise lexical glosses and full stem/ending morphological possibilities.

---

### Subsystem D: Context-Aware Scholastic Disambiguator & Grammar Assistant (`Context` Tab)
1. **Sentence-Level Morphological Disambiguation:**
   - Identifies the exact sentence containing the clicked word (without breaking on Roman numeral citations like `Eccli. III.` or `VI Metaphys.`).
   - Scores candidate parses using surrounding governing prepositions (`ad`, `in`, `de`, `ex`, `ab`, `cum`, `per`, `praeter`, `propter`, `secundum`), determiner agreement (`huius doctrinae` → Genitive Singular; `aliam doctrinam` → Accusative Singular), and subordinate clause triggers (`videtur quod`, `ut`, `ne`, `cum`, `licet`, `utrum`), explaining *why* that parse was selected.
2. **Literal vs. Contextual / Thomistic Nuance Card:**
   - Contrasts the literal/Classical sense with the contextual Thomistic meaning in that specific passage.
3. **Scholastic Disputatio Section Guide:**
   - Classifies each paragraph (`Prooemium`, `Obiectio / Argumentum`, `Sed Contra`, `Respondeo / Corpus`, `Responsio ad Obiecta`) and explains its dialectical role so learners never mistake an initial Objection (`Videtur quod...`) for Aquinas's own conclusion (`Respondeo dicendum quod...`).
4. **Scholastic Grammar Construction Detector:**
   - Detects and explains *Quod/Quia* substantive indirect discourse, Gerundives of Obligation (`dicendum quod`, `quaerenda sunt`), *Ad* + Accusative Gerund of Purpose (`ad docendum`), Subjunctive Purpose/Result/Cum/Licet clauses, Reduplicative `inquantum` specifications, Ablative Absolutes, and Accusative + Infinitive clauses.

---

### Subsystem E: Side-by-Side Bilingual Edition & Interlinear Gloss (`53,224` Sections)
1. **Global & Per-Paragraph Side-by-Side Bilingual Mode (`Side-by-Side EN` / Shortcut `B`):**
   - Clicking **`Side-by-Side EN`** in the topbar (or **`Side-by-Side English`** on an individual paragraph) expands the reading area into **two parallel columns**:
     - **Left Column (`.st-col-latin`):** Original interactive Latin text (left-aligned for clean word spacing).
     - **Right Column (`.st-col-english`):** Authoritative English reference translation aligned beside the Latin paragraph.
   - Tri-state per-paragraph override (`.st-bilingual-open` / `.st-bilingual-closed`) allows hiding or showing any single paragraph's English column even while global `Side-by-Side EN: ON` is active.
   - Verified with a **Bidirectional Full-Paragraph Vocabulary Overlap Gate (`overlap >= 0.70` & `reverse_overlap >= 0.65`)** across **53,224 sections** covering the three major translated works: ***Summa Theologiae*** (`97.5%` title-match coverage, Fathers of the English Dominican Province), ***Scriptum super Sententiis*** (`84.9%` title-match coverage, Aquinas Institute / Parallel Corpus), and ***Summa Contra Gentiles*** (`97.8%` title-match coverage, English Reference Edition), with accurate work-specific provenance headers (`DEF-008`, `DEF-009`).
   - If a paragraph has no bundled reference translation (such as untranslated *Opuscula*, *Quaestiones Disputatae*, or commentaries, which have `0.2%` bundled coverage), the right column displays a clean `"No Bundled Reference Translation"` card with a direct button to open the Interlinear Gloss below—never unverified machine prose.
2. **Expandable Interlinear Word-by-Word Gloss Drawer (`Show Parallel & Gloss`):**
   - Opens **underneath** the paragraph (capped at `max-height: 380px; overflow-y: auto`), rendering word-by-word cards (`Latin token` → `English contextual gloss` → `lemma • morphology`).
   - Automatically de-duplicates when `Side-by-Side EN` is active (showing only the interlinear word-by-word gloss in the bottom drawer since the reference translation is already visible in the right column).

---

### Subsystem F: 3 Distinct Progressive Reading Modes (`#st-reading-mode-select`)
1. **`Mode: Assisted Reading` (Beginner / Maximum Scaffolding):**
   - Displays **inline interlinear mini-gloss badges (`data-gloss` + `::after`)** directly underneath every core Thomistic term and saved learning word (`[Salvation]`, `[Being]`, `[Doctrine]`, `[Intellect]`, `[Potency]`, `[Act]`, `[End]`, `[Truth]`) right inside the Latin sentence.
   - Displays dotted underlines on unseen words (`fam 0`), rubric highlights on Thomistic terms, color coding on saved words (`1–3`), and opens the Side Panel.
2. **`Mode: Guided Scholastic` (Intermediate / Concept-Guided):**
   - Removes the inline mini-glosses and unseen (`fam 0`) underlines.
   - Highlights **only core Thomistic philosophical/theological terms** (`CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS`, in rubric tint) and your **saved vocabulary (`1 • New` amber solid, `2 • Familiar` blue dashed, `3 • Learned` green dotted)**.
3. **`Mode: Independent Reader` (Advanced / Distraction-Free Book Mode):**
   - Automatically collapses the Side Panel (`Side Panel: OFF`), removes all Thomistic, unseen (`0`), and learned (`2–3`) highlights, and softens paragraph toolbars, leaving clean printed-book Latin prose (highlighting only words explicitly marked `1 • New`).

---

### Subsystem G: Personal Vocabulary Collection, Custom Definitions & Annotations, PhrasePump & Anki FSRS Studio
1. **Lemma-Linked Custom Word Definitions & Personal Annotations (`#st-popup-note-editor` & `Vocab` Tab):**
   - Clicking **`+ Custom Definition / Note`** (or **`✎ Edit Definition / Note`**) inside `#st-popup` opens an inline editor for **My Custom Definition** (`#st-custom-def-input`) and **Personal Annotation / Study Note** (`#st-custom-note-input`) linked to the word's **lemma** across the entire Corpus Thomisticum.
   - When saved, a highlighted **`My Definition & Note`** card renders at the top of `#st-popup` (above the 5 dictionaries), all occurrences of that lemma on the page update their inline `data-gloss` badge to the user's custom definition, and the **Vocab** tab allows viewing and editing both fields inline (`Edit Note / Def.`).
2. **Personal Vocabulary Manager (`Vocab` Tab):**
   - Preserves original inflected word, lemma, headword, English translation, custom definition, personal notes, contextual meaning, POS, morphology summary, authentic Aquinas sentence, English sentence translation, work title, citation (`[28236] I q. 1 a. 1 co.`), URL, familiarity badge (`1 • New` .. `4 • Known`), tags, and FSRS card state.
   - One-click **Export Anki** (tab-separated Anki deck with `CustomDefinition` and `Notes` columns) and **Export JSON**.
2. **PhrasePump + Anki FSRS Spaced Repetition (`#st-phrasepump-modal` & `study.html`):**
   - Implements the **FSRS v4.5/v5** mathematical scheduler (`1 • Again`, `2 • Hard`, `3 • Good`, `4 • Easy`) with live interval previews (`10m`, `1d`, `3d`, `15d`).
   - Supports 5 selectable modes in `#st-phrasepump-mode`: `Mixed (All 4)`, `Sentence Cloze` (`[ _____ ]`), `Latin → English`, `English → Latin`, and `Scholastic Grammar`.
   - Full keyboard support (`Space` to reveal answer without scrolling background page, `1–4` to grade after reveal, `Esc` to close).

---

## 3. Traceable Test Registry (`TEST-ID` Matrix)

All automated tests run via `cd corpus-thomisticum && npm test` (`vitest run`).

| TEST-ID | Suite & Test File | Protected Requirement / Regression | Representative Input & Expected Observable Behavior | Status |
|---|---|---|---|---|
| `TEST-ARCH-001` | `tests/archive.test.ts` | Complete responsible archive of Corpus Thomisticum | Reads `archive/manifest-archive.json` and `sth1001.html`; verifies `>= 700` files (`1,217` actual), `> 50 MB`, core entrypoints, and `[28236]` Latin text integrity. | Covered (`PASS`) |
| `TEST-DATA-001` | `tests/data-pipeline.test.ts` | 5-Dictionary & 53,224-section Parallel Corpus compilation | Verifies `whitaker-dict.json` (`>35k`), `whitaker-inflects.json` (`>1.5k`), `thomistic-lexicon.json` (`>1k`), `lewis-short-core.json` (`>2k`), and `summa-english.json` (`ST`, `Super Sent. pr., q.1, lib. 1–4`). | Covered (`PASS`) |
| `TEST-NORM-001` | `tests/normalizer.test.ts` | Scholastic compounds, enclitics, citations & sentence splitting | Verifies `inquantum`/`idest`/`seipso`, `Deoque`/`secum` vs. non-enclitic `abstractive`/`ratione`/`utrumque`, `[1] Super Sent., pr.` stripping, and abbreviation-safe sentence splitting (`Eccli. III.`). | Covered (`PASS`) |
| `TEST-MORPH-001` | `tests/morphology-dictionaries.test.ts` | Morphological parsing, syncopated verbs, 5-dictionary deduplication & `sum` vs. `sumo` guard | Parses `doctrinam`, `investigantur`, `comprehendatur`, `altiora`, `entibus`, `quaesieris`, `esset`, `sapientia`; verifies 5 unique dictionary sources and ensures `sum`/`est`/`sit` never return `"take up"`. | Covered (`PASS`) |
| `TEST-CTX-001` | `tests/context-sentence.test.ts` | Contextual disambiguation, Scholastic grammar detector & interlinear gloss accuracy | Disambiguates `de ente` (Ablative), `praeter disciplinas` (Accusative), `huius doctrinae` (Genitive); detects *quod*-clauses and gerundives; verifies zero `"Thomistic technical term"` or `"divideed"` artifacts on `snp1001.html`. | Covered (`PASS`) |
| `TEST-FSRS-001` | `tests/fsrs-vocab-stats.test.ts` | FSRS v4.5/v5 scheduling monotonicity, Vocabulary CRUD/Anki export, PhrasePump & Coverage stats | Verifies `Again < Hard < Good < Easy` stability/interval growth, Anki TSV export, `[ _____ ]` cloze masking, and coverage % progression. | Covered (`PASS`) |
| `TEST-E2E-001` | `tests/e2e-integration.test.ts` | Real DOM enhancement (`sth1001.html`), 7-bit ASCII bundle, smart popup flip/scroll, QA fixes & Side-by-Side mode | Mounts `ScholaThomisticaReader` on `sth1001.html`; verifies `content.js` is 100% ASCII, `#st-popup.st-visible { display: block }`, `data-placement="above"` flip & scroll tracking, `Space`/`Enter` handlers, and `Side-by-Side EN` + `Interlinear Gloss`. | Covered (`PASS`) |

---

## 4. Field Audit Checklist for QA Auditors & Beta Testers

Use this 10-point checklist to audit the live extension in Chrome/Edge/Brave (`https://www.corpusthomisticum.org/sth1001.html` and `https://www.corpusthomisticum.org/snp1001.html`):

- [ ] **1. Live Injection & Legacy Popup Suppression:** Open `https://www.corpusthomisticum.org/sth1001.html`. Confirm the `#st-topbar` appears at the top, and **double-clicking** any Latin word does **not** open a popup window to `perseus.tufts.edu`.
- [ ] **2. 3 Progressive Reading Modes:** In the topbar dropdown, switch between:
  - `Mode: Assisted Reading` → Verify inline mini-gloss tags (`[Salvation]`, `[Being]`, `[Doctrine]`, `[Intellect]`) appear directly beneath key Thomistic terms in the Latin text.
  - `Mode: Guided Scholastic` → Verify inline mini-gloss tags disappear, leaving rubric highlights only on Thomistic technical terms and saved words.
  - `Mode: Independent Reader` → Verify the Side Panel collapses (`Side Panel: OFF`) and all Thomistic/unseen highlights disappear for clean book reading.
- [ ] **3. Word Click & 5-Dictionary Popup (`#st-popup`):** Click `salutem` (in `[28236] Iª q. 1 a. 1 co.`). Verify the popup opens immediately showing:
  - Headword `salus, salutis (f.)`, `Thomistic Term`, `Noun`, and `Accusative, Singular, Feminine, 3rd declension`.
  - Context reason: `Governed by the preposition "ad" (+ Accusative case) in "ad ... salutem"`.
  - Rating bar (`1 • New` .. `4 • Known`) at the top of the popup.
  - All **5 dictionary badges** (`Thomistic Lexicon`, `Ecclesiastical Latin Dictionary`, `Wiktionary`, `Lewis & Short`, `Whitaker's Words`) with zero duplicate source badges.
- [ ] **4. Popup Scroll Tracking & Smart Bottom Flip:** With `#st-popup` open on a word, scroll the page with the mouse wheel. Confirm the popup follows the word smoothly, and when the word approaches the bottom of the screen, the popup automatically flips **above** the word (`data-placement="above"`) without covering it.
- [ ] **5. Popup Action Buttons (`🔊`, `⧉`, `×`) & Rating Feedback:** Click `🔊` (confirm phonetic guide `🔊 Eccl. pronunciation: [salutem]` appears), click `⧉` (confirm it changes to `✓`), and click `1 • New` (confirm `✓ Saved "salus" as New (Learning)` appears and all occurrences of `salus`/`salutem` highlight in amber).
- [ ] **6. Side-by-Side Bilingual Mode (`Side-by-Side EN` / Shortcut `B`):** Click `Side-by-Side EN` in the topbar (or press `B`) on `sth0000.html`, `sth1001.html`, `snp0001.html`, `snp1001.html`, `snp2001.html`, and `scg1001.html`. Confirm the Latin text shifts to the left column and the aligned English translation appears in the right column. Click `Hide Side-by-Side` on a single paragraph to verify individual column hiding works while global mode is ON.
- [ ] **7. Interlinear Word-by-Word Gloss Drawer (`Show Parallel & Gloss`):** Click `Show Parallel & Gloss` on any paragraph in `snp1001.html`. Confirm the bottom drawer opens (scroll-capped at `380px`) and every word card shows its accurate English gloss and morphology with zero `"Thomistic technical term"` placeholders.
- [ ] **8. Side Panel Tabs (`Context`, `Lexica (5)`, `Vocab`, `Stats`):** Open `Lexica (5)`, type `substantia` in the search box, and press `Enter` — confirm all 5 dictionary cards update. Open `Vocab` and click `Export Anki` — confirm valid tab-separated Anki deck output appears.
- [ ] **9. PhrasePump FSRS Active Recall Modal (`PhrasePump Review` / Shortcut `R`):** Click `PhrasePump Review`. Confirm the Mode Selector (`5` modes) and Progress Bar appear. Press `Space` — confirm the answer reveals **without** scrolling the background page. Press `3` (`Good`) — confirm the FSRS interval updates and advances to the next exercise.
- [ ] **10. Nocturne Dark Mode (`Nocturne` / Shortcut `D`) & Font Scaling (`A-` / `A+`):** Press `D` to toggle Nocturne Dark Mode — confirm high-contrast dark surfaces, preserved familiarity highlights, and distinct dictionary badge colors. Click `A+` up to `26px` and `A-` down to `14px` — confirm both Latin and English columns scale harmoniously and buttons disable at the bounds.
