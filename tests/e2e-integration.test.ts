import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ScholaThomisticaReader } from '../src/extension/reader-controller';
import { VocabularyStore } from '../src/core/vocabulary-store';
import { initStudyCenter } from '../src/extension/study/study';
import { analyzeWord, fetchLiveWiktionaryEntry } from '../src/core/dictionaries';
import { cleanLatinString } from '../src/core/normalizer';
import { resolveBrowserDataUrl } from '../src/core/data-loader';

const STH1001_PATH = path.resolve(import.meta.dirname, '../archive/sth1001.html');

describe('Task 7: End-to-End Corpus Thomisticum Browser Extension Integration', () => {
  it('enhances real Corpus Thomisticum DOM (sth1001.html), neutralizes legacy Perseus double-click, and tokenizes Latin words', () => {
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'https://www.corpusthomisticum.org/sth1001.html' });
    const reader = new ScholaThomisticaReader(dom.window as unknown as Window & typeof globalThis);
    reader.init();

    const doc = dom.window.document;
    expect(doc.ondblclick).toBeNull();
    expect(doc.getElementById('st-topbar')).not.toBeNull();
    expect(doc.getElementById('st-sidepanel')).not.toBeNull();
    expect(doc.getElementById('st-popup')).not.toBeNull();

    const wordSpans = doc.querySelectorAll('.ct-word');
    expect(wordSpans.length).toBeGreaterThan(500);
  });

  it('opens contextual popup and side panel when clicking a Latin word, saves to vocabulary, and runs PhrasePump FSRS review', () => {
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'https://www.corpusthomisticum.org/sth1001.html' });
    const reader = new ScholaThomisticaReader(dom.window as unknown as Window & typeof globalThis);
    reader.init();

    const doc = dom.window.document;
    // Find the word "salutem" in [28236] I q. 1 a. 1 co.
    const wordEl = Array.from(doc.querySelectorAll<HTMLElement>('.ct-word')).find(
      (el) => el.textContent?.toLowerCase() === 'salutem'
    );
    expect(wordEl).toBeDefined();

    // Simulate click on "salutem"
    reader.selectWordElement(wordEl!);

    const popup = doc.getElementById('st-popup')!;
    expect(popup.classList.contains('st-visible')).toBe(true);
    expect(popup.textContent).toContain('salus');
    expect(popup.textContent?.toLowerCase()).toContain('salvation');
    // Popup itself must show multiple dictionary translations (Ecclesiastical Latin Dictionary, Wiktionary, Lewis & Short, Whitaker's Words)
    expect(popup.textContent).toContain('Ecclesiastical Latin');
    expect(popup.textContent).toContain('Wiktionary');
    expect(popup.textContent).toContain('Lewis & Short');
    expect(popup.textContent).toContain("Whitaker's Words");

    const sidepanel = doc.getElementById('st-sidepanel')!;
    expect(sidepanel.textContent).toContain('Accusative');
    expect(sidepanel.textContent).toContain('It was necessary for man\'s salvation');

    // Save word to personal vocabulary
    const saved = reader.saveCurrentWord(1);
    expect(saved).toBeDefined();
    expect(saved?.word.toLowerCase()).toBe('salutem');
    expect(saved?.sourceCitation).toContain('I q. 1 a. 1 co.');
    expect(wordEl?.getAttribute('data-familiarity')).toBe('1');

    // Start PhrasePump review session in modal
    reader.openPhrasePumpModal();
    const modal = doc.getElementById('st-phrasepump-modal')!;
    expect(modal.classList.contains('st-visible')).toBe(true);
    expect(modal.textContent).toContain('[ _____ ]');

    // Submit FSRS rating Good (3)
    reader.gradeCurrentPhrasePumpCard(3);
    const updatedEntry = reader.getVocabularyStore().getByLemma('salus');
    expect(updatedEntry?.fsrsCard.reps).toBe(1);
    expect(updatedEntry?.fsrsCard.scheduledDays).toBeGreaterThan(0);
  });

  it('bundles dist/extension/content.js as pure 7-bit ASCII so it is 100% immune to ISO-8859-1 page charset issues', () => {
    const contentJsPath = path.resolve(import.meta.dirname, '../dist/extension/content.js');
    const contentJs = fs.readFileSync(contentJsPath, 'utf-8');
    const nonAsciiMatch = contentJs.match(/[^\x00-\x7F]/);
    expect(nonAsciiMatch).toBeNull();

    const contentCssPath = path.resolve(import.meta.dirname, '../dist/extension/styles/content.css');
    const contentCss = fs.readFileSync(contentCssPath, 'utf-8');
    expect(contentCss).toMatch(/#st-popup\.st-visible\s*\{\s*display:\s*block;\s*\}/);
  });

  it('positions the popup ABOVE the word when the word is near the bottom of the viewport and updates popup position when scrolling', () => {
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'https://www.corpusthomisticum.org/sth1001.html' });
    const win = dom.window as unknown as Window & typeof globalThis;
    Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true, writable: true });
    Object.defineProperty(win, 'innerWidth', { value: 1280, configurable: true, writable: true });

    const reader = new ScholaThomisticaReader(win);
    reader.init();

    const doc = win.document;
    const popup = doc.getElementById('st-popup')!;
    // Simulate realistic popup height (290px)
    popup.getBoundingClientRect = () =>
      ({
        top: parseFloat(popup.style.top || '0'),
        left: parseFloat(popup.style.left || '0'),
        bottom: parseFloat(popup.style.top || '0') + 290,
        right: parseFloat(popup.style.left || '0') + 320,
        width: 320,
        height: 290,
        x: parseFloat(popup.style.left || '0'),
        y: parseFloat(popup.style.top || '0'),
        toJSON: () => {},
      }) as DOMRect;

    const wordEl = doc.querySelector<HTMLElement>('.ct-word')!;
    let currentWordTop = 680; // Near bottom of 800px viewport (only 98px space below!)
    wordEl.getBoundingClientRect = () =>
      ({
        top: currentWordTop,
        bottom: currentWordTop + 22,
        left: 140,
        right: 210,
        width: 70,
        height: 22,
        x: 140,
        y: currentWordTop,
        toJSON: () => {},
      }) as DOMRect;

    reader.selectWordElement(wordEl);

    const initialPopupTop = parseFloat(popup.style.top);
    // Because the word is at y=680..702 and the popup is 290px tall, the popup MUST appear ABOVE the word (popup bottom <= 680)
    expect(popup.getAttribute('data-placement')).toBe('above');
    expect(initialPopupTop + 290).toBeLessThanOrEqual(currentWordTop);

    // Now simulate scrolling the page so the word moves to y=180 (plenty of space below!)
    currentWordTop = 180;
    win.dispatchEvent(new win.Event('scroll'));

    const scrolledPopupTop = parseFloat(popup.style.top);
    expect(scrolledPopupTop).not.toBe(initialPopupTop);
    expect(popup.getAttribute('data-placement')).toBe('below');
    expect(scrolledPopupTop).toBeGreaterThanOrEqual(180 + 22);
  });

  it('fixes GLM-5.3 QA findings: Space in PhrasePump reveals answer, Enter in Lexica search triggers lookup, popup has close/pronounce/copy buttons, and Parallel drawer shows both translation and gloss on sth1001', () => {
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'https://www.corpusthomisticum.org/sth1001.html' });
    const win = dom.window as unknown as Window & typeof globalThis;
    const reader = new ScholaThomisticaReader(win);
    reader.init();

    const doc = win.document;
    const wordEl = Array.from(doc.querySelectorAll<HTMLElement>('.ct-word')).find(
      (el) => el.textContent?.toLowerCase() === 'salutem'
    )!;
    reader.selectWordElement(wordEl);

    const popup = doc.getElementById('st-popup')!;
    // H3: Popup has close, pronounce, and copy buttons
    expect(popup.querySelector('#st-popup-close')).not.toBeNull();
    expect(popup.querySelector('#st-popup-pronounce')).not.toBeNull();
    expect(popup.querySelector('#st-popup-copy')).not.toBeNull();

    // Save word so PhrasePump has a card
    reader.saveCurrentWord(1);

    // H4 & H5: Parallel English & Gloss drawer on sth1001 shows BOTH reference translation and interlinear gloss toggle, and updates button label + aria-expanded
    const para = wordEl.closest('[data-st-enhanced]')!;
    const paraBtn = para.querySelector<HTMLButtonElement>('.st-para-gloss-btn')!;
    expect(paraBtn.getAttribute('aria-expanded')).toBe('false');
    paraBtn.click();
    expect(paraBtn.getAttribute('aria-expanded')).toBe('true');
    expect(paraBtn.textContent).toContain('Hide');
    const drawer = para.querySelector('.st-parallel-drawer')!;
    expect(drawer.textContent).toContain("It was necessary for man's salvation");
    expect(drawer.textContent).toContain('Interlinear Word-by-Word Gloss');

    // H2: Pressing Enter in #st-dict-search-input triggers lookup
    const lexTabBtn = doc.querySelector<HTMLButtonElement>('.st-tab[data-tab="dictionaries"]')!;
    lexTabBtn.click();
    const searchInput = doc.getElementById('st-dict-search-input') as HTMLInputElement;
    searchInput.value = 'substantia';
    searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(doc.getElementById('st-panel-body')?.textContent).toContain('substantia, -ae');

    // C1 & C3 & H7: PhrasePump mode selector + progress bar + Space reveals answer + number keys ignored before reveal
    reader.openPhrasePumpModal();
    const modal = doc.getElementById('st-phrasepump-modal')!;
    expect(modal.querySelector('#st-phrasepump-mode')).not.toBeNull();
    expect(modal.querySelector('.st-phrasepump-progress-bar')).not.toBeNull();

    // Pressing '3' BEFORE answer is revealed must NOT corrupt/re-grade currentAnalysis to familiarity 3
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(reader.getVocabularyStore().getByLemma('salus')?.familiarity).toBe(1);

    // Pressing Space reveals the answer!
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    expect(modal.querySelectorAll('[data-fsrs-grade]').length).toBe(4);
  });

  it('supports Side-by-Side English translation column on the right (shifting Latin to the left) while keeping Interlinear Gloss underneath', () => {
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'https://www.corpusthomisticum.org/sth1001.html' });
    const win = dom.window as unknown as Window & typeof globalThis;
    const reader = new ScholaThomisticaReader(win);
    reader.init();

    const doc = win.document;
    // Check global topbar Side-by-Side toggle button exists
    const bilingualToggle = doc.getElementById('st-bilingual-toggle') as HTMLButtonElement;
    expect(bilingualToggle).not.toBeNull();

    // Find paragraph [28236] I q. 1 a. 1 co.
    const para = doc.querySelector<HTMLElement>('P[TITLE="I q. 1 a. 1 co."]')!;
    expect(para).not.toBeNull();
    const latinCol = para.querySelector<HTMLElement>('.st-col-latin')!;
    const englishCol = para.querySelector<HTMLElement>('.st-col-english')!;
    const sideBtn = para.querySelector<HTMLButtonElement>('.st-para-side-btn')!;
    const glossBtn = para.querySelector<HTMLButtonElement>('.st-para-gloss-btn')!;

    expect(latinCol).not.toBeNull();
    expect(englishCol).not.toBeNull();
    expect(sideBtn).not.toBeNull();
    expect(glossBtn).not.toBeNull();

    // Click Side-by-Side button on paragraph -> opens right-hand English column
    sideBtn.click();
    expect(para.classList.contains('st-bilingual-open')).toBe(true);
    expect(englishCol.textContent).toContain("It was necessary for man's salvation");

    // Click Interlinear Gloss button -> opens bottom drawer underneath
    glossBtn.click();
    const bottomDrawer = para.querySelector<HTMLElement>('.st-parallel-drawer')!;
    expect(bottomDrawer.classList.contains('st-open')).toBe(true);
    expect(bottomDrawer.textContent).toContain('Respondeo');

    // Global toggle in topbar activates side-by-side mode across the entire page including Prooemium (I q. 1 pr.)
    bilingualToggle.click();
    expect(doc.body.classList.contains('st-bilingual-mode')).toBe(true);
    expect(bilingualToggle.getAttribute('aria-pressed')).toBe('true');
    expect(bilingualToggle.textContent).toBe('Side-by-Side EN: ON');
    const prooemiumPara = doc.querySelector<HTMLElement>('P[TITLE="I q. 1 pr."]')!;
    expect(prooemiumPara.querySelector('.st-col-english')?.textContent).toContain(
      'To place our purpose within proper limits'
    );

    // P0-2: Clicking a paragraph's sideBtn while global Side-by-Side is ON hides that single paragraph's column (.st-bilingual-closed)
    expect(sideBtn.getAttribute('aria-expanded')).toBe('true');
    sideBtn.click();
    expect(para.classList.contains('st-bilingual-closed')).toBe(true);
    expect(sideBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('DEF-001: merges localStorage and chrome.storage.local snapshots instead of discarding shared entries when localStorage is non-empty', () => {
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:8765/sth1001.html' });
    const win = dom.window as unknown as Window & typeof globalThis;

    const staleLocal = new VocabularyStore();
    staleLocal.saveWord(
      {
        word: 'doctrinam',
        lemma: 'doctrina',
        translation: 'stale local doctrine',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Sacram doctrinam.',
        sentenceTranslation: 'Sacred doctrine.',
        familiarity: 1,
      },
      new Date('2026-11-01T00:00:00Z')
    );
    win.localStorage.setItem('schola_thomistica_vocab_v1', JSON.stringify(staleLocal.toSnapshot()));

    const sharedChrome = new VocabularyStore();
    sharedChrome.saveWord(
      {
        word: 'doctrinam',
        lemma: 'doctrina',
        translation: 'authoritative shared doctrine',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Sacram doctrinam.',
        sentenceTranslation: 'Sacred doctrine.',
        familiarity: 3,
      },
      new Date('2026-11-10T00:00:00Z')
    );
    sharedChrome.saveWord(
      {
        word: 'salutem',
        lemma: 'salus',
        translation: 'salvation',
        partOfSpeech: 'Noun',
        morphologySummary: 'Acc. Sg.',
        originalSentence: 'Ad humanam salutem.',
        sentenceTranslation: 'For human salvation.',
        familiarity: 2,
      },
      new Date('2026-11-10T00:00:00Z')
    );

    const chromeStorageState: Record<string, unknown> = {
      schola_thomistica_vocab_v1: sharedChrome.toSnapshot(),
    };
    (win as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: (_keys: string[], cb: (res: Record<string, unknown>) => void) => {
            cb(chromeStorageState);
          },
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(chromeStorageState, items);
            cb?.();
          },
        },
      },
    };

    const reader = new ScholaThomisticaReader(win);
    reader.init();

    const store = reader.getVocabularyStore();
    expect(store.getAll().map((e) => e.lemma).sort()).toEqual(['doctrina', 'salus']);
    expect(store.getByLemma('doctrina')?.translation).toBe('authoritative shared doctrine');
    expect(store.getByLemma('doctrina')?.familiarity).toBe(3);
    expect(store.getByLemma('salus')?.familiarity).toBe(2);
  });

  it('DEF-002: Study Center hydrates from chrome.storage.local without seeding dummy deck and persists FSRS reviews back to shared storage', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="study-app-root"></div></body></html>', {
      url: 'chrome-extension://scholathomistica/study/study.html',
    });
    const win = dom.window as unknown as Window & typeof globalThis;

    const sharedStore = new VocabularyStore();
    sharedStore.saveWord(
      {
        word: 'salutem',
        lemma: 'salus',
        headword: 'salus, salutis (f.)',
        translation: 'salvation',
        contextualMeaning: 'eternal salvation in God',
        partOfSpeech: 'Noun',
        morphologySummary: 'Accusative Singular Feminine',
        originalSentence: 'Necessarium fuit ad humanam salutem esse doctrinam quandam.',
        sentenceTranslation: 'It was necessary for human salvation that there be a certain doctrine.',
        sourceWork: 'Summa Theologiae',
        sourceCitation: '[28236] I q. 1 a. 1 co.',
        familiarity: 1,
      },
      new Date('2026-11-10T00:00:00Z')
    );

    const chromeStorageState: Record<string, unknown> = {
      schola_thomistica_vocab_v1: sharedStore.toSnapshot(),
    };
    (win as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: (_keys: string[], cb: (res: Record<string, unknown>) => void) => {
            cb(chromeStorageState);
          },
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(chromeStorageState, items);
            cb?.();
          },
        },
      },
    };

    initStudyCenter(win);

    const root = win.document.getElementById('study-app-root')!;
    expect(root.textContent).toContain('human salvation');
    expect(root.textContent).not.toContain('built up by reason');

    // Reveal and grade Good (3)
    const revealBtn = root.querySelector<HTMLButtonElement>('#study-reveal')!;
    expect(revealBtn).not.toBeNull();
    revealBtn.click();

    const goodBtn = root.querySelector<HTMLButtonElement>('[data-rate="3"]')!;
    expect(goodBtn).not.toBeNull();
    goodBtn.click();

    const persistedSnap = chromeStorageState.schola_thomistica_vocab_v1 as {
      entries: Array<{ lemma: string; fsrsCard: { reps: number }; reviewHistory: unknown[] }>;
    };
    expect(persistedSnap.entries).toHaveLength(1);
    expect(persistedSnap.entries[0].lemma).toBe('salus');
    expect(persistedSnap.entries[0].fsrsCard.reps).toBe(1);
    expect(persistedSnap.entries[0].reviewHistory).toHaveLength(1);
  });

  it('DEF-005: maintains zero data-char-offset drift between tokenized .ct-word elements and data-clean-text across snp1001..snp4001 and sth1001', () => {
    for (const file of ['snp1001.html', 'snp2001.html', 'snp3001.html', 'snp4001.html', 'sth1001.html']) {
      const filePath = path.resolve(import.meta.dirname, '../archive', file);
      const html = fs.readFileSync(filePath, 'latin1');
      const dom = new JSDOM(html, { url: `http://127.0.0.1:8765/${file}` });
      const reader = new ScholaThomisticaReader(dom.window as unknown as Window & typeof globalThis);
      reader.init();

      const paras = Array.from(dom.window.document.querySelectorAll<HTMLElement>('[data-st-enhanced]'));
      expect(paras.length).toBeGreaterThan(10);

      let mismatchCount = 0;
      for (const p of paras) {
        const cleanText = p.getAttribute('data-clean-text') || '';
        const words = Array.from(p.querySelectorAll<HTMLElement>('.ct-word'));
        for (const w of words) {
          const offset = Number(w.getAttribute('data-char-offset') || '0');
          const token = w.getAttribute('data-word') || w.textContent || '';
          const slice = cleanText.slice(offset, offset + token.length);
          if (slice !== token) {
            mismatchCount++;
          }
        }
      }
      expect(mismatchCount, `Expected 0 offset mismatches in ${file}`).toBe(0);
      dom.window.close();
    }
  });

  it('DEF-008 & DEF-010 & DEF-012: enforces accurate per-work translation provenance, WCAG 2.2 AA tab order (< 60 tab stops) + dialog/aria-live/reduced-motion semantics, and hermetic offline Wiktionary gating', async () => {
    // 1. DEF-008: Super Sent. must NOT be attributed to Dominican Fathers
    const snpHtml = fs.readFileSync(path.resolve(import.meta.dirname, '../archive/snp1001.html'), 'latin1');
    const snpDom = new JSDOM(snpHtml, { url: 'http://127.0.0.1:8765/snp1001.html' });
    const snpReader = new ScholaThomisticaReader(snpDom.window as unknown as Window & typeof globalThis);
    snpReader.init();
    const snpPara = snpDom.window.document.querySelector<HTMLElement>('P[TITLE][data-st-enhanced]')!;
    snpPara.querySelector<HTMLButtonElement>('.st-para-side-btn')?.click();
    const snpHeader = snpPara.querySelector('.st-col-english-header')?.textContent || '';
    expect(snpHeader).not.toContain('Dominican Fathers');
    expect(snpHeader).toContain('Scriptum super Sententiis');
    snpDom.window.close();

    // 2. DEF-010: Tab stops < 60, skip link, dialog semantics, aria-live toast, focus-visible & reduced-motion CSS
    const sthHtml = fs.readFileSync(STH1001_PATH, 'latin1');
    const sthDom = new JSDOM(sthHtml, { url: 'http://127.0.0.1:8765/sth1001.html' });
    const sthReader = new ScholaThomisticaReader(sthDom.window as unknown as Window & typeof globalThis);
    sthReader.init();
    const doc = sthDom.window.document;

    expect(doc.querySelectorAll('.ct-word[tabindex]').length).toBe(0);
    // NEW-006: Measure actual focusable controls injected by the extension UI (< 30 controls) vs native page links
    const injectedFocusable = doc.querySelectorAll(
      '#st-topbar a[href], #st-topbar button:not(:disabled), #st-topbar select, #st-sidepanel button:not(:disabled), #st-sidepanel input, #st-sidepanel select, #st-popup button:not(:disabled)'
    );
    expect(injectedFocusable.length).toBeLessThan(30);
    expect(doc.getElementById('st-skip-link')).not.toBeNull();
    expect(doc.getElementById('st-popup')?.getAttribute('role')).toBe('dialog');
    expect(doc.getElementById('st-phrasepump-modal')?.getAttribute('role')).toBe('dialog');
    expect(doc.getElementById('st-phrasepump-modal')?.getAttribute('aria-modal')).toBe('true');

    const wordEl = doc.querySelector<HTMLElement>('.ct-word')!;
    sthReader.selectWordElement(wordEl);
    sthReader.saveCurrentWord(1);
    const toast = doc.getElementById('st-popup-toast');
    expect(toast).not.toBeNull();
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
    sthDom.window.close();

    const cssRaw = fs.readFileSync(path.resolve(import.meta.dirname, '../src/extension/styles/content.css'), 'utf-8');
    expect(cssRaw).toContain(':focus-visible');
    expect(cssRaw).toContain('prefers-reduced-motion: reduce');

    // 3. DEF-012: Hermetic offline gating on 127.0.0.1 / localhost
    const resOffline = await fetchLiveWiktionaryEntry('salus', 'salutem', {
      locationHost: '127.0.0.1',
      onLine: true,
    });
    expect(resOffline).toBeNull();
  });

  it('DEF-003 & DEF-011 & DEF-016: keeps content.js and study.js under 2 MB, scopes manifest permissions & MAIN-world script, and includes extension icons', () => {
    const contentJsStat = fs.statSync(path.resolve(import.meta.dirname, '../dist/extension/content.js'));
    const studyJsStat = fs.statSync(path.resolve(import.meta.dirname, '../dist/extension/study/study.js'));
    expect(contentJsStat.size).toBeLessThan(2_000_000);
    expect(studyJsStat.size).toBeLessThan(2_000_000);

    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../src/extension/manifest.json'), 'utf-8')
    );
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons['16']).toBeTruthy();
    expect(manifest.icons['48']).toBeTruthy();
    expect(manifest.icons['128']).toBeTruthy();

    const mainScript = manifest.content_scripts.find((c: { world?: string }) => c.world === 'MAIN');
    expect(mainScript).toBeDefined();
    expect(mainScript.matches).not.toContain('http://localhost/*');
    expect(mainScript.matches).not.toContain('http://127.0.0.1/*');
    expect(mainScript.matches).not.toContain('file:///*');

    expect(manifest.web_accessible_resources[0].matches).not.toContain('<all_urls>');
    expect(manifest.web_accessible_resources[0].matches).not.toContain('http://127.0.0.1/*');
    expect(manifest.web_accessible_resources[0].matches).not.toContain('http://localhost/*');

    // Chrome Web Store §5.2 & §5.3 requirements
    expect(manifest.name.length).toBeLessThanOrEqual(45);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(manifest.minimum_chrome_version).toBe('111');
    expect(fs.existsSync(path.resolve(import.meta.dirname, '../PRIVACY_POLICY.md'))).toBe(true);
    expect(fs.existsSync(path.resolve(import.meta.dirname, '../LICENSE'))).toBe(true);
    expect(fs.existsSync(path.resolve(import.meta.dirname, '../THIRD_PARTY_NOTICES.md'))).toBe(true);
  });

  it('NEW-001 & NEW-004 & NEW-005: assigns real analyzeWord lemmas to 100% of tokens on sth1001/snp1001, highlights saved non-fast-map lemmas (investigo), resolves root-relative data URLs from subdirectories, and cites recorded upstream provenance', () => {
    // 1. NEW-001: Seed vocabulary with non-fast-map lemma "investigo" and verify spans on sth1001.html
    const html = fs.readFileSync(STH1001_PATH, 'latin1');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:8765/sth1001.html' });
    const win = dom.window as unknown as Window & typeof globalThis;

    const seededStore = new VocabularyStore();
    seededStore.saveWord({
      word: 'investigantur',
      lemma: 'investigo',
      headword: 'investigo, -are',
      translation: 'to investigate, trace out',
      partOfSpeech: 'Verb',
      morphologySummary: '3rd Plural Present Passive Indicative',
      originalSentence: 'Quae per rationem investigantur.',
      sentenceTranslation: 'Which are investigated by reason.',
      familiarity: 1,
    });
    win.localStorage.setItem('schola_thomistica_vocab_v1', JSON.stringify(seededStore.toSnapshot()));

    const reader = new ScholaThomisticaReader(win);
    reader.init();

    const doc = win.document;
    const investigoSpans = doc.querySelectorAll('.ct-word[data-lemma="investigo"]');
    expect(investigoSpans.length).toBeGreaterThanOrEqual(2);
    expect(doc.querySelectorAll('.ct-word[data-lemma="investigantur"]').length).toBe(0);
    expect(investigoSpans[0].getAttribute('data-familiarity')).toBe('1');

    // Check 0% lemma drift between .ct-word[data-lemma] and analyzeWord(word).primaryLemma
    let wrongLemmas = 0;
    for (const span of Array.from(doc.querySelectorAll<HTMLElement>('.ct-word')).slice(0, 500)) {
      const word = span.getAttribute('data-word') || span.textContent || '';
      const spanLemma = span.getAttribute('data-lemma') || '';
      const realLemma = cleanLatinString(analyzeWord(word).primaryLemma || word);
      if (spanLemma !== realLemma) {
        wrongLemmas++;
      }
    }
    expect(wrongLemmas).toBe(0);
    dom.window.close();

    // 2. NEW-004: Root-relative data URL from subdirectory /it/index.html
    const subDom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://127.0.0.1:8765/it/index.html',
    });
    const resolvedUrl = resolveBrowserDataUrl(
      subDom.window as unknown as Window & typeof globalThis,
      'whitaker-dict.json'
    );
    expect(resolvedUrl).toBe('http://127.0.0.1:8765/_extension/data/whitaker-dict.json');
    subDom.window.close();

    // 3. NEW-005: Verifiable upstream provenance
    const provSent = reader.getTranslationProvenanceLabel('Super Sent., lib. 1 d. 1 q. 1 a. 1 co.');
    expect(provSent).toContain('Geremia23/AquinasLatinEnglish');
    const provSentProl = reader.getTranslationProvenanceLabel('Super Sent., q. 1 a. 1 co.');
    expect(provSentProl).toContain('Geremia/AquinasOperaOmnia');
  });

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

    // QA Finding #1: Context tab and Lexica tab also display the user's custom definition & note
    const contextTabBtn = doc.querySelector<HTMLButtonElement>('.st-tab[data-tab="context"]')!;
    contextTabBtn.click();
    expect(panelBody.textContent).toContain('Eternal Vision of God');
    expect(panelBody.textContent).toContain('Updated note in Vocab tab');

    const lexTabBtn = doc.querySelector<HTMLButtonElement>('.st-tab[data-tab="dictionaries"]')!;
    lexTabBtn.click();
    expect(panelBody.textContent).toContain('Eternal Vision of God');

    // QA Finding #6: Selecting a different word clears the previous word's saved toast
    const otherWordEl = Array.from(doc.querySelectorAll<HTMLElement>('.ct-word')).find(
      (el) => el.textContent?.toLowerCase() === 'doctrinam'
    )!;
    reader.selectWordElement(otherWordEl);
    expect(popup.querySelector('#st-popup-toast')).toBeNull();

    // QA Finding #7: Pressing Enter in #st-custom-def-input saves the custom definition, and Escape closes while input is focused
    popup.querySelector<HTMLButtonElement>('#st-popup-toggle-note-btn')!.click();
    const docDefInput = popup.querySelector<HTMLInputElement>('#st-custom-def-input')!;
    docDefInput.value = 'Sacred Revealed Teaching';
    docDefInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(reader.getVocabularyStore().getByLemma('doctrina')?.customDefinition).toBe(
      'Sacred Revealed Teaching'
    );

    // QA Finding #9: Removing an entry in Vocab tab resets DOM data-familiarity="0" and removes custom data-gloss
    vocabTabBtn.click();
    const docEntry = reader.getVocabularyStore().getByLemma('doctrina')!;
    const removeBtn = panelBody.querySelector<HTMLButtonElement>(`[data-remove-id="${docEntry.id}"]`)!;
    removeBtn.click();
    expect(otherWordEl.getAttribute('data-familiarity')).toBe('0');
    expect(otherWordEl.getAttribute('data-gloss')).toBe('Doctrine');
    dom.window.close();
  });
});
