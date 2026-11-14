# RE-AUDIT — Schola Thomistica (2026-11-12)

**Supersedes:** `AUDIT_REPORT_2026-11-11.md` (kept for history)
**Version audited:** 1.1.0 (`package.json` and manifest now agree)
**Scope:** re-verification of DEF-001…DEF-019, search for regressions/new defects, and a Chrome Web Store submission assessment.
**Method:** `npm test` (tsc + Vitest), independent probes with mocked `chrome.storage`, JSDOM DOM analysis, a real Chromium run of the packed extension, HTTP archive tests, corpus-wide measurement, and official Chrome documentation checks.
**Environment:** Linux arm64 (Raspberry Pi), Chromium 1228, Node 22.23, Vitest 2.1.9.

---

## 1. Executive summary

The previous audit's most serious findings are genuinely fixed, not merely covered by new tests:

- **Data loss (DEF-001) is gone.** Both surfaces are merged by entry id/normalized lemma and `updatedAt`; the union is mirrored back. Verified with conflicting snapshots.
- **The Study Center (DEF-002) now uses the shared store and persists reviews.** Verified: no seed deck when shared entries exist; a rating wrote `reps=1` for the user's lemma.
- **Performance (DEF-003) is transformed.** `content.js` fell from 51,095,922 B to **161,664 B**; measured DOMContentLoaded fell from **5,066 ms to 430 ms**, and heap from **124.5 MB to 2.1 MB** on the same page/hardware.
- **The lexical and offset fixes are real.** `uterque` family now returns 4 sources; `denique`/`quousque`/`quandoque` lemmas are correct; the grammar detector now catches `ad ostendendam veritatem` and no longer fires on `ad secundum`; **0** offset drift and **0** sentence misselection across 24,539 tokens on `snp1001`/`snp4001`.
- **A11y improved materially:** 4,543 per-word tab stops → **0**; skip link, aria-live, dialog semantics, focus-visible and reduced-motion added.
- **The extension packs and loads in real Chromium.** `--pack-extension` produced a valid 12.9 MB CRX; `--load-extension` activated the reader on the offline archive (top bar + 4,543 tokens + glosses).

However, the lazy dictionary loading introduced **one broad regression** and exposed **one pre-existing lexical bug**:

- **NEW-001 (HIGH):** at tokenization time the datasets are not loaded, so `quickResolveTokenLemma` supplies the page-level lemma. **43.1% of tokens on `sth1001` and 41.2% on `snp1001` get a lemma different from the real one.** Saved-vocabulary highlighting, inline saved-word glosses, and the initial coverage percentage are therefore wrong for about two in five words.
- **NEW-002 (MEDIUM):** consonant-stem adjectives receive a spurious `-us`: `noster → nosterus`, `sacer → sacerus`, `pulcher → pulcherus`, `miser → miserus`.

**Verdict:** **CONDITIONAL PASS** for local/personal use, conditional on fixing NEW-001 and NEW-002. **Not publishable on the Chrome Web Store as-is** — see §5.

---

## 2. Status of the previous defect registry

| ID | Previous severity | Status | Independent evidence |
|---|---|---|---|
| DEF-001 | CRITICAL | **FIXED** | localStorage 1 entry + shared 2 entries → loaded `["doctrina","salus"]`; shared newer translation won (`SHARED-NEWER`); localStorage mirrored to 2 entries. `mergeSnapshot` unions `reviewHistory`/`tags`/`knownLemmas`. |
| DEF-002 | HIGH | **FIXED** | Study Center with 2 shared entries showed a user exercise (not the seed `Necessarium igitur…`); rating persisted `reps=1`, `lemma=salus` to `chrome.storage`. |
| DEF-003 | HIGH | **FIXED for initial load; residual first-click cost** | 161,664 B bundle; DOMContentLoaded 430 ms; heap 2.1 MB. First click loads all 7 datasets: 51 MB, `summa-english.json` 1,097 ms, heap rises to **120.5 MB**. |
| DEF-004 | MEDIUM | **FIXED** | `utrumque`, `uterque`, `utraque`, `utriusque`, `utrique` → lemma `uterque`, **4 sources** each. |
| DEF-005 | MEDIUM | **FIXED** | `snp1001`: 6,139/6,139 exact offsets, 0 misselection; `snp4001`: 18,400/18,400 exact, 0 misselection. |
| DEF-006 | MEDIUM | **FIXED** | `denique → denique`, `quousque → quousque`, `quandoque → quandoque`, with correct meanings. |
| DEF-007 | MEDIUM | **FIXED** | `Ad ostendendam veritatem` → “Ad + Accusative Gerund / Gerundive of Purpose”; `Et sic ad secundum…` → no gerund note. |
| DEF-008 | MEDIUM | **PARTIALLY FIXED** | Per-work labels now exist and Super Sent. is no longer attributed to the Dominicans. But “Aquinas Institute / Parallel Corpus” is not backed by any recorded source in the build pipeline (upstream is `Geremia/AquinasOperaOmnia` + `Geremia23/AquinasLatinEnglish`), so provenance is still unverifiable. |
| DEF-009 | MEDIUM | **FIXED (documentation)** | README/spec now state the three translated works with 97.5%/84.9%/97.8% coverage and 0.2% for other works, matching measurement. Residual: “30,118 ST sections” counts JSON keys, while 22,754 unique archive ST titles are reachable — a ~7,364-key overcount if read as usable sections. |
| DEF-010 | MEDIUM | **SUBSTANTIALLY FIXED** | `.ct-word[tabindex]` = 0 (was 4,543). Skip link, `aria-live`, `aria-modal`, focus-visible and reduced-motion present. The page still has 150 naturally focusable elements (original `<a href>` links); the regression test’s “< 60 tab stops” measures only `[tabindex="0"]`, so that claim is not a true tab-order measurement. |
| DEF-011 | MEDIUM | **FIXED** | Manifest now: `permissions: ["storage"]`; hosts scoped to corpusthomisticum + `127.0.0.1:8765`/`localhost:8765`; `file://` removed from content scripts; `web_accessible_resources` scoped. |
| DEF-012 | LOW | **FIXED** | Gating on `127.0.0.1`/`localhost` and `onLine === false`; real-browser click on the offline archive produced only local `data/*.json` requests, **no** `en.wiktionary.org` call. |
| DEF-013 | LOW | **FIXED** | The two hand-coded duplicate pairs now differ (`qc. 2 co.` ≠ `qc. 2 ad 1`; `qc. 3 co.` ≠ `qc. 3 ad 1`). |
| DEF-014 | LOW | **MOSTLY FIXED** | Broken internal refs fell from 20 to **6 refs / 2 distinct**: 5 × `flash/st 1.html_files/flashobject.js` (legacy Flash) and `/it/` (served as directory index). No core HTML/CSS targets missing. |
| DEF-015 | LOW | **FIXED** | `failedUrls` 44 → 28 and form-value junk filtered; README now distinguishes “1,217 crawled files” from generated `manifest-archive.json`, `demo-reader.html`, and `_extension/` assets. |
| DEF-016 | LOW | **FIXED** | Icons 16/48/128 are valid PNGs at declared dimensions; `activeTab` removed; no `file://` opt-in requirement remains. |
| DEF-017 | LOW | **FIXED** | `shed: 'shed'` corrected; `cleanPresetGloss`/`summaIncipits` removed. |
| DEF-018 | LOW | **FIXED** | Clicked-occurrence offset used; probe on `de ente et in ente…` reported the governing `"in"`, not `"de"`. |
| DEF-019 | INFORMATIONAL | **IMPROVED** | Crawler junk filtering added. Still 12 workers, no `robots.txt` check/rate limit (one-off archival tool, not runtime). |

**Score:** 16 fixed (DEF-001–007, 011–018), 1 mostly fixed (014), 1 partially fixed (008), 1 documentation-fixed with a residual count nuance (009), 1 informational (019).

---

## 3. New defects found in this pass

### NEW-001 — HIGH — Lazy data loading leaves ~42% of tokens with the wrong lemma

**Components:** `src/core/data-loader.ts` (`quickResolveTokenLemma`, `ensureDataLoaded`), `src/extension/reader-controller.ts:356-490` (tokenization at `init()`), `src/core/stats-tracker.ts:190-250`.

**Evidence:** measured against the full datasets after `ensureDataLoaded()`:

| Page | Tokens | Wrong tokenization lemma | Rate |
|---|---:|---:|---:|
| `sth1001.html` | 4,583 | 1,977 | **43.1%** |
| `snp1001.html` | 6,440 | 2,655 | **41.2%** |

Examples: `comprehendatur` (quick `comprehendatur`, real `comprehendo`), `investigare` (quick `investigare`, real `investigo`), `operis` (quick `operis`, real `opus`), `praesentis` (quick `praesentis`, real `praesens`).

**Reproduction:** seed vocabulary with lemma `investigo`, load `sth1001`, count spans. Result: `data-lemma="investigo"` = **0**; `data-lemma="investigantur"` = **2**; spans with `data-familiarity="1"` = **0**. The saved word is not highlighted, and its occurrences are not linked to the saved entry.

**Expected:** page tokenization uses the real lemma (or is recomputed after hydration), so all occurrences of a saved lemma highlight and the coverage stat is accurate.

**Actual:** `init()` tokenizes before `ensureDataLoaded()`; the FAST_LEMMA_MAP (~300 forms) supplies page lemmas. No `registerOnDataHydrated` callback re-tokenizes or rewrites `data-lemma`. Initial `RecordAndComputePageCoverage` also uses the quick map, so the first coverage percentage is wrong. Clicking a word fixes only that one span.

**Consequences:** the progressive-reading core (saved-word highlighting, inline saved glosses, coverage %, familiarity-based modes) is wrong for roughly two in five words on every page; only words in the fast map behave as before.

**Fix:** after hydration, iterate all `.ct-word` spans, recompute `data-lemma` with `analyzeWord`, update `data-familiarity`/`data-gloss`, and recompute coverage; or move tokenization into a promise gated on `ensureDataLoaded()` (accepting a short delay) and keep the fast-map path only for the first paint. Add a regression test comparing span lemmas to `analyzeWord` for a non-fast-map lemma.

### NEW-002 — MEDIUM — Consonant-stem adjectives receive a spurious `-us`

**Component:** `src/core/morphology.ts`, `reconstructHeadword()` ADJECTIVE branch (declension-1 handling appends `us` unconditionally).

**Evidence:**

```
noster   → lemma=nosterus   headword=nosterus, -a, -um
sacer    → lemma=sacerus    headword=sacerus, -a, -um
pulcher  → lemma=pulcherus  headword=pulcherus, -a, -um
miser    → lemma=miserus    headword=miserus, -a, -um
```

`bonus → bonus`, `magnus → magnus`, `omnis → omnis` are correct; the failure is specific to adjectives whose nominative already ends in a consonant (`-er`/`-r` stems).

**Consequences:** wrong headword/lemma in the popup, saved entries, and FSRS cards for very common adjectives (“our”, “sacred”, “beautiful”, “wretched”). This was already present before the rewrite and was surfaced by the new measurement.

**Fix:** use Whitaker's `var`/`extra` to distinguish 3-termination (`bonus, -a, -um`) from 2-termination (`noster, -tra, -trum`) and 1-termination adjectives; never append `us` when the stem already ends the nominative. Add fixtures for `noster/sacer/pulcher/miser` and their oblique forms.

### NEW-003 — MEDIUM — First interaction loads the entire 51 MB corpus, including 27 MB not needed for lookup

**Evidence (real Chromium, offline archive):** first click on `salutem` fetched all seven files; `summa-english.json` took **1,097 ms** (27,716,873 B); heap went **2.8 MB → 120.5 MB** within 4 s. Word lookup only needs the four lexical datasets (~18 MB); the parallel corpus is needed only for side-by-side/gloss.

**Consequences:** a visible pause/jank and a large memory jump on the first click, repeated per page context. Not a correctness bug, but a poor first-use experience and a mobile/low-end risk.

**Fix:** split loading by feature: lexical set on the first word click; `summa-english.json` only when side-by-side/gloss is requested (or loaded via `requestIdleCallback`). Target < 1 s and < 60 MB on first click.

### NEW-004 — LOW — Archive data URL is relative and “loaded” is set even on total failure

**Components:** `data-loader.ts:254-261, 280-314`.

- `new URL('_extension/data/<file>', href)` resolves to `/it/_extension/data/...` for the 10 archived HTML pages under `it/`, `bt/`, and `flash/`. Those pages currently do not activate the reader (titles “Index Thomisticus”, “Bibliographia Thomistica”, “Summa Theologiae”), so the bug is latent, but any title/keyword change would silently degrade them to the tiny built-in fallback.
- `cache.loaded = true` is set even when every `fetchJson` returned `null`, and there is no retry; a transient failure permanently degrades the page to built-in core entries.

**Fix:** use a root-relative URL (`/_extension/data/…`) for the archive, and set `loaded` only if at least one dataset loaded (or track per-file success and retry on next access).

### NEW-005 — LOW — “Aquinas Institute” provenance is not recorded or verifiable

**Component:** `reader-controller.ts:639-651`.

The label is now work-specific (good), but the Super Sent. string asserts “Aquinas Institute / Parallel Corpus” while the build pipeline records only `Geremia/AquinasOperaOmnia` and the HuggingFace `Geremia23/AquinasLatinEnglish` dataset. Similarly “English Reference Edition, Summa Contra Gentiles” names no edition. Store `translator`/`sourceUrl`/`license` per section in the JSON and render that; otherwise use “Parallel reference translation (source unrecorded)”.

### NEW-006 — INFORMATIONAL — The “< 60 tab stops” regression test does not measure tab order

`tests/e2e-integration.test.ts:449` asserts `[tabindex="0"].length < 60`. It passes because the injected UI adds few explicit tabindexes, but the page has **150** naturally focusable elements (original links/buttons). The 4,543-word problem is genuinely fixed; the “< 60 tab stops” claim is not a true tab-order measurement and should be renamed or replaced with an actual sequential-focus count.

---

## 4. Verification results

### 4.1 Automated tests

| Command | Result |
|---|---|
| `npm test` (`tsc --noEmit && vitest run`) | **46/46 tests, 7/7 files, 27.99 s; typecheck clean** |
| Regression tests named DEF-001, 002, 003, 004, 005, 006, 008, 010, 011, 012, 014, 015, 016, 018 | Present and passing |
| Missing coverage | Lazy-tokenization lemma drift (NEW-001); adjective lemma reconstruction (NEW-002); first-click data cost (NEW-003); subdir data URL/partial-failure (NEW-004); real tab-order count (NEW-006) |

### 4.2 Real Chromium (offline archive, 8765)

| Metric | Before (2026-11-11) | Now (2026-11-12) |
|---|---:|---:|
| `content.js` | 51,095,922 B | **161,664 B** |
| DOMContentLoaded | 5,066 ms | **430 ms** |
| Load event | 5,075 ms | **433 ms** |
| JS heap after load | 124.5 MB | **2.1 MB** |
| Per-word tab stops | 4,543 | **0** |
| First word click | immediate (all data already parsed) | 5 badges immediately (built-in core), then 51 MB fetched; heap **120.5 MB**, summa 1,097 ms |

### 4.3 Extension packaging/runtime

- `chromium --pack-extension=dist/extension` → **valid `pkg.crx`, 12,968,709 B** (12.9 MB compressed), no manifest errors.
- `chromium --load-extension=dist/extension` + offline archive → `#st-topbar` present, **4,543** `.ct-word`, glosses rendered, only unrelated GCM stderr.
- `dist/extension` package total **51.21 MB**; icons valid (16×16, 48×48, 128×128 PNG).
- Extension-context `chrome-extension://` data fetch was not directly instrumented (the archive-injection path was); the files are packaged and listed in `web_accessible_resources`.

### 4.4 Archive

- Manifest: 1,217 files, 117,151,250 B, all paths present, all sizes match.
- Internal refs: **6 refs / 2 distinct missing** (5 legacy Flash assets, 1 directory link), down from 20.
- `failedUrls`: 28, form-value junk removed (one legitimate Flash path with a space remains).
- Offline server: HTTP 200 and injection verified on `sth1001.html`; data served from `/_extension/data/`.

---

## 5. Chrome Web Store submission assessment

**Question:** could the extension be launched on the Chrome Web Store?

**Technical answer:** yes, it is a valid MV3 package that Chromium can pack and load. **Policy/listing answer: not as-is** — four blockers and several prerequisites.

### 5.1 What passes

| Requirement | Status |
|---|---|
| Manifest V3 validity, service worker, content scripts | **Pass** (packed and loaded) |
| Single coherent purpose | **Pass** — Latin reading/learning for Corpus Thomisticum |
| No remote code / no `eval` | **Pass** (0 `eval`, 0 `new Function`; all code bundled) |
| Minimal API permissions | **Pass** — `storage` only; no `tabs`, `scripting`, `activeTab` |
| Host permissions scoped | **Pass** — corpusthomisticum + `127.0.0.1:8765`/`localhost:8765` (justify in dashboard) |
| Icons | **Pass** — 16/48/128 valid PNGs |
| Functionality works | **Pass** — verified in Chromium |
| Package size | **Pass** — 51 MB uncompressed / 12.9 MB CRX (limit 2 GB) |

### 5.2 Blockers (must fix before submission)

1. **`description` is 284 characters; the documented maximum is 132.** The Chrome manifest reference states the description must be “no more than 132 characters.” Chromium tolerated it when loading unpacked, but the store dashboard/review will reject or truncate it. Suggested replacement (113 chars):
   > “Interactive Latin reader for Corpus Thomisticum with 5 dictionaries, bilingual gloss, and FSRS vocabulary review.”
2. **Store item name is 64 characters; the listing limit is 45** (verify in the dashboard). Shorten the display name, e.g. **“Schola Thomistica — Latin Reader”** (34). Keep the longer manifest name only if the dashboard accepts it.
3. **No privacy policy.** The extension reads website content, stores vocabulary locally, and (on the live site) sends looked-up lemmas to `en.wiktionary.org`. A privacy policy URL and the “Privacy practices” questionnaire are required; disclose local storage, the Wiktionary request, and the absence of analytics/telemetry.
4. **No license/attribution for bundled data.** `dist/extension/data` redistributes ~51 MB derived from Whitaker's Words, Wiktionary (CC BY-SA), Lewis & Short, the Thomas-Lexikon, an undocumented ecclesiastical dictionary, and Super Sent./SCG translations whose upstream rights are unclear. Add `LICENSE`/`NOTICE`/`THIRD_PARTY_NOTICES`, attribute CC BY-SA sources in the UI/README, and verify redistribution rights for the Sentences/SCG translations before publishing. This is both an IP-review risk and, for GPL/CC BY-SA material, a license-compliance issue.

### 5.3 Prerequisites / review risks

- **Screenshots and promotional assets** are required for a listing (at least one 1280×800 or 640×400 screenshot); the repo contains none.
- **`short_name` is 17 characters; the documented maximum is 12.** Use e.g. “Schola Thom.” or omit it.
- **No `minimum_chrome_version`.** `content_scripts[].world: "MAIN"` requires Chrome 111+; add `"minimum_chrome_version": "111"`.
- **MAIN-world script modifies the host page** (`document.ondblclick`, `window.goPage`). Disclose it in the listing; reviewers may ask why. It is functional (suppressing the Perseus popup), not deceptive, but it must be explained.
- **Trademark/affiliation:** the name leads with “Corpus Thomisticum”. Use “for Corpus Thomisticum” and add a non-affiliation disclaimer to avoid an impersonation/IP review.
- **`web_accessible_resources` matches localhost on all ports** while host permissions are only 8765; narrow to 8765 for least privilege.
- **External request:** the live-site enrichment sends the lemma to Wikimedia. Either add a visible opt-out or state it clearly in the privacy policy; the offline archive is already hermetic.
- **Package composition:** the 160 MB archive is not in the extension package (good). Only the 51 MB data bundle is; consider splitting optional data to reduce review time, though not required.
- **Support/contact URL** and category are required listing fields (not code).
- **No root `LICENSE`** for the project itself; recommended for a public release.

### 5.4 Submission verdict

**Not publishable today.** After (1) description ≤132, (2) name ≤45, (3) privacy policy + data-usage disclosure, and (4) license/attribution for bundled data — plus screenshots and `minimum_chrome_version` — the extension is technically and structurally a good candidate: single purpose, minimal permissions, no remote code, works offline and online, and passed a real Chromium pack/load test.

---

## 6. Updated verdict

### **CONDITIONAL PASS** (software) — **FAIL for Chrome Web Store submission as-is**

The previous CRITICAL data-loss defect and the two HIGH issues (Study Center, performance) are resolved with evidence. Sixteen of nineteen prior findings are fixed, one is mostly fixed, and the remaining prior issues are documentation/provenance nuances. The product is now usable for its intended local/personal purpose.

Acceptance is conditional on:
1. **NEW-001 (HIGH):** recompute lemmas after data hydration so saved-word highlighting and coverage are correct for all tokens (currently ~42% wrong).
2. **NEW-002 (MEDIUM):** fix `noster/sacer/pulcher/miser` lemma reconstruction.
3. **NEW-003 (MEDIUM):** avoid loading the 27 MB parallel corpus on a word click; split by feature.
4. **NEW-004 (LOW):** root-relative archive data URL and do not mark data loaded on total failure.
5. **NEW-005 (LOW):** record real translation provenance per section, or use neutral wording.
6. **CWS:** the four blockers in §5.2 plus screenshots/`minimum_chrome_version`.

**Verification limits:** the real extension was packed and loaded, but `chrome-extension://` data fetching and `chrome.storage` behavior were not instrumented inside the live extension context; those were validated through the archive-injection path and mocked-storage probes. No Chrome Web Store dashboard submission was performed (no developer account/credentials). No screen-reader or mobile testing.

*All numbers in this report were produced in this session from the current working tree. Temporary probe files were removed and `npm test` was re-run green (46/46, typecheck clean).*
