# INDEPENDENT SOFTWARE QUALITY AUDIT — Schola Thomistica

**Audit date:** 2026-11-11
**Version audited:** 1.1.0 (manifest) / 1.0.0 (`package.json`)
**Auditor:** independent, evidence-based
**Environment:** Linux arm64 (Raspberry Pi), Chromium via headless CDP, Node 22 + Vitest 2.1.9, JSDOM 25

> All execution claims below were reproduced in this session. No production file was modified. Temporary probe tests were created and then deleted; `npm test` was re-run afterwards (37/37 pass).

---

## A. Executive Summary

**Product:** Schola Thomistica — Manifest V3 browser extension + 918-page offline Corpus Thomisticum archive, with tokenization, 5-dictionary lookup, contextual Scholastic parsing, bilingual alignment, vocabulary persistence, and FSRS/PhrasePump review.

**Overall assessment:** The engineering foundation is real and largely works. The archive is authentic and internally consistent, tokenization is non-destructive, the popup/reading modes/side-by-side/FSRS flows work in a real browser, and the claimed 37 automated tests genuinely pass. However, the headline **cross-surface synchronization feature has a data-loss defect**, the **Study Center does not use the shared store at all**, and the **51 MB bundle makes every page take ~5 s to become interactive**. Several linguistic-accuracy defects contradict the product's central promise ("5 distinct, deduplicated dictionary perspectives"), and the documentation overstates both translation provenance and corpus coverage.

**Most important findings**

| # | Severity | Finding |
|---|---|---|
| DEF-001 | **CRITICAL** | Vocabulary saved on one surface (live vs. offline) is silently overwritten by stale `localStorage` from the other. Direct probe: `localStorage=1`, `chrome.storage=2` → reader loaded only 1 entry. |
| DEF-002 | HIGH | Study Center reads only its own `localStorage` (empty in the extension origin), ignores `chrome.storage.local`, seeds a default deck, and **never persists reviews**. |
| DEF-003 | HIGH | `content.js` is 51,095,922 bytes (and `study.js` 51,037,983). Real-browser measurement: DOMContentLoaded **5,066 ms**, content.js 1,744 ms, JS heap **124.5 MB** — on a local server. |
| DEF-004 | MEDIUM | `uterque` family (`utrumque` 2,214×, `utraque` 981×, `utriusque` 778×, `uterque` 398×, `utrique` 316×) returns **0 dictionary sources**, POS "Latin Word", meaning = the word itself. |
| DEF-005 | MEDIUM | Super Sent. citation-prefix mis-strip shifts character offsets: 272/6,139 token offsets non-exact and 50 sentence misselections on `snp1001.html`, up to 10/33 in an affected paragraph. |
| DEF-006 | MEDIUM | Enclitic over-splitting: `denique` (113×) → lemma **decem**; `quousque` (266×) → headword `quous`; `quandoque` (5,204×) → lemma `quando`. |
| DEF-007 | MEDIUM | Grammar detector false positive (`ad secundum` → "Ad + Accusative Gerund of Purpose") and false negative on the spec's own example `ad ostendendam veritatem`. |
| DEF-008 | MEDIUM | Every reference translation is labelled "Dominican Fathers, Summa Theologiae", including Super Sent. and SCG, which are **not** that translation. |
| DEF-009 | MEDIUM | Spec claims verified translations for De Ente, Compendium, Principium, Credo, Pater Noster, Ave Maria. Measured: **zero** entries for those works. |
| DEF-010 | MEDIUM | Every Latin word is `tabindex="0"`: **4,543 tabbable words / 4,706 focusables** on one page, with no skip link or focus-visible styling. |
| DEF-011 | MEDIUM | `neutralize-perseus.js` runs in MAIN world on **every** `http://localhost/*`, `127.0.0.1/*`, and `file:///*` page and overwrites `window.goPage` / `document.ondblclick`, breaking unrelated local apps. |

---

## B. Product Requirements Assessment

Legend: **VERIFIED** = reproduced with direct evidence; **PARTIAL** = works only in conditions or with defects; **NOT IMPLEMENTED** = promised but absent; **NOT TESTED** = could not be verified in this environment.

| Feature (from spec/README) | Promised behavior | Verification | Result | Evidence |
|---|---|---|---|---|
| Offline archive completeness | 1,217 files / 111.72 MiB, 868 Opera Omnia, 24 Lexikon, 27 nav, 5 CSS, 293 icons | Counted and diffed against `manifest-archive.json` | **VERIFIED (with doc nit)** | Manifest internally consistent: 1,217 files, byte sum exactly 117,151,250; every manifest path exists, all sizes match. Directory has 1,221 = 1,217 + `manifest-archive.json` + `demo-reader.html` + 2 `_extension/` files; disk 160.6 MiB. |
| Offline link rewriting | All internal absolute links relative; site works offline | Parsed 22,497 internal `href/src` across 918 HTML files | **PARTIAL** | Zero `corpusthomisticum.org` absolute refs remain. 20 broken refs (0.09%): 3 MP3, 4 PDF, 2 malformed `href`, `/it/`, scheme-less external hosts. |
| Offline server + injection | `serve-archive.py` injects CSS/JS into every page | Started server, HTTP GET | **VERIFIED** | `sth1001.html` HTTP 200, injected `/_extension/content.css` + `content.js`; `/_extension/content.css` HTTP 200. |
| Genuinely offline operation | "works 100 % offline, including dictionary lookup" | Real browser resource trace after word click | **PARTIAL** | Bundled lookup works, but the page issued `https://en.wiktionary.org/api/rest_v1/page/definition/salus`. Not hermetic; leaks looked-up lemmas. |
| Non-destructive tokenization | Preserve text, citations, anchors, structure | Compared pre/post DOM text and anchors | **VERIFIED** | Original paragraph text === `.st-col-latin` text (probe). Anchors 66→66 (`sth1001`), 92→92 (`snp1001`), 67→67 (`scg1001`); `.ref` spans preserved. |
| Word click → 5 dictionaries | Up to 5 distinct, deduplicated perspectives | Browser click on `salutem` | **VERIFIED for curated words / PARTIAL overall** | 5 unique badges: Thomistic, Ecclesiastical, Wiktionary, Lewis & Short, Whitaker. But fallback entries reuse Whitaker senses under other badges, and DEF-004 shows common words with 0 badges. |
| Contextual disambiguation | Preposition/modifier/subjunctive scoring with reason | `salutem` click | **VERIFIED (example)** | Reason: `Governed by the preposition "ad" (+ Accusative case) in "ad ... salutem"`; parse Accusative Singular Feminine. |
| Sentence finding | Exact containing sentence | Probe on 4 archive pages | **PARTIAL** | `sth1001`, `sth0000`, `scg1001`: 100 % exact. `snp1001`: 272/6,139 offsets shifted, 50 misselections (DEF-005). |
| Scholastic section guide | Classify Prooemium/Objection/Sed Contra/Corpus/Reply | Observed badges on rendered page | **VERIFIED** | Section badges rendered (`Prooemium`, `Obiectio`, `Respondeo (Corpus)`, etc.). |
| Grammar assistant | Detect quod, gerundive, ad+gerund, cum/licet, ablative absolute, ACI | Ran `detectGrammarConstructions` | **PARTIAL** | FP on `ad secundum`; FN on `ad ostendendam veritatem` (DEF-007). |
| 3 reading modes | Assisted → glosses; Guided → only Thomistic/saved; Independent → clean + panel off | Real browser, computed styles | **VERIFIED** | Gloss `::after` = `"Necessary"` in assisted, `none` in guided/independent; independent sets `st-panel-collapsed`. |
| Smart popup positioning | Below/above flip, follow scroll/resize, never cover word, no clipping | Real browser at two scroll positions | **VERIFIED** | Below at word y=291 → popup 334–604 (fits 616 px viewport); near bottom word 546–581 → placement `above`, popup 83–538, no overlap, rating bar visible. |
| Popup actions (🔊, ⧉, ×, Esc) | Pronounce, copy, close, toast | Browser DOM inspection | **PARTIAL** | Buttons present and wired; clipboard has no fallback and failures are silent. `speechSynthesis` NOT TESTED (headless). |
| Side-by-side bilingual | Two columns, per-paragraph override, 53,224 sections | Browser toggle + corpus analysis | **PARTIAL** | 66/66 paragraphs populated on `sth1001`; tri-state works. Corpus coverage: ST 97.5 %, Super Sent 84.9 %, SCG 97.8 %, other works **0.2 %**; provenance label wrong (DEF-008/009). |
| Interlinear gloss drawer | Word cards with accurate gloss + morphology | Browser click | **VERIFIED (rendering)** | Drawer opens, shows reference + interlinear; gloss quality is heuristic (see C). |
| Vocabulary save/CRUD/export | Preserve full context, Anki TSV + JSON | Browser save + `Export Anki` | **VERIFIED** | Toast `✓ Saved "salus" as New`; all 4 occurrences updated; Anki header and 4 TSV rows produced. |
| FSRS v4.5/v5 | Again<Hard<Good<Easy, intervals, persistence | Browser PhrasePump | **VERIFIED** | 5 modes; Space reveals; grade 3 → `reps=1`, `scheduledDays=3`, `state=review`, familiarity 2. |
| Cross-surface sync | Vocabulary/stats/prefs sync across live, offline, popup, Study Center | Logic probe with mocked `chrome.storage` | **FAILED** | DEF-001: stale localStorage wins; DEF-002: Study Center ignores shared store. |
| Dark mode / font scaling | Toggle; 14–26 px; buttons disable at bounds | Browser | **VERIFIED** | `D` toggles `st-dark-mode`; 40×A+ → 26 px + disabled; 40×A− → 14 px + disabled. |
| Live-site legacy popup suppression | `document.ondblclick === null`, no Perseus popup | Static + dist bundle | **NOT TESTED (extension context)** | MAIN-world script exists (`dist/extension/neutralize-perseus.js`) and `init()` nulls in the isolated replica, but unpacked-extension loading on the live site could not be exercised. |
| MV3 compliance | Valid manifest, permissions, workers | Manifest inspection | **VERIFIED (static)** | MV3 fields valid; `background.type=module`; content scripts; no `eval`/`new Function` in bundle; `dist` manifest identical to `src`. |

---

## C. Quality Assessment (ISO/IEC 25010)

**Functional suitability — PARTIAL.** Core reading loop is functional and pleasant. Completeness (5 dictionaries) is not met for common pronoun classes; correctness of context/sentence assignment is compromised on Super Sent. pages; grammar explanations can be wrong (both directions). Correctness of curated Thomistic entries is good (`sacramentum` clerical vs. classical "oath" verified).

**Performance efficiency — FAIL.** 51 MB script per page; measured 5.07 s to DOMContentLoaded and 124.5 MB heap on localhost. Every archived page loads a second 51 MB copy from `archive/_extension/`; the Study page loads a third 51 MB bundle. No code-splitting or lazy dictionary loading. This is the dominant non-functional weakness.

**Compatibility — PARTIAL.** Chrome/Edge targets only; `file://` requires the user to enable "Allow access to file URLs" (undocumented). The MAIN-world script runs on all localhost/file pages, so coexistence with other local apps is unsafe. No cross-browser testing evidence (Brave/Firefox unsupported by MV3 API set used).

**Interaction capability / Accessibility — WEAK (partial).** Visual design is coherent, dark mode and font scaling work, keyboard shortcuts are documented and functional. But 4,543 tab stops per page, no skip link, no `aria-live` for the saved toast, popup/modal have no `role="dialog"`/focus management, no `:focus-visible` styling, no `prefers-reduced-motion`. This is a serious WCAG 2.2 AA obstacle (2.4.3, 2.1.1, 4.1.2, 2.3.3).

**Reliability — PARTIAL.** Storage fallbacks catch exceptions; archive files are atomic writes; manifest matches disk. But the sync path silently discards data, and the live Wiktionary request has no timeout/abort.

**Security — ADEQUATE for the narrow threat model.** No XSS found: every interpolation into `innerHTML` passes through `escapeHtml` (`& < > "`); values are attributes on double-quoted templates. No `eval`/`new Function`, no remote code, no telemetry. Weaknesses are over-broad host matching (all localhost ports + `file://`), `web_accessible_resources` matching `<all_urls>`, privacy leak to Wikimedia on every lookup, and no icons/least-privilege review. No broken access control or CSRF surface (no backend).

**Maintainability — PARTIAL.** Clear module boundaries (`core/` pure, `extension/` UI), typed interfaces, consistent naming, good separation of dictionaries/morphology/context/FSRS. But `reader-controller.ts` is 1,847 lines with large inline HTML strings; duplicated constants (`INLINE_THOMISTIC_GLOSSES` vs `CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS`); dead code (`cleanPresetGloss`, `summaIncipits`); a typo (`hed: 'shed'`); stale README; no lint/type-check script in `package.json` (`tsc` is never run in CI).

**Flexibility / installability — PARTIAL.** Build is one command and reproducible; archive rebuild is resumable. The 51 MB bundle and monolith make replacement/adaptation costly.

**Safety — N/A.** No physical or safety-critical domain; consequence of failure is learning-data loss and misleading pedagogy, already covered above.

---

## D. Test Execution Results

**Command:** `cd corpus-thomisticum && npx vitest run`

| Metric | Result |
|---|---|
| Test files | **7 passed / 7** |
| Tests | **37 passed / 37** |
| Duration | 79.2 s (first run), 55.2 s (final confirmation) |
| Skipped / blocked | 0 / 0 |
| Reproduced claim | **Confirmed** (spec says 7/7, 37/37) |

**Assertion quality:** mixed. Strong content assertions exist (`I q. 1 a. 1 co.` English text, 5 sources for core terms, ASCII bundle, popup flip). Weak spots: `again.scheduledDays <= hard.scheduledDays` is trivially true (0 ≤ 1); archive test only asserts `>= 700` files; data-pipeline test accepts `scientia || doctrina`; the E2E test never asserts the popup stays within the viewport or that `data-char-offset` matches `data-clean-text`.

**Additional tests created for this audit (temporary, since deleted):**
1. Offset-fidelity probe across `sth1001`, `snp1001`, `sth0000`, `scg1001` — discovered DEF-005.
2. Cross-origin sync probe with mocked `chrome.storage` — confirmed DEF-001.
3. Study Center probe with mocked `chrome.storage` — confirmed DEF-002.
4. Enclitic corpus scan — found `denique`/`quousque`/`quandoque`.
5. Corpus coverage/title-match analysis — found DEF-009 and duplicate mappings.
6. Grammar-detector probes — confirmed DEF-007.
7. Real-browser performance/UX probes (headless Chromium).

**Coverage gaps (requirements without adequate tests):** cross-surface synchronization; Study Center persistence; Super Sent. offsets; enclitic false positives; `uterque` family; translation provenance; accessibility/tab order; archive-server injection; live-site MAIN-world neutralization; clipboard/speech.

---

## E. Defect Registry (ordered by severity)

### DEF-001 — CRITICAL — Cross-surface vocabulary synchronization destroys saved entries

- **Component:** `src/extension/reader-controller.ts:101-131` (hydrate), `:137-156` (persist)
- **Description:** Hydration loads `localStorage` first, then loads `chrome.storage.local` **only if** `this.vocabStore.getAll().length === 0`. A non-empty page-local `localStorage` therefore permanently shadows the shared store.
- **Reproduction:** Mock `localStorage` with 1 entry and `chrome.storage.local` with 2; construct `ScholaThomisticaReader` and `init()`. Probe output: `localStorage=1 chrome.storage=2 -> reader loaded: ["doctrina"]`; fresh `salus` absent.
- **Expected:** The union/newest snapshot from `chrome.storage` is authoritative across both origins.
- **Actual:** Stale local snapshot wins; the next `persistState()` writes that stale snapshot back to `chrome.storage`, deleting entries saved on the other surface.
- **Evidence:** Probe transcript above; code path at lines 109-116 and 145-151.
- **Root cause:** "Only hydrate if empty" heuristic instead of merge-by-`updatedAt`/entry-id.
- **Consequences:** Silent loss of user-created vocabulary and FSRS history — the core data of the product — for any user who reads both the live site and the offline archive (a headline workflow).
- **Recommended correction:** Always merge snapshots: union entries by `id`/normalized lemma, prefer the newer `updatedAt`, preserve `reviewHistory`; make `chrome.storage` authoritative and mirror to `localStorage`. Add a `storage.onChanged` listener to live-update.
- **Verification test:** Load stale local + newer shared snapshots, assert both entries exist and the newer one wins; then save and assert `chrome.storage.set` received the union.

### DEF-002 — HIGH — Study Center ignores `chrome.storage` and never persists reviews

- **Component:** `src/extension/study/study.ts:12-17` (read), `:96-104` (review), no write path
- **Description:** The Study Center reads `localStorage` of the extension origin (normally empty), seeds two hard-coded cards, and calls `store.reviewEntry()` on an in-memory store without saving.
- **Reproduction:** Mock `chrome.storage.local` with two user entries, empty `localStorage`, load the page. UI renders the seeded sentence `Necessarium igitur fuit ... sacram [ _____ ]`; user words absent; review updates are not written anywhere.
- **Expected:** Shows the user's vocabulary and persists FSRS reviews to the shared store (spec §A.3, §G.2).
- **Actual:** Independent throw-away store; seeded dummy content; reviews lost on close.
- **Evidence:** Probe: `localStorage entries=0; shows user word 'salutem'? false`; static grep shows only `localStorage` at `study.ts:13`.
- **Root cause:** Study page implemented before the `chrome.storage` sync layer and never migrated.
- **Consequences:** The promised "Study Center" sync is non-functional; a user can study and lose all progress.
- **Recommended correction:** Use `chrome.storage.local.get/set` with the same merge logic as DEF-001; remove seeding when a snapshot exists; persist after each rating.
- **Verification test:** Seed shared store, open Study Center, grade a card, reload, assert `reps`/due persisted and user word (not seed) shown.

### DEF-003 — HIGH — 51 MB bundle per page; ~5 s to interactive

- **Component:** `dist/extension/content.js` (51,095,922 B), `study/study.js` (51,037,983 B), `archive/_extension/content.js`; `manifest.json:46-61`
- **Description:** All seven JSON datasets (≈51 MB) are statically imported into the content bundle, which is injected into every matching page. The archive server also serves a second copy.
- **Reproduction / evidence (real Chromium, local server):** navigation timing `domContentLoaded=5066 ms`, `loadEvent=5075 ms`; resource `content.js duration=1744 ms`; JS heap `124.5 MB`; Node compile of the bundle `1028 ms`, heap 173 MB.
- **Expected:** Page interactive in well under a second on a local archive; memory proportional to page.
- **Actual:** Multi-second main-thread block and >100 MB heap on every page, including pages where the reader is not activated.
- **Root cause:** No lazy loading; dictionaries are eagerly bundled and deserialized.
- **Consequences:** Battery/CPU drain, poor mobile/low-end performance, apparent "hang" on older hardware. On the live site this repeats per navigation.
- **Recommended correction:** Ship dictionaries as separate extension resources loaded on first word click (`fetch(chrome.runtime.getURL(...))` or IndexedDB), or split per dictionary and lazy-import; defer heavy indexes until `analyzeWord` is first called; precompute a compact lemma index.
- **Verification test:** Assert initial bundle < 2 MB; measure TTI < 500 ms on the same page; verify first-click lookup still returns 5 sources.

### DEF-004 — MEDIUM — `uterque` family returns zero dictionaries

- **Component:** `src/core/morphology.ts` (`parseWordMorphology`, unused `tackons`), `src/core/dictionaries.ts:328-418`
- **Reproduction:** `analyzeWord('utrumque')` → `lemma=utrumque pos=Latin Word sources=0 meaning=utrumque`; same for `uterque`, `utraque`, `utriusque`, `utrique`.
- **Corpus frequency:** `utrumque` 2,214, `utraque` 981, `utriusque` 778, `uterque` 398, `utrique` 316 (≈4,687 occurrences).
- **Expected:** A pronoun parse and at least Wiktionary/Whitaker meaning.
- **Actual:** No parse, no dictionary, no translation — the popup shows the bare token.
- **Root cause:** None of the four lookup maps contains `uterque`; Whitaker stores `uter` + enclitic `-que` via `tackons`, but `parseWordMorphology` never applies `whitakerDict.tackons`. `NON_ENCLITIC_QUE` correctly prevents splitting, but no fallback reconstructs the lemma.
- **Consequences:** ~4,700 clicks yield no learning value; contradicts "clicking any Latin word immediately displays up to 5 dictionaries".
- **Recommended correction:** Implement Whitaker tackon/prefix/suffix processing; add `uterque` declension to the pronoun map; add lemma aliases (`utrumque → uterque`) to the lookup candidates.
- **Verification test:** Assert ≥2 sources and a non-token meaning for the five forms.

### DEF-005 — MEDIUM — Super Sent. citation prefix mis-strip shifts offsets and sentence selection

- **Component:** `src/core/normalizer.ts:337-360`, `src/extension/reader-controller.ts:518, 540-546, 768-770`
- **Reproduction:** `snp1001.html`, paragraph `Super Sent., lib. 1 d. 1 q. 1 a. 2 s. c. 2`. Pre-tokenization text begins `<a name="90"><span class="ref">[90] Super Sent., lib. 1 d. 1 q. 1 a. 2 s. c. 2 </span></a>Praeterea...`. `data-clean-text` = `"1 a. 2 s. c. 2 Praeterea, ..."` — only `[90] Super Sent., lib.` was stripped, leaving 15 chars. The tokenizer skips `.ref` entirely, so `data-char-offset` starts at 0 while the clean text's `Praeterea` is at index 15 → `delta=-15`.
- **Measured:** 272/6,139 non-exact offsets; 50/6,139 sentence misselections; up to 10/33 tokens in one paragraph; 89 archive files contain "Super Sent.".
- **Expected:** Clean text and token offsets share one origin.
- **Actual:** `findContainingSentence()` searches an offset 15 chars too low → wrong sentence for words late in the paragraph (affects context reason, grammar notes, interlinear gloss, saved sentence translation).
- **Root cause:** Two different notions of "paragraph text" — citation-stripping regex vs. tokenizer's `.ref` skipping — are not reconciled.
- **Consequences:** Incorrect Thomistic context for a large corpus (Scriptum super Sententiis), exactly where the pedagogical value is highest.
- **Recommended correction:** Strip the entire leading `[n] ... citation` block using the same logic for both; or count `.ref` text in `charCounter`; assert `cleanText[offset]` starts the token at tokenization time.
- **Verification test:** For every enhanced paragraph, assert `data-char-offset === cleanText.indexOf(token, cursor)`; assert sentence selection equals the true sentence; run on `snp1001` and a `lib. 1–4` sample.

### DEF-006 — MEDIUM — Enclitic false positives corrupt lemmas

- **Component:** `src/core/normalizer.ts:54-135, 255-271`
- **Evidence:** `denique` → base `deni`, lemma **`decem`**, headword `decem`, but meaning text of *denique* — internally inconsistent. `quousque` → headword `quous`, POS "Latin Word". `quandoque` → lemma `quando` (5,204 occurrences).
- **Frequency:** `denique` 113, `quousque` 266, `quandoque` 5,204; `utrumque`/`utroque`/`plerumque` correctly protected.
- **Root cause:** `NON_ENCLITIC_QUE` is an incomplete deny-list; no dictionary-validated check before splitting.
- **Consequences:** Wrong headword/lemma and inconsistent gloss for common Scholastic connectives.
- **Recommended correction:** Only split `-que` when the full word has no dictionary entry and the base does; add `denique`, `quousque`, `quandoque`, `denuo`-class words to the deny-list.
- **Verification test:** Assert `denique` lemma is `denique` and `quousque` has a definition.

### DEF-007 — MEDIUM — Grammar detector both over- and under-fires

- **Component:** `src/core/context-analyzer.ts:196-212, 215-258`
- **Evidence:** `"Et sic ad secundum patet responsio."` → `Ad + Accusative Gerund / Gerundive of Purpose` (wrong: "to the second objection"). `"Ad ostendendam veritatem procedit."` → **no notes at all** (the spec's own example is missed). Regex `\w+nd(um|a|us|i|o|ae|is|os|as)` cannot match `-ndam` because `\b` follows `a` before `m`; the outer guard fails, so the inner `am` branch never runs.
- **Consequences:** Misleading grammatical instruction in both directions — pedagogically damaging.
- **Recommended correction:** Match `-nd(am|um|os|as|ae|is|i|o|orum|arum)` without a trailing `\b`; require a following noun/verb; exclude ordinal `secundum`; add regression cases from the spec.
- **Verification test:** Positive `ad ostendendam veritatem`, negative `ad secundum`.

### DEF-008 — MEDIUM — Wrong translation attribution

- **Component:** `src/extension/reader-controller.ts:666, 720, 1350`
- **Description:** Labels are hard-coded "English Reference Translation (Dominican Fathers, Summa Theologiae)" for every work.
- **Evidence:** `summa-english.json` includes Super Sent. and SCG sourced from `Geremia/AquinasOperaOmnia` + `Geremia23/AquinasLatinEnglish` (`scripts/build-dictionaries.py:1280-1315, 1487-1499`). The Dominican Fathers 1920 translation covers the Summa only.
- **Consequences:** False scholarly attribution; undermines trust in an academic tool.
- **Recommended correction:** Store `source`/`translator` per section in the JSON and render it; use a neutral `"Reference translation"` when unknown.
- **Verification test:** Assert the label for a Super Sent. citation does not say "Dominican Fathers".

### DEF-009 — MEDIUM — Parallel corpus coverage is overstated

- **Component:** `QA_AUDIT_AND_FEATURES.md:84`, `README.md:32`, `src/data/summa-english.json`
- **Evidence:** 53,224 sections total; zero keys containing `De ente`, `Compendium`, `Principium`, `Credo`, `Pater`, `Ave`, `Quaestio`, `Quodlibet`, `De potentia`, `De veritate`, `De malo`. Title-match coverage: ST 97.5 %, Super Sent 84.9 %, SCG 97.8 %, **other works 0.2 %** (65/39,732 unique titles). README also says 29,505 sections and 7,851 Lewis & Short entries, while the actual files contain 53,224 and 22,637; `thomistic` is 1,950 not 1,949; `package.json` version 1.0.0 vs manifest 1.1.0.
- **Consequences:** Auditors and users expect side-by-side English for works that will show "No Bundled Reference Translation".
- **Recommended correction:** Correct the feature list to the three translated works; publish per-work coverage; generate docs from the data.

### DEF-010 — MEDIUM — Tab order unusable; dialogs not accessible

- **Component:** `reader-controller.ts:519` (`tabindex="0"` on every token), `content.css`, popup/modal templates
- **Evidence:** Browser measurement: 4,543 tabbable `.ct-word`, 4,706 focusable elements on `sth1001.html`.
- **Expected:** Text is navigable efficiently; interactive words reachable but not 4,500 tab stops.
- **Actual:** Keyboard users must traverse every word before reaching the side panel; no skip link; popup/modal lack `role="dialog"`, `aria-modal`, focus trap or initial focus; toast lacks `aria-live`; no `prefers-reduced-motion`.
- **Recommended correction:** Remove `tabindex` from words (use a single roving-tabindex container or `tabindex="-1"` + click/Enter on the paragraph), add a skip link, dialog semantics and focus management, `aria-live="polite"` toast, and a reduced-motion media query.
- **Verification test:** Assert tab stops < 60 per page; axe/WCAG 2.2 AA audit.

### DEF-011 — MEDIUM — Over-broad MAIN-world script and host permissions

- **Component:** `src/extension/manifest.json:29-45`, `scripts/build-extension.mjs:33-37`
- **Description:** `neutralize-perseus.js` matches `http://localhost/*`, `http://127.0.0.1/*`, and `file:///*` and unconditionally sets `document.ondblclick = null; window.goPage = function(){}`. The 51 MB content script also matches all those pages.
- **Consequences:** Any local dev server or local HTML file that uses `goPage` or double-click loses that behavior; performance hit on unrelated apps.
- **Recommended correction:** Restrict both content scripts to `*://*.corpusthomisticum.org/*`; use `activeTab`/optional host permissions for the offline server, scoped to port 8765 and a title check. Add `web_accessible_resources.matches` limited to the corpus hosts instead of `<all_urls>`.

### DEF-012 — LOW — Archive is not hermetic (live Wiktionary request on click)

- **Component:** `src/core/dictionaries.ts:461-513`, `reader-controller.ts:789-801`
- **Evidence:** Real-browser resource trace after clicking `salutem`: `https://en.wiktionary.org/api/rest_v1/page/definition/salus` (only external request). No timeout/abort.
- **Consequences:** Contradicts "100 % offline"; sends each looked-up lemma to Wikimedia; offline clicks may linger.
- **Correction:** Gate live enrichment behind an online/`navigator.onLine` check and a user setting; add `AbortController` with 3 s timeout; skip in the offline server mode (`127.0.0.1`).

### DEF-013 — LOW — Two hand-coded sections share one translation

- **Evidence:** `Super Sent., q. 1 a. 3 qc. 2 co.` === `... qc. 2 ad 1`; `qc. 3 co.` === `... qc. 3 ad 1`; both keys exist in the archive and render. Source: `build-dictionaries.py:1349-1365`.
- **Correction:** Re-map indices from `Sentences.htm` with a test asserting corpus/reply texts differ.

### DEF-014 — LOW — 20 broken internal references

- **Evidence:** 22,497 internal refs checked; 20 missing: 3 MP3 (`mp3/adest.mp3`, `felix.mp3`), 4 PDFs, 2 malformed `href` (`iopera.html><IMG SRC=`), `/it/`, 5 `flash/.../flashobject.js`, scheme-less external hosts.
- **Correction:** Exclude these from manifest or rewrite to absolute external URLs; add a crawler test asserting zero missing HTML/CSS targets.

### DEF-015 — LOW — Manifest/documentation inventory drift

- Manifest counts 1,217; the shipped `archive/` has 1,221 files and 160.6 MiB (extra: `manifest-archive.json`, `demo-reader.html`, and the 51 MB `_extension/content.js` + `content.css`). The spec's "111.72 MiB" describes the crawl, not the shipped directory.
- `failedUrls` contains 44 junk strings (`https://www.corpusthomisticum.org/OK`, `Adelante`, `UTF-8`, `&nbsp;Dele&nbsp;`).
- **Correction:** Document both figures explicitly; filter non-URL link candidates.

### DEF-016 — LOW — Packaging gaps

- No `icons` in the manifest (store submission and toolbar look require them); `file://` content script requires "Allow access to file URLs", not documented; `activeTab` declared but unused.

### DEF-017 — LOW — Dead code and typo

- `cleanPresetGloss` (`sentence-translator.ts:524`) unused; `summaIncipits` (`:24`) unused; `INLINE_THOMISTIC_GLOSSES` duplicates `CORE_THOMISTIC_PHILOSOPHICAL_LEMMAS`; `hed: 'shed'` typo at `:319` would yield "sheded".

### DEF-018 — LOW — Context lookup uses the first occurrence only

- `context-analyzer.ts:288-290` selects `targetIndices[0]`, so clicking the second/third occurrence of a repeated word may report prepositions from the first occurrence.

### DEF-019 — INFORMATIONAL — Crawler politeness and robustness

- `archive-site.py` uses 12 concurrent workers, no `robots.txt` check, no crawl delay; decodes only ISO-8859-1 (a UTF-8 page would lose non-Latin characters on re-encode); `normalize_internal_url` ignores query strings (fine for this static site).

---

## F. Security Assessment

**Method:** Static review of all extension entry points and the generated bundle; dynamic checks in Chromium; source inspection of the archive server and crawler.

| Area | Result |
|---|---|
| XSS / HTML injection | **No defect found.** All dynamic data passes `escapeHtml` (`& < > "`); all attributes are double-quoted, so the unescaped `'` is not exploitable. Verified in every `innerHTML` site in `reader-controller.ts`. |
| Remote code / eval | **Clean.** `eval(` = 0, `new Function` = 0 in the 51 MB bundle. |
| Secrets | **None** in repo or bundle. No API keys. |
| Storage | **Local only.** No telemetry/backend. `chrome.storage.local` + `localStorage`; no encryption at rest (acceptable for vocabulary data). |
| Permissions | **Over-broad.** All `localhost`/`127.0.0.1` ports, `file://`, and a MAIN-world script that mutates page globals (DEF-011). `web_accessible_resources` matches `<all_urls>`. |
| Privacy | Word lookups are sent to `en.wiktionary.org` (DEF-012). No other external calls during normal use. |
| Archive server | Binds `127.0.0.1` only; `SimpleHTTPRequestHandler` path checks apply; decodes/re-encodes ISO-8859-1 byte-for-byte, so content is preserved. No auth needed for a local read-only server. |
| Supply chain | Runtime dependencies are nil (everything is bundled); build deps (`esbuild 0.24`, `vitest 2`, `jsdom 25`) are dev-only and not shipped. |
| Verification limits | No unpacked-extension load, no Chrome Web Store policy review, no CSP audit of the live extension context. |

**Security conclusion:** no exploitable injection or code-execution vulnerability was found. The material issues are least-privilege and privacy, not memory safety or XSS.

---

## G. Performance Assessment

| Measurement | Value | Conditions |
|---|---|---|
| `content.js` size | 51,095,922 B | shipped bundle |
| `study.js` size | 51,037,983 B | Study page |
| `archive/_extension/content.js` | 51,095,922 B | every offline page |
| DOMContentLoaded | **5,066 ms** | Chromium, `http://127.0.0.1:8799/sth1001.html`, no network |
| content.js resource duration | **1,744 ms** | same |
| JS heap after load | **124.5 MB** | `performance.memory` |
| Node compile of bundle | 1,028 ms; heap 173 MB | `new Function(source)` |
| Tokenization (JSDOM, Node) | 1.8 s for 4,543 words (`sth1001`); 2.3 s for 6,139 (`snp1001`) | synchronous main-thread work |
| Page weight (archive) | 49 KB HTML + 51 MB JS + 21 KB CSS | localhost |

**Bottlenecks:** bundle parse/execution and eager deserialization of seven JSON datasets; per-page `analyzeWord()` for every token; no incremental rendering. No load/stress/concurrency testing was possible (single-user local app), but the per-navigation cost scales linearly and is repeated on every Corpus Thomisticum page.

**Note:** measurements were taken on an arm64 Raspberry Pi; absolute numbers will be lower on a desktop, but the 51 MB parse cost and >100 MB heap are architecture-level and will remain significant on mobile/low-end hardware.

---

## H. Architecture and Code Quality

**Strengths**
- Clean separation: `src/core/*` is UI-free and testable; `src/extension/*` owns DOM/UI.
- Typed domain models (`WordAnalysisResult`, `MorphologicalParse`, `FSRSCard`, `VocabularyEntry`).
- Deterministic FSRS implementation with clamped weights and monotonic interval tests.
- Archive pipeline is resumable, writes atomically, and produces a verifiable manifest.
- Consistent HTML escaping discipline.

**Weaknesses**
1. **`reader-controller.ts` is a 1,847-line god class** combining tokenization, popup, side panel, PhrasePump, preferences, and storage. Split into `tokenizer`, `popup-view`, `panel-view`, `phrasepump-view`, `preferences`, `persistence`.
2. **Storage policy is implicit and duplicated** across reader, study, popup, background. A single `StorageService` with merge semantics would eliminate DEF-001/002 and the background badge drift.
3. **Dictionary fallback conflates sources.** When Ecclesiastical/Wiktionary entries are missing, the code pushes Whitaker's senses under those badges (`dictionaries.ts:361-368, 380-395`), so "5 distinct perspectives" can be the same text three times. Label fallbacks explicitly.
4. **Data is bundled, not indexed.** Building stem/ending maps lazily per page (`ensureIndexes`) is good, but shipping the raw 51 MB is the wrong packaging boundary.
5. **Heuristic layers lack provenance.** Context/grammar/section rules are regex heuristics presented as authoritative prose; add confidence labels ("detected pattern", "heuristic") and unit fixtures per construction.
6. **No static gate.** `package.json` has no `typecheck`/`lint` script; `tsc --noEmit` is never run in the test command. Add it to `npm test`.
7. **Version/doc drift** (DEF-009/015): generate README metrics from the JSON or assert them in tests.
8. **Dead code/dup constants** (DEF-017) signals insufficient pruning.

---

## I. Improvement Roadmap

### P0 — Must fix before any release (all Low–Medium complexity unless noted)

| ID | Action | Complexity |
|---|---|---|
| P0-1 | Replace "hydrate only if empty" with union/merge-by-`updatedAt`; make `chrome.storage` authoritative (DEF-001). | Medium |
| P0-2 | Rewire Study Center to the shared store and persist every review (DEF-002). | Low |
| P0-3 | Lazy-load/split dictionaries; target initial bundle < 2 MB and TTI < 500 ms (DEF-003). | High |
| P0-4 | Unify citation stripping and token offsets; add exactness assertion across `snp*` (DEF-005). | Medium |
| P0-5 | Fix `-ndam` regex and exclude `ad secundum` (DEF-007). | Low |
| P0-6 | Restrict content scripts/MAIN-world script to corpus hosts (DEF-011). | Low |

### P1 — High-priority quality

| ID | Action | Complexity |
|---|---|---|
| P1-1 | Implement Whitaker tackons/prefixes/suffixes; add `uterque` forms → ≥2 sources (DEF-004). | Medium |
| P1-2 | Dictionary-validated enclitic splitting; add `denique`/`quousque`/`quandoque` (DEF-006). | Low |
| P1-3 | Per-section translator/provenance metadata; correct labels (DEF-008). | Medium |
| P1-4 | Correct corpus claims; publish per-work coverage (DEF-009). | Low |
| P1-5 | Accessibility: remove per-word tabindex, add skip link, dialog semantics, focus-visible, aria-live, reduced motion (DEF-010). | Medium |
| P1-6 | Add `tsc --noEmit` and a browser smoke suite to CI. | Low |

### P2 — Medium-priority improvements

- P2-1: Attribution-aware UI and a "source" line for every dictionary card; label fallback entries.
- P2-2: Favorite/known-word migration when an entry is merged across surfaces.
- P2-3: `AbortController` + online gating for Wiktionary (DEF-012).
- P2-4: Fix hand-coded duplicate mappings (DEF-013) and broken refs (DEF-014).
- P2-5: Split `reader-controller.ts` into modules; extract a `StorageService` and `View` layer.
- P2-6: Add a `data-char-offset` invariant check at tokenization time (fail fast in dev).

### P3 — Optional enhancements

- P3-1: Manifest `icons`, store assets, `file://` onboarding.
- P3-2: Confidence/provenance badges for heuristic grammar notes.
- P3-3: Lazy sentence-level alignment verification (bidirectional content-word overlap per sentence), replacing proportional mapping.
- P3-4: Mobile/responsive layout and touch affordances for the popup.
- P3-5: Remove dead code and duplicated constants (DEF-017).

---

## J. Final Verdict

### **FAIL** — not ready for release in its stated v1.1.0 form

**Why this verdict, on evidence:**
1. **A critical data-loss defect exists** in a headline feature (DEF-001): the cross-surface synchronization explicitly promised in the spec silently discards vocabulary saved on the other surface. This was reproduced deterministically with a mocked `chrome.storage`, not inferred.
2. **A second major promised integration is absent** (DEF-002): the Study Center does not read or write the shared store and loses all review progress.
3. **Two HIGH performance/UX issues** (DEF-003, DEF-010) make the product impractical on low-end hardware and for keyboard users, independent of correctness.
4. **The linguistic core is unreliable in ways that matter pedagogically** (DEF-004/005/006/007): ~4,700 common pronoun occurrences have no definition, ~4 % of tokens on Super Sent. pages get shifted sentence context, common connectives are mis-lemmatized, and the grammar assistant both invents and misses constructions.
5. **Documentation overstates the product** (DEF-008/009): translation provenance and corpus coverage claims do not match the data.

**What is genuinely good and should be preserved:** the archive (1,217 files, authentic Latin, manifest consistent, 99.9 % internal links resolving), non-destructive DOM enhancement, the popup/flip/scroll behavior, the three reading modes, side-by-side rendering, FSRS/PhrasePump, dark mode, font scaling, Anki export, and a real 7/7–37/37 test suite. The foundation is sound; the defects are concentrated in persistence, packaging, and the heuristic linguistic layer.

**Conditions to re-audit for PASS/CONDITIONAL PASS:**
- P0-1 and P0-2 fixed and covered by tests (merge semantics + Study Center persistence).
- Initial bundle under 2 MB and measured TTI under 500 ms on the same hardware.
- Zero offset mismatches on `snp1001`–`snp4001` in an automated invariant test.
- `uterque` family + `denique`/`quousque` return correct lemmas/sources.
- Grammar detector fixtures for `ad ostendendam veritatem` (positive) and `ad secundum` (negative).
- Translation provenance labels corrected and corpus claims aligned with data.
- A WCAG 2.2 AA spot-check (tab order, dialog focus, contrast).

---

### Verification limits (explicitly NOT TESTED)

- Loading the unpacked extension in Chrome/Edge/Brave, the MV3 service worker, `chrome.storage` behavior in the real extension origin, MAIN-world neutralization on the live `www.corpusthomisticum.org`, `speechSynthesis`, and clipboard permissions. The same bundle was exercised via the offline server; extension-context behavior remains unverified.
- Live-site network behavior and robots/CSP of the production site.
- Firefox/Safari, mobile devices, screen readers, and formal WCAG tooling.
- Load/stress/endurance testing (single-user local app; no server concurrency surface).

*Report produced from direct execution: 7/7 suites, 37/37 tests, 22,497 link checks, 53,224 corpus records, 6 targeted probes, and a real Chromium session. No production code was modified during the audit; temporary probe files were removed and the suite was re-run green.*
