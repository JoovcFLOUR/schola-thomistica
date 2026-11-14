# Lemma-Linked Custom Word Definitions & Personal Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to author, edit, persist, and review custom definitions (`customDefinition`) and personal annotations (`notes`) linked by Latin lemma across the Corpus Thomisticum reader, inline mini-glosses, Vocabulary manager, PhrasePump FSRS reviews, and Anki TSV exports.

**Architecture:** Extend `VocabularyStore` (`src/core/vocabulary-store.ts`) with `customDefinition?: string` and `notes: string` support across `saveWord`, `updateEntry`, `mergeSnapshot`, and `exportAnkiTSV`, and update `generatePhrasePumpSession` (`src/core/fsrs.ts`) to prioritize `customDefinition` and surface user `notes`. Add an expandable editor (`#st-popup-note-editor`) and top-priority `My Definition & Note` card inside `#st-popup` plus inline editing in the `Vocab` tab (`src/extension/reader-controller.ts` & `src/extension/styles/content.css`), updating `data-gloss` across all matching lemma spans on the page.

**Tech Stack:** TypeScript, Manifest V3 Browser Extension, JSDOM + Vitest.

**Spec:** `corpus-thomisticum/docs/superpowers/specs/2026-11-13-custom-word-definitions-and-notes-design.md`

## Global Constraints

- `dist/extension/content.js` must remain 100% 7-bit ASCII and `< 2 MB`.
- Typing inside `#st-custom-def-input`, `#st-custom-note-input`, or `Vocab` edit inputs must never trigger global keyboard shortcuts (`1–4`, `S`, `K`, `B`, `R`, `D`, `Space`).
- All user-supplied `customDefinition` and `notes` strings must pass through `escapeHtml` before insertion into `innerHTML`.

## Review Focus

1. Clearing a previously saved `customDefinition` (`""`) must revert the entry's displayed meaning and `data-gloss` to the dictionary translation rather than leaving an empty string.
2. Saving a custom definition or note on an unseen word (`familiarity === 0`) must automatically create the `VocabularyEntry` (at familiarity `1`) without losing the current sentence/citation context.
3. Saving a new familiarity rating (`1–4`) on a word that already has a `customDefinition` or `notes` must preserve both `customDefinition` and `notes`.
4. Merging snapshots across origins (`mergeSnapshot`) where one snapshot has a newer `customDefinition` or `notes` must keep the newer values and never drop non-empty annotations when timestamps tie.
5. HTML/script characters in `customDefinition` or `notes` (e.g. `<img src=x onerror=alert(1)>`) must be escaped in `#st-popup`, `Context`, `Vocab`, and `PhrasePump`.

---

### Task 1: `VocabularyStore` & `PhrasePump` Support for `customDefinition` and `notes`

**Files:**
- Modify: `corpus-thomisticum/src/core/vocabulary-store.ts:13-173, 249-266`
- Modify: `corpus-thomisticum/src/core/fsrs.ts:210-310`
- Test: `corpus-thomisticum/tests/fsrs-vocab-stats.test.ts`

**Interfaces:**
- Produces in `src/core/vocabulary-store.ts`:
  - `VocabularyEntry.customDefinition?: string`
  - `SaveWordInput.customDefinition?: string`
  - `VocabularyStore.updateEntry(id: string, patch: Partial<Pick<VocabularyEntry, 'translation' | 'customDefinition' | 'contextualMeaning' | 'notes' | 'tags' | 'familiarity' | 'originalSentence' | 'sentenceTranslation'>>, now?: Date): VocabularyEntry | undefined`
- Produces in `src/core/fsrs.ts`:
  - `PhrasePumpExercise.userNotes?: string` (uses `entry.customDefinition || entry.translation` for `translationHint` / `expectedAnswer` in `la-to-en` mode)

- [ ] **Step 1: Write the failing test in `corpus-thomisticum/tests/fsrs-vocab-stats.test.ts`**

```typescript
  it('stores, updates, merges, exports, and schedules customDefinition and personal notes per lemma', () => {
    const store = new VocabularyStore();
    const t1 = new Date('2026-11-13T10:00:00Z');
    const t2 = new Date('2026-11-13T11:00:00Z');

    const saved = store.saveWord(
      {
        word: 'salutem',
        lemma: 'salus',
        headword: 'salus, salutis (f.)',
        translation: 'salvation, welfare',
        customDefinition: 'beatitudo supernaturalis in Deo',
        notes: 'Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.',
        partOfSpeech: 'Noun',
        morphologySummary: 'Accusative Singular Feminine',
        originalSentence: 'Necessarium fuit ad humanam salutem.',
        sentenceTranslation: 'It was necessary for human salvation.',
        sourceCitation: '[28236] I q. 1 a. 1 co.',
      },
      t1
    );

    expect(saved.customDefinition).toBe('beatitudo supernaturalis in Deo');
    expect(saved.notes).toBe('Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');

    // Saving familiarity change on the same lemma without passing customDefinition/notes preserves them
    const reSaved = store.saveWord(
      {
        word: 'salutis',
        lemma: 'salus',
        translation: 'salvation, welfare',
        partOfSpeech: 'Noun',
        morphologySummary: 'Genitive Singular Feminine',
        originalSentence: 'Via salutis.',
        sentenceTranslation: 'The way of salvation.',
        familiarity: 3,
      },
      t2
    );
    expect(reSaved.customDefinition).toBe('beatitudo supernaturalis in Deo');
    expect(reSaved.notes).toBe('Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');
    expect(reSaved.familiarity).toBe(3);

    // PhrasePump uses customDefinition and includes userNotes
    const session = generatePhrasePumpSession(store.getAll(), { mode: 'la-to-en', limit: 5 });
    expect(session.exercises[0].expectedAnswer).toContain('beatitudo supernaturalis in Deo');
    expect(session.exercises[0].userNotes).toBe('Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');

    // Anki TSV includes customDefinition and Notes column
    const tsv = store.exportAnkiTSV();
    expect(tsv).toContain('#columns:Front\tBack\tCustomDefinition\tNotes\tLemma');
    expect(tsv).toContain('beatitudo supernaturalis in Deo');
    expect(tsv).toContain('Cf. ST I-II q. 3 a. 8: ultima beatitudo hominis.');

    // Clearing customDefinition via updateEntry("") falls back cleanly
    const cleared = store.updateEntry(saved.id, { customDefinition: '' }, t2);
    expect(cleared?.customDefinition).toBe('');
    expect(cleared?.translation).toBe('salvation, welfare');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fsrs-vocab-stats.test.ts`
Expected: FAIL on `saved.customDefinition` / `session.exercises[0].userNotes` / `#columns`

- [ ] **Step 3: Implement `customDefinition` and `notes` handling in `src/core/vocabulary-store.ts` and `src/core/fsrs.ts`**

Update `VocabularyEntry`, `SaveWordInput`, `saveWord`, `updateEntry`, `mergeSnapshot`, and `exportAnkiTSV` in `src/core/vocabulary-store.ts`, and `PhrasePumpExercise` + `generatePhrasePumpSession` in `src/core/fsrs.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fsrs-vocab-stats.test.ts`
Expected: PASS (`6/6` tests passing)

---

### Task 2: Popup & Vocab Tab UI for Custom Word Definitions & Annotations

**Files:**
- Modify: `corpus-thomisticum/src/extension/reader-controller.ts`
- Modify: `corpus-thomisticum/src/extension/styles/content.css`
- Test: `corpus-thomisticum/tests/e2e-integration.test.ts`

**Interfaces:**
- Consumes: `VocabularyEntry.customDefinition`, `VocabularyEntry.notes`, `PhrasePumpExercise.userNotes` from Task 1.
- Produces in `src/extension/reader-controller.ts`:
  - `public saveCurrentWordAnnotation(customDefinition: string, notes: string): VocabularyEntry | undefined`
  - DOM elements in `#st-popup`:
    - `#st-popup-toggle-note-btn` (button to open/close the custom definition & note editor)
    - `#st-popup-note-editor` (container with `#st-custom-def-input`, `#st-custom-note-input`, `#st-save-note-btn`)
    - `.st-dict-badge[data-source="My Definition & Note"]` (top card inside `#st-popup` when `customDefinition` or `notes` is non-empty)
  - DOM elements in `Vocab` tab (`#st-panel-body`):
    - `[data-edit-vocab-id]` toggle button and `[data-save-vocab-id]` save button with `[data-edit-def-id]` and `[data-edit-note-id]` inputs.

- [ ] **Step 1: Write the failing E2E test in `corpus-thomisticum/tests/e2e-integration.test.ts`**

```typescript
  it('allows creating and editing a lemma-linked custom definition and personal note in the popup and Vocab tab, updating inline glosses across all occurrences and escaping HTML', () => {
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:8765/sth1001.html' });
    const win = dom.window as unknown as Window & typeof globalThis;
    const reader = new ScholaThomisticaReader(win);
    reader.init();

    const doc = win.document;
    const wordEl = Array.from(doc.querySelectorAll<HTMLElement>('.ct-word')).find(
      (el) => el.textContent?.toLowerCase() === 'salutem'
    )!;
    reader.selectWordElement(wordEl);

    const popup = doc.getElementById('st-popup')!;
    const toggleNoteBtn = popup.querySelector<HTMLButtonElement>('#st-popup-toggle-note-btn')!;
    expect(toggleNoteBtn).not.toBeNull();
    toggleNoteBtn.click();

    const defInput = popup.querySelector<HTMLInputElement>('#st-custom-def-input')!;
    const noteInput = popup.querySelector<HTMLTextAreaElement>('#st-custom-note-input')!;
    const saveNoteBtn = popup.querySelector<HTMLButtonElement>('#st-save-note-btn')!;
    expect(defInput).not.toBeNull();
    expect(noteInput).not.toBeNull();

    // Typing keys (1, d, b) inside inputs must NOT trigger global shortcuts
    defInput.focus();
    defInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(doc.body.classList.contains('st-dark-mode')).toBe(false);

    defInput.value = 'Salvation & Supernatural Beatitude';
    noteInput.value = 'Central teleological concept in ST I q. 1 a. 1 <script>alert(1)</script>';
    saveNoteBtn.click();

    // Verify top card in popup displays My Definition & Note with escaped HTML
    expect(popup.querySelector('.st-dict-badge[data-source="My Definition & Note"]')).not.toBeNull();
    expect(popup.textContent).toContain('Salvation & Supernatural Beatitude');
    expect(popup.textContent).toContain('Central teleological concept in ST I q. 1 a. 1');
    expect(popup.innerHTML).not.toContain('<script>alert(1)</script>');

    // Verify all occurrences of lemma "salus" on the page updated their inline data-gloss
    const salusSpans = Array.from(doc.querySelectorAll<HTMLElement>('.ct-word[data-lemma="salus"]'));
    expect(salusSpans.length).toBeGreaterThan(1);
    for (const sp of salusSpans) {
      expect(sp.getAttribute('data-gloss')).toContain('Salvation');
    }

    // Verify rating familiarity to 3 preserves customDefinition and notes
    reader.saveCurrentWord(3);
    const entry = reader.getVocabularyStore().getByLemma('salus')!;
    expect(entry.customDefinition).toBe('Salvation & Supernatural Beatitude');
    expect(entry.notes).toContain('Central teleological concept');

    // Verify Vocab tab shows custom definition & note and supports inline editing
    const vocabTabBtn = doc.querySelector<HTMLButtonElement>('.st-tab[data-tab="vocabulary"]')!;
    vocabTabBtn.click();
    const panelBody = doc.getElementById('st-panel-body')!;
    expect(panelBody.textContent).toContain('Salvation & Supernatural Beatitude');
    expect(panelBody.textContent).toContain('Central teleological concept');

    const editBtn = panelBody.querySelector<HTMLButtonElement>(`[data-edit-vocab-id="${entry.id}"]`)!;
    expect(editBtn).not.toBeNull();
    editBtn.click();
    const vocabDefInput = panelBody.querySelector<HTMLInputElement>(`[data-edit-def-id="${entry.id}"]`)!;
    const vocabNoteInput = panelBody.querySelector<HTMLTextAreaElement>(`[data-edit-note-id="${entry.id}"]`)!;
    const vocabSaveBtn = panelBody.querySelector<HTMLButtonElement>(`[data-save-vocab-id="${entry.id}"]`)!;
    vocabDefInput.value = 'Eternal Vision of God';
    vocabNoteInput.value = 'Updated note in Vocab tab';
    vocabSaveBtn.click();

    expect(reader.getVocabularyStore().getByLemma('salus')?.customDefinition).toBe('Eternal Vision of God');
    expect(reader.getVocabularyStore().getByLemma('salus')?.notes).toBe('Updated note in Vocab tab');
    dom.window.close();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/e2e-integration.test.ts`
Expected: FAIL on `expect(toggleNoteBtn).not.toBeNull()`

- [ ] **Step 3: Implement `saveCurrentWordAnnotation`, popup editor, top `My Definition & Note` card, Vocab tab inline editor, and PhrasePump note display in `src/extension/reader-controller.ts` and `src/extension/styles/content.css`**

- [ ] **Step 4: Build extension and run full test suite**

Run: `npm run build && npm test`
Expected: PASS (`tsc --noEmit` clean, `50/50` tests passing across `7/7` suites, `content.js` 100% ASCII and `< 2 MB`).
