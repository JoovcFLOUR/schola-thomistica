# Privacy Policy — Schola Thomistica — Latin Reader

**Last updated:** 2026-11-13  
**Extension Name:** Schola Thomistica — Latin Reader (`v1.1.0`)

## 1. Summary & Single Purpose
**Schola Thomistica — Latin Reader** transforms pages on `https://www.corpusthomisticum.org/*` (and the local offline archive at `http://127.0.0.1:8765/*` / `http://localhost:8765/*`) into an interactive Ecclesiastical and Scholastic Latin reading and vocabulary-acquisition environment.

- **Zero Analytics or Telemetry:** The extension contains no tracking scripts, analytics SDKs, advertising identifiers, or remote servers operated by the developer.
- **No Account Required:** All user data remains locally on the user's device.

## 2. Data Stored Locally (`chrome.storage.local` and `localStorage`)
To provide vocabulary tracking, spaced-repetition scheduling (FSRS), and reading preferences across sessions, the extension stores the following data locally on your device using `chrome.storage.local` and origin `localStorage`:
- Saved Latin words, lemmas, morphological notes, and user-authored study notes (`schola_thomistica_vocab_v1`).
- Reading statistics and page coverage counters (`schola_thomistica_stats_v1`).
- UI preferences such as dark mode (`Nocturne`), font size, reading mode (`Assisted`, `Guided`, `Independent`), side-by-side bilingual toggle, and live Wiktionary lookup preference (`schola_thomistica_prefs_v1`).

This data is never transmitted to any external server and can be exported or deleted by the user at any time via the **Vocab** tab.

## 3. Optional External Request (`en.wiktionary.org` REST API)
- **Offline Archive (`127.0.0.1` / `localhost`):** The extension is 100% hermetic and makes zero external network requests.
- **Live Website (`https://www.corpusthomisticum.org/*`):** When you click a Latin word while online and the **Live Wiktionary Enrichment** setting is enabled in the **Lexica (5)** tab, the extension sends a read-only `GET` request to Wikimedia's public REST API (`https://en.wiktionary.org/api/rest_v1/page/definition/{lemma}`) with a 3-second timeout to enrich the pre-bundled Wiktionary definition.
- **Opt-Out:** You can disable live Wiktionary requests at any time using the **"Live Wiktionary API"** toggle in the **Lexica (5)** tab, after which only the bundled local dictionaries are used.

## 4. Host Permissions & Page Interaction Disclosure
- The extension requests access only to `*.corpusthomisticum.org` and `http://127.0.0.1:8765/*` / `http://localhost:8765/*`.
- On Corpus Thomisticum pages, a small `MAIN`-world script (`neutralize-perseus.js`) sets `document.ondblclick = null` and `window.goPage = function() {}` solely to prevent the host page's legacy script from opening an external popup window to `perseus.tufts.edu` when a reader clicks or double-clicks a Latin word.

## 5. Non-Affiliation Disclaimer
**Schola Thomistica — Latin Reader** is an independent open-source educational tool and is not affiliated with, endorsed by, or sponsored by the *Corpus Thomisticum* project, Fundación Tomás de Aquino, or the University of Navarra.
