# Design Spec: Lemma-Linked Custom Word Definitions & Personal Annotations

**Date:** 2026-11-13  
**Size:** Small change (focused extension to existing `VocabularyStore`, `#st-popup`, `Vocab` tab, inline `data-gloss`, and `PhrasePump`)  
**Status:** Pending user approval

---

## 1. Intent & Why
Allow readers of Corpus Thomisticum to author their own **custom definition (`customDefinition`)** and **personal annotations (`notes`)** linked to a word's **lemma** across the entire corpus, alongside the 5 built-in dictionaries.

## 2. Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Persist `customDefinition?: string` and `notes: string` per normalized lemma in `VocabularyStore`, syncing across `localStorage` and `chrome.storage.local` via `mergeSnapshot()` (preserving the newest `updatedAt`).
  - Display a compact **`+ Custom Definition / Note`** (`✎ Edit Definition / Note`) toggle inside `#st-popup` and an inline editor inside the `Vocab` tab.
  - When a lemma has a `customDefinition` or `notes`, render a highlighted **`Personal Definition & Note`** card at the very top of `#st-popup` (above the 5 dictionaries) and in the `Context` / `Vocab` tabs.
  - Use `customDefinition` (when present) as the priority source for inline mini-glosses (`data-gloss`) across all occurrences of that lemma on the page, for `PhrasePump` active-recall prompts/answers, and for `Anki TSV` / `JSON` exports (adding a `Notes` column to Anki TSV).
- **Non-Goals:**
  - Per-character or per-paragraph freeform margin sticky notes detached from a Latin lemma.
- **Anti-Goals:**
  - Cluttering `#st-popup` with an always-open multi-line form when the user is only clicking words for quick dictionary lookup.

## 3. Constraints
- Content script bundle (`dist/extension/content.js`) must remain 100% 7-bit ASCII and `< 2 MB`.
- Keyboard shortcuts (`1–4`, `S`, `K`, `B`, `R`, `D`, `Space`) must remain suppressed while typing inside the custom definition `input` or annotation `textarea` (already guaranteed by the `INPUT`/`TEXTAREA` guard in `bindGlobalKeyboardShortcuts`, which will be verified by a dedicated test).
- All user-entered strings must be sanitized through `escapeHtml` before rendering into `innerHTML`.

## 4. Approaches Considered
1. **Approach 1 (Selected): Expandable Editor in `#st-popup` + Inline Editor in `Vocab` Tab + Top Priority Card:**
   - Keeps `#st-popup` compact during normal reading; shows the user's definition/note at the top when present and opens the editor on click (`+ Custom Definition / Note` / `✎ Edit`).
2. **Approach 2: Always-Open Inputs in `#st-popup`:**
   - Rejected because it adds ~130px of permanent height to every word popup.
3. **Approach 3: Side-Panel-Only Editing:**
   - Rejected because it requires the side panel to be open even in `Independent Reader` mode.

## 5. Architecture & Component Changes
- **`src/core/vocabulary-store.ts`**:
  - Add optional `customDefinition?: string` to `VocabularyEntry` and `SaveWordInput`.
  - Allow `updateEntry` and `saveWord` to set/update `customDefinition` and `notes`. When `customDefinition` is non-empty, also use it as the effective `translation` (while keeping the dictionary default fallback if cleared).
  - Preserve `customDefinition` and `notes` in `mergeSnapshot()` (preferring newer `updatedAt`, and preserving non-empty `customDefinition`/`notes` if timestamps tie).
  - Include `Notes` column in `exportAnkiTSV()`.
- **`src/extension/reader-controller.ts` & `src/extension/styles/content.css`**:
  - In `renderPopup()`:
    - If the current lemma has `customDefinition` or `notes`, render a top card with badge `My Definition & Note` (`data-source="User Note"`) and an `✎ Edit` button.
    - Render a `+ Custom Definition / Note` button that toggles `#st-popup-note-editor` (`#st-custom-def-input`, `#st-custom-note-input`, `#st-save-note-btn`), calling `saveCurrentWordAnnotation(customDefinition, notes)`.
    - Saving an annotation on an unsaved word automatically saves it to `VocabularyStore` (defaulting to familiarity `1 • New` if previously unseen `0`, or keeping its current familiarity `1–4`), updates `data-gloss` on all matching `.ct-word[data-lemma]` spans on the page, persists to `localStorage` + `chrome.storage.local`, and repositions the popup (`positionPopup()`).
  - In `renderVocabularyTab()`:
    - Display `customDefinition` and `notes` on each vocabulary card with an inline `Edit Note / Def.` toggle to edit and save directly from the `Vocab` tab.
