import {
  cleanLatinString,
  classifyScholasticSection,
  extractParagraphCitationAndText,
  findContainingSentence,
} from '../core/normalizer';
import {
  analyzeWord,
  fetchLiveWiktionaryEntry,
  INLINE_THOMISTIC_GLOSSES,
} from '../core/dictionaries';
import {
  ensureDataLoaded,
  ensureLexicalDataLoaded,
  ensureParallelCorpusLoaded,
  isDataLoaded,
  isLexicalDataLoaded,
  isParallelCorpusLoaded,
  quickResolveTokenLemma,
} from '../core/data-loader';
import { analyzeWordInContext, ContextualAnalysisResult } from '../core/context-analyzer';
import { translateLatinSentence } from '../core/sentence-translator';
import {
  FSRSRating,
  PhrasePumpExercise,
  PhrasePumpExerciseType,
  generatePhrasePumpSession,
  scheduleFSRSReview,
} from '../core/fsrs';
import {
  FamiliarityLevel,
  VocabularyEntry,
  VocabularyStore,
} from '../core/vocabulary-store';
import { StatsTracker } from '../core/stats-tracker';

const STORAGE_KEY_VOCAB = 'schola_thomistica_vocab_v1';
const STORAGE_KEY_STATS = 'schola_thomistica_stats_v1';
const STORAGE_KEY_PREFS = 'schola_thomistica_prefs_v1';

interface ReaderPreferences {
  darkMode: boolean;
  bilingualMode: boolean;
  fontSizePx: number;
  readingMode: 'assisted' | 'guided' | 'independent';
  panelCollapsed: boolean;
  activeTab: 'context' | 'dictionaries' | 'vocabulary' | 'stats';
  liveWiktionary: boolean;
}

export class ScholaThomisticaReader {
  private win: Window & typeof globalThis;
  private doc: Document;
  private vocabStore: VocabularyStore;
  private statsTracker: StatsTracker;
  private prefs: ReaderPreferences = {
    darkMode: false,
    bilingualMode: false,
    fontSizePx: 18,
    readingMode: 'assisted',
    panelCollapsed: false,
    activeTab: 'context',
    liveWiktionary: true,
  };

  private selectedElement: HTMLElement | null = null;
  private currentAnalysis: ContextualAnalysisResult | null = null;
  private currentSentence = '';
  private currentCitation = '';
  private currentWorkTitle = 'Corpus Thomisticum';

  private currentSessionExercises: PhrasePumpExercise[] = [];
  private currentExerciseIndex = 0;
  private isAnswerRevealed = false;
  private phrasePumpMode: 'mixed' | PhrasePumpExerciseType = 'mixed';
  private lastSavedToast = '';
  private modalOpenerElement: HTMLElement | null = null;

  constructor(win: Window & typeof globalThis) {
    this.win = win;
    this.doc = win.document;
    this.vocabStore = new VocabularyStore();
    this.statsTracker = new StatsTracker(this.vocabStore);
    this.loadLocalState();
  }

  public getVocabularyStore(): VocabularyStore {
    return this.vocabStore;
  }

  public getStatsTracker(): StatsTracker {
    return this.statsTracker;
  }

  private loadLocalState(): void {
    try {
      const rawVocab = this.win.localStorage?.getItem(STORAGE_KEY_VOCAB);
      if (rawVocab) {
        const parsedSnap = JSON.parse(rawVocab);
        if (Array.isArray(parsedSnap?.entries)) {
          for (const e of parsedSnap.entries) {
            if (e.lemma === 'sum' && typeof e.translation === 'string' && e.translation.toLowerCase().includes('take up')) {
              e.translation = 'to be, exist';
            }
          }
        }
        this.vocabStore.loadSnapshot(parsedSnap);
      }
      const rawStats = this.win.localStorage?.getItem(STORAGE_KEY_STATS);
      if (rawStats) {
        this.statsTracker.loadSnapshot(JSON.parse(rawStats));
      }
      const rawPrefs = this.win.localStorage?.getItem(STORAGE_KEY_PREFS);
      if (rawPrefs) {
        this.prefs = { ...this.prefs, ...JSON.parse(rawPrefs) };
      }

      // Always merge from chrome.storage.local so vocabulary, stats, and preferences sync seamlessly
      // between live https://www.corpusthomisticum.org/, offline http://127.0.0.1:8765/, and the Study Center
      const chromeApi = (this.win as unknown as { chrome?: typeof chrome }).chrome;
      if (chromeApi?.storage?.local) {
        chromeApi.storage.local.get(
          [STORAGE_KEY_VOCAB, STORAGE_KEY_STATS, STORAGE_KEY_PREFS],
          (res) => {
            let changed = false;
            if (res?.[STORAGE_KEY_VOCAB]) {
              const mergedVocab = this.vocabStore.mergeSnapshot(res[STORAGE_KEY_VOCAB]);
              if (mergedVocab) changed = true;
              // Mirror merged union (including tombstones & migrations) to both localStorage and chrome.storage
              const mergedSnap = this.vocabStore.toSnapshot();
              this.win.localStorage?.setItem(STORAGE_KEY_VOCAB, JSON.stringify(mergedSnap));
              if (JSON.stringify(mergedSnap) !== JSON.stringify(res[STORAGE_KEY_VOCAB])) {
                chromeApi.storage.local.set({ [STORAGE_KEY_VOCAB]: mergedSnap });
              }
            } else if (this.vocabStore.getAll().length > 0 || Object.keys(this.vocabStore.toSnapshot().deletedLemmas || {}).length > 0) {
              chromeApi.storage.local.set({
                [STORAGE_KEY_VOCAB]: this.vocabStore.toSnapshot(),
              });
            }
            if (res?.[STORAGE_KEY_STATS]) {
              if (this.statsTracker.mergeSnapshot(res[STORAGE_KEY_STATS])) {
                changed = true;
              }
              this.win.localStorage?.setItem(
                STORAGE_KEY_STATS,
                JSON.stringify(this.statsTracker.toSnapshot())
              );
            }
            if (res?.[STORAGE_KEY_PREFS]) {
              this.prefs = { ...this.prefs, ...res[STORAGE_KEY_PREFS] };
              this.win.localStorage?.setItem(STORAGE_KEY_PREFS, JSON.stringify(this.prefs));
              changed = true;
            }
            if (changed && this.doc.body.classList.contains('st-reader-active')) {
              this.applyPreferences();
              for (const entry of this.vocabStore.getAll()) {
                this.updateLemmaDOMStatus(entry.lemma, entry.familiarity);
              }
              this.refreshTopBarCoverage();
              this.renderSidePanel();
            }
          }
        );

        chromeApi.storage.onChanged?.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          let changed = false;
          if (changes[STORAGE_KEY_VOCAB]?.newValue) {
            if (this.vocabStore.mergeSnapshot(changes[STORAGE_KEY_VOCAB].newValue)) {
              this.win.localStorage?.setItem(
                STORAGE_KEY_VOCAB,
                JSON.stringify(this.vocabStore.toSnapshot())
              );
              changed = true;
            }
          }
          if (changes[STORAGE_KEY_STATS]?.newValue) {
            if (this.statsTracker.mergeSnapshot(changes[STORAGE_KEY_STATS].newValue)) {
              this.win.localStorage?.setItem(
                STORAGE_KEY_STATS,
                JSON.stringify(this.statsTracker.toSnapshot())
              );
              changed = true;
            }
          }
          if (changed && this.doc.body.classList.contains('st-reader-active')) {
            for (const entry of this.vocabStore.getAll()) {
              this.updateLemmaDOMStatus(entry.lemma, entry.familiarity);
            }
            this.refreshTopBarCoverage();
            this.renderSidePanel();
          }
        });
      }
    } catch {
      // Ignore storage errors in sandboxed/test contexts
    }
  }

  private persistState(): void {
    try {
      const vocabSnap = this.vocabStore.toSnapshot();
      const statsSnap = this.statsTracker.toSnapshot();
      this.win.localStorage?.setItem(STORAGE_KEY_VOCAB, JSON.stringify(vocabSnap));
      this.win.localStorage?.setItem(STORAGE_KEY_STATS, JSON.stringify(statsSnap));
      this.win.localStorage?.setItem(STORAGE_KEY_PREFS, JSON.stringify(this.prefs));

      const chromeApi = (this.win as unknown as { chrome?: typeof chrome }).chrome;
      if (chromeApi?.storage?.local) {
        chromeApi.storage.local.set({
          [STORAGE_KEY_VOCAB]: vocabSnap,
          [STORAGE_KEY_STATS]: statsSnap,
          [STORAGE_KEY_PREFS]: this.prefs,
        });
      }
    } catch {
      // Ignore storage errors
    }
  }

  public init(): void {
    if (this.doc.body.classList.contains('st-reader-active')) {
      if (this.doc.body.getAttribute('data-st-version') === '1.2.0') return;
      // Upgrade older in-page reader instance to 1.2.0
      this.doc.getElementById('st-topbar')?.remove();
      this.doc.getElementById('st-popup')?.remove();
      this.doc.getElementById('st-sidepanel')?.remove();
      this.doc.getElementById('st-phrasepump-modal')?.remove();
    }
    this.doc.body.setAttribute('data-st-version', '1.2.0');
    // 1. Neutralize Corpus Thomisticum's legacy Perseus double-click popup in both isolated and capture phases
    this.doc.ondblclick = null;
    (this.win as unknown as { goPage?: () => void }).goPage = () => {};
    this.doc.addEventListener(
      'dblclick',
      (ev) => {
        ev.stopImmediatePropagation();
        ev.stopPropagation();
      },
      true
    );

    this.currentWorkTitle = this.doc.title || 'Corpus Thomisticum';
    this.doc.body.classList.add('st-reader-active');

    // 2. Inject UI containers (Topbar first child of body for keyboard Tab order, Popup, Sidepanel, PhrasePump Modal)
    this.createTopBar();
    this.createPopup();
    this.createSidePanel();
    this.createPhrasePumpModal();

    // 3. Tokenize and enhance Latin paragraphs
    const fullPageLatinText = this.enhanceLatinParagraphs();

    // 4. Apply preferences AFTER DOM containers and paragraphs exist so all button states sync on initial load
    this.applyPreferences();

    // 5. Record reading stats and refresh UI (reuse computed coverage report to avoid double page scan)
    const initialCoverage = this.statsTracker.RecordAndComputePageCoverage(
      fullPageLatinText,
      this.win.location?.pathname || 'index.html'
    );
    this.refreshTopBarCoverage(fullPageLatinText, initialCoverage);
    this.renderSidePanel();
    this.bindGlobalKeyboardShortcuts();
    this.syncLayoutOffsets();

    // NEW-001 & NEW-003: In browser contexts where lexical data was not yet loaded at first paint,
    // hydrate the lexical dictionaries (without the 27 MB parallel corpus) right after paint and recompute all token lemmas & coverage
    if (!isLexicalDataLoaded() && typeof this.win.setTimeout === 'function') {
      this.win.setTimeout(() => {
        void ensureLexicalDataLoaded(this.win).then((ok) => {
          if (ok) {
            this.rehydratePageLemmasAndCoverage();
          }
        });
      }, 40);
    }
  }

  public rehydratePageLemmasAndCoverage(): void {
    const spans = Array.from(this.doc.querySelectorAll<HTMLElement>('.ct-word'));
    if (spans.length === 0) return;

    const hasAnyVocab = this.vocabStore.getAll().length > 0;
    const wordsList: string[] = [];
    for (const span of spans) {
      const part = span.getAttribute('data-word') || span.textContent || '';
      if (!part) continue;
      wordsList.push(part);
      const analysis = analyzeWord(part);
      const lemma = cleanLatinString(analysis.primaryLemma || part);
      if (span.getAttribute('data-lemma') !== lemma) {
        span.setAttribute('data-lemma', lemma);
      }
      const clean = hasAnyVocab ? cleanLatinString(part) : lemma;
      const fam = hasAnyVocab
        ? this.vocabStore.getLemmaFamiliarity(lemma) ||
          this.vocabStore.getLemmaFamiliarity(clean)
        : this.vocabStore.getLemmaFamiliarity(lemma);
      span.setAttribute('data-familiarity', String(fam));

      const isThomistic = Boolean(INLINE_THOMISTIC_GLOSSES[lemma]);
      const savedEntry =
        this.vocabStore.getByLemma(lemma) || this.vocabStore.getByLemma(clean);
      const customShortGloss = (savedEntry?.customDefinition || '')
        .split(/[;,.(]/)[0]
        .trim()
        .slice(0, 24);
      if (isThomistic) {
        span.setAttribute('data-thomistic', 'true');
        const shortGloss = customShortGloss || INLINE_THOMISTIC_GLOSSES[lemma];
        if (shortGloss) {
          span.setAttribute('data-gloss', shortGloss);
        }
      } else if (customShortGloss || (fam >= 1 && fam <= 3)) {
        const shortGloss =
          customShortGloss ||
          INLINE_THOMISTIC_GLOSSES[lemma] ||
          (savedEntry?.translation || analysis.ecclesiasticalMeaning || '')
            .split(/[;,.(]/)[0]
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .join(' ');
        if (shortGloss) {
          span.setAttribute('data-gloss', shortGloss);
        }
      } else if (fam === 4) {
        span.removeAttribute('data-gloss');
      }
    }

    const fullText = wordsList.join(' ');
    const report = this.statsTracker.RecordAndComputePageCoverage(
      fullText,
      this.win.location?.pathname || 'index.html'
    );
    this.refreshTopBarCoverage(fullText, report);
    this.renderSidePanel();
  }

  public syncLayoutOffsets(): void {
    const topbarEl = this.doc.getElementById('st-topbar');
    const sidepanelEl = this.doc.getElementById('st-sidepanel');
    if (topbarEl && sidepanelEl) {
      const tbHeight = Math.max(48, Math.round(topbarEl.getBoundingClientRect().height));
      sidepanelEl.style.top = `${tbHeight}px`;
      this.doc.body.style.setProperty('padding-top', `${tbHeight + 12}px`, 'important');
    }
  }

  private applyPreferences(): void {
    this.doc.body.classList.toggle('st-dark-mode', this.prefs.darkMode);
    this.doc.body.classList.toggle('st-bilingual-mode', this.prefs.bilingualMode);
    this.doc.body.classList.toggle('st-panel-collapsed', this.prefs.panelCollapsed);
    this.doc.body.setAttribute('data-reading-mode', this.prefs.readingMode);
    this.doc.documentElement.style.setProperty(
      '--st-reader-font-size',
      `${this.prefs.fontSizePx}px`
    );

    const modeSelect = this.doc.getElementById('st-reading-mode-select') as HTMLSelectElement | null;
    if (modeSelect) {
      modeSelect.value = this.prefs.readingMode;
    }

    const biBtn = this.doc.getElementById('st-bilingual-toggle');
    if (biBtn) {
      biBtn.classList.toggle('st-btn-primary', this.prefs.bilingualMode);
      biBtn.setAttribute('aria-pressed', String(this.prefs.bilingualMode));
      biBtn.textContent = this.prefs.bilingualMode ? 'Side-by-Side EN: ON' : 'Side-by-Side EN';
    }

    const darkBtn = this.doc.getElementById('st-dark-toggle');
    if (darkBtn) {
      darkBtn.classList.toggle('st-btn-primary', this.prefs.darkMode);
      darkBtn.setAttribute('aria-pressed', String(this.prefs.darkMode));
      darkBtn.textContent = this.prefs.darkMode ? 'Nocturne: ON' : 'Nocturne';
    }

    const panelBtn = this.doc.getElementById('st-toggle-panel');
    if (panelBtn) {
      const panelOpen = !this.prefs.panelCollapsed;
      panelBtn.setAttribute('aria-pressed', String(panelOpen));
      panelBtn.textContent = panelOpen ? 'Side Panel: ON' : 'Side Panel: OFF';
    }

    const sidepanelEl = this.doc.getElementById('st-sidepanel') as HTMLElement | null;
    if (sidepanelEl) {
      sidepanelEl.setAttribute('aria-hidden', String(this.prefs.panelCollapsed));
      (sidepanelEl as unknown as { inert?: boolean }).inert = this.prefs.panelCollapsed;
    }

    const decBtn = this.doc.getElementById('st-font-dec') as HTMLButtonElement | null;
    if (decBtn) {
      const atMin = this.prefs.fontSizePx <= 14;
      decBtn.disabled = atMin;
      decBtn.setAttribute('aria-disabled', String(atMin));
      decBtn.title = atMin
        ? 'Minimum font size reached (14px)'
        : `Decrease font size (currently ${this.prefs.fontSizePx}px)`;
    }

    const incBtn = this.doc.getElementById('st-font-inc') as HTMLButtonElement | null;
    if (incBtn) {
      const atMax = this.prefs.fontSizePx >= 26;
      incBtn.disabled = atMax;
      incBtn.setAttribute('aria-disabled', String(atMax));
      incBtn.title = atMax
        ? 'Maximum font size reached (26px)'
        : `Increase font size (currently ${this.prefs.fontSizePx}px)`;
    }

    if (this.prefs.bilingualMode) {
      this.populateAllBilingualColumns();
    }
    this.syncAllParagraphBilingualButtons();
    this.syncLayoutOffsets();
    if (this.selectedElement) {
      this.positionPopup();
    }
  }

  public syncAllParagraphBilingualButtons(resetLocalOverrides = false): void {
    const paras = Array.from(this.doc.querySelectorAll<HTMLElement>('P[TITLE][data-st-enhanced]'));
    for (const p of paras) {
      if (resetLocalOverrides) {
        p.classList.remove('st-bilingual-open', 'st-bilingual-closed');
      }
      const sideBtn = p.querySelector<HTMLButtonElement>('.st-para-side-btn');
      if (!sideBtn) continue;
      const isVisible =
        p.classList.contains('st-bilingual-open') ||
        (this.prefs.bilingualMode && !p.classList.contains('st-bilingual-closed'));
      sideBtn.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
      sideBtn.textContent = isVisible ? 'Hide Side-by-Side' : 'Side-by-Side English';
    }
  }

  private enhanceLatinParagraphs(): string {
    const paragraphs = Array.from(this.doc.querySelectorAll<HTMLElement>('P[TITLE], P'));
    const collectedSentences: string[] = [];

    for (const p of paragraphs) {
      if (p.hasAttribute('data-st-enhanced')) continue;
      const rawText = p.textContent || '';
      if (rawText.trim().length < 20) continue;

      const titleAttr = p.getAttribute('TITLE') || p.getAttribute('title') || '';
      const refEl = p.querySelector('.ref');
      const hasRefElement = Boolean(refEl);
      const extracted =
        hasRefElement && titleAttr
          ? {
              citation: titleAttr.replace(/\u00AA/g, '').replace(/\u00BA/g, '').replace(/\s+/g, ' ').trim(),
              corpusId: refEl?.textContent?.match(/\[(\d+)\]/)?.[1],
              sectionType: classifyScholasticSection(titleAttr, ''),
              cleanText: '',
            }
          : extractParagraphCitationAndText(rawText, titleAttr);
      p.setAttribute('data-st-enhanced', 'true');
      p.setAttribute('data-section-type', extracted.sectionType);
      if (!hasRefElement) {
        p.setAttribute('data-clean-text', extracted.cleanText);
        collectedSentences.push(extracted.cleanText);
      }
      if (extracted.citation) {
        p.setAttribute('data-citation', extracted.citation);
      }
      if (extracted.corpusId) {
        p.setAttribute('data-corpus-id', extracted.corpusId);
      }

      // Tokenize text nodes inside paragraph (skipping SPAN.ref) and build exact tokenizedText in lockstep
      let charCounter = 0;
      const tokenizedChunks: string[] = [];
      const tokenizeNode = (node: Node): void => {
        if (node.nodeType === 3) {
          // Text node
          const text = node.nodeValue || '';
          if (!/[A-Za-z\u00C0-\u00FF\u0100-\u017E]/.test(text)) {
            tokenizedChunks.push(text);
            charCounter += text.length;
            return;
          }
          const htmlParts: string[] = [];
          const parts = text.split(/([A-Za-z\u00C0-\u00FF\u0100-\u017E\u00C6\u00E6\u0152\u0153]+)/);
          const hasAnyVocab = this.vocabStore.getAll().length > 0;
          const lexicalReady = isLexicalDataLoaded();
          for (let partIdx = 0; partIdx < parts.length; partIdx++) {
            const part = parts[partIdx];
            if (!part) continue;
            if (partIdx % 2 === 1 && !/^[IVXLCDM]+$/.test(part)) {
              const lemma = lexicalReady
                ? cleanLatinString(analyzeWord(part).primaryLemma || part)
                : quickResolveTokenLemma(part);
              const clean = hasAnyVocab ? cleanLatinString(part) : lemma;
              const fam = hasAnyVocab
                ? this.vocabStore.getLemmaFamiliarity(lemma) ||
                  this.vocabStore.getLemmaFamiliarity(clean)
                : this.vocabStore.getLemmaFamiliarity(lemma);
              const isThomistic = Boolean(INLINE_THOMISTIC_GLOSSES[lemma]);
              const savedEntry = hasAnyVocab
                ? this.vocabStore.getByLemma(lemma) || this.vocabStore.getByLemma(clean)
                : undefined;
              const customShortGloss = (savedEntry?.customDefinition || '')
                .split(/[;,.(]/)[0]
                .trim()
                .slice(0, 24);

              let extraAttrs = '';
              if (isThomistic) {
                const shortGloss = customShortGloss || INLINE_THOMISTIC_GLOSSES[lemma];
                extraAttrs = ` data-thomistic="true"${shortGloss ? ` data-gloss="${this.escapeHtml(shortGloss)}"` : ''}`;
              } else if (customShortGloss || (fam >= 1 && fam <= 3)) {
                const shortGloss =
                  customShortGloss ||
                  INLINE_THOMISTIC_GLOSSES[lemma] ||
                  (savedEntry?.translation || '')
                    .split(/[;,.(]/)[0]
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .join(' ');
                if (shortGloss) {
                  extraAttrs = ` data-gloss="${this.escapeHtml(shortGloss)}"`;
                }
              }
              htmlParts.push(
                `<span class="ct-word" role="button" tabindex="-1" data-word="${part}" data-lemma="${lemma}" data-familiarity="${fam}"${extraAttrs} data-char-offset="${charCounter}">${part}</span>`
              );
            } else {
              htmlParts.push(this.escapeHtml(part));
            }
            tokenizedChunks.push(part);
            charCounter += part.length;
          }
          const tpl = this.doc.createElement('template');
          tpl.innerHTML = htmlParts.join('');
          node.parentNode?.replaceChild(tpl.content, node);
        } else if (node.nodeType === 1) {
          const el = node as HTMLElement;
          if (
            el.classList.contains('ref') ||
            el.classList.contains('st-para-bar') ||
            el.classList.contains('st-parallel-drawer')
          ) {
            return;
          }
          const children = Array.from(el.childNodes);
          for (const child of children) {
            tokenizeNode(child);
          }
        }
      };

      // Move children into detached container BEFORE tokenizing so DOM mutations happen off-tree (zero layout thrash)
      const columnsWrap = titleAttr ? this.doc.createElement('div') : null;
      const latinCol = titleAttr ? this.doc.createElement('div') : null;
      const englishCol = titleAttr ? this.doc.createElement('div') : null;
      const targetRoot: HTMLElement = latinCol || p;
      if (latinCol && columnsWrap && englishCol) {
        columnsWrap.className = 'st-para-columns';
        latinCol.className = 'st-col-latin';
        englishCol.className = 'st-col-english';
        while (p.firstChild) {
          latinCol.appendChild(p.firstChild);
        }
      }

      const children = Array.from(targetRoot.childNodes);
      for (const child of children) {
        tokenizeNode(child);
      }
      if (hasRefElement) {
        const exactTokenizedText = tokenizedChunks.join('');
        p.setAttribute('data-clean-text', exactTokenizedText);
        extracted.cleanText = exactTokenizedText.trim();
        extracted.sectionType = classifyScholasticSection(extracted.citation, extracted.cleanText);
        p.setAttribute('data-section-type', extracted.sectionType);
        collectedSentences.push(extracted.cleanText);
      }

      // If paragraph has a Scholastic TITLE attribute, attach .st-para-columns and .st-parallel-drawer in a single batch
      if (titleAttr && columnsWrap && latinCol && englishCol) {
        columnsWrap.appendChild(latinCol);
        columnsWrap.appendChild(englishCol);

        const bar = this.doc.createElement('div');
        bar.className = 'st-para-bar';

        const badge = this.doc.createElement('span');
        badge.className = 'st-section-badge';
        badge.setAttribute('data-type', extracted.sectionType);
        const typeLabels: Record<string, string> = {
          prooemium: 'Prooemium',
          objection: 'Obiectio',
          sed_contra: 'Sed Contra',
          corpus: 'Respondeo (Corpus)',
          reply: 'Responsio ad Obj.',
          other: 'Textus',
        };
        badge.textContent = `${typeLabels[extracted.sectionType] || 'Textus'} \u2022 ${extracted.citation}`;

        const btnGroup = this.doc.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '6px';
        btnGroup.style.alignItems = 'center';

        const toggleBtn = this.doc.createElement('button');
        toggleBtn.className = 'st-para-btn st-para-gloss-btn';
        toggleBtn.type = 'button';
        toggleBtn.textContent = 'Show Parallel & Gloss';
        toggleBtn.setAttribute('aria-expanded', 'false');

        const sideBtn = this.doc.createElement('button');
        sideBtn.className = 'st-para-btn st-para-side-btn';
        sideBtn.type = 'button';
        sideBtn.textContent = 'Side-by-Side English';
        sideBtn.setAttribute('aria-expanded', 'false');

        const drawer = this.doc.createElement('div');
        drawer.className = 'st-parallel-drawer';

        sideBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const currentlyVisible =
            p.classList.contains('st-bilingual-open') ||
            (this.prefs.bilingualMode && !p.classList.contains('st-bilingual-closed'));

          if (currentlyVisible) {
            p.classList.remove('st-bilingual-open');
            p.classList.add('st-bilingual-closed');
            sideBtn.setAttribute('aria-expanded', 'false');
            sideBtn.textContent = 'Side-by-Side English';
          } else {
            p.classList.remove('st-bilingual-closed');
            p.classList.add('st-bilingual-open');
            sideBtn.setAttribute('aria-expanded', 'true');
            sideBtn.textContent = 'Hide Side-by-Side';
            this.populateEnglishColumnForParagraph(p, englishCol, extracted.cleanText, extracted.citation);
          }
          if (this.selectedElement) {
            this.positionPopup();
          }
        });

        const renderDrawerContent = (): void => {
          const tr = translateLatinSentence(
            extracted.cleanText,
            extracted.citation,
            extracted.cleanText
          );
          const phrasesHtml = tr.interlinearGloss
            .map(
              (tok) => `
                <div style="display:inline-block;padding:4px 8px;margin:2px;background:var(--st-bg-elevated);border:1px solid var(--st-border);border-radius:5px;">
                  <div style="font-family:var(--st-font-latin);font-weight:700;color:var(--st-accent-rubric);">${this.escapeHtml(tok.word)}</div>
                  <div style="font-size:12px;">${this.escapeHtml(tok.gloss)}</div>
                  <div style="font-size:10px;color:var(--st-text-muted);">${this.escapeHtml(tok.lemma)} \u2022 ${this.escapeHtml(tok.morphShort)}</div>
                </div>
              `
            )
            .join('');

          const isSideBySideVisible =
            p.classList.contains('st-bilingual-open') ||
            (this.prefs.bilingualMode && !p.classList.contains('st-bilingual-closed'));

          const provLabel = this.getTranslationProvenanceLabel(extracted.citation);
          if (tr.referenceTranslation && !isSideBySideVisible) {
            drawer.innerHTML = `
              <div style="font-weight:700;color:var(--st-accent-rubric);margin-bottom:4px;">
                English Reference Translation (${this.escapeHtml(provLabel)}):
              </div>
              <div style="margin-bottom:10px;">${this.escapeHtml(tr.referenceTranslation)}</div>
              <details open style="margin-top:6px;border-top:1px dashed var(--st-border);padding-top:6px;">
                <summary style="cursor:pointer;font-weight:700;font-size:12px;color:var(--st-accent-teal);">
                  Interlinear Word-by-Word Gloss (${tr.interlinearGloss.length} words)
                </summary>
                <div style="line-height:1.6;margin-top:8px;">${phrasesHtml}</div>
              </details>
            `;
          } else {
            drawer.innerHTML = `
              <details open style="margin-top:2px;">
                <summary style="cursor:pointer;font-weight:700;font-size:12px;color:var(--st-accent-teal);">
                  Interlinear Word-by-Word Gloss (${tr.interlinearGloss.length} words)
                </summary>
                <div style="line-height:1.6;margin-top:8px;">${phrasesHtml}</div>
              </details>
            `;
          }
        };

        toggleBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const isOpen = drawer.classList.toggle('st-open');
          toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          toggleBtn.textContent = isOpen ? 'Hide Parallel & Gloss' : 'Show Parallel & Gloss';
          if (isOpen) {
            renderDrawerContent();
            if (!isDataLoaded()) {
              void ensureDataLoaded(this.win).then(() => {
                if (drawer.classList.contains('st-open')) {
                  renderDrawerContent();
                }
              });
            }
          }
          if (this.selectedElement) {
            this.positionPopup();
          }
        });

        btnGroup.appendChild(sideBtn);
        btnGroup.appendChild(toggleBtn);
        bar.appendChild(badge);
        bar.appendChild(btnGroup);
        p.appendChild(bar);
        p.appendChild(columnsWrap);
        p.appendChild(drawer);
      }
    }

    // BUG-03: Roving tabindex on .ct-word — exactly 1 word has tabindex="0" so keyboard users can Tab into the text
    // and navigate between words with ArrowLeft/ArrowRight without adding 4,500 tab stops
    if (!this.doc.querySelector('.ct-word[tabindex="0"]')) {
      const firstWord = this.doc.querySelector<HTMLElement>('.ct-word');
      firstWord?.setAttribute('tabindex', '0');
    }

    if (this.prefs.bilingualMode) {
      this.populateAllBilingualColumns();
    }
    return collectedSentences.join(' ');
  }

  public getTranslationProvenanceLabel(citation?: string): string {
    const c = (citation || this.currentCitation || '').toLowerCase();
    if (c.includes('super sent') || c.includes('sent.')) {
      if (/\b(?:pr\.|q\.\s*1\b)/.test(c) && !c.includes('lib.')) {
        return 'Ralph McInerny (1998) via Geremia/AquinasOperaOmnia, Scriptum super Sententiis';
      }
      return 'Parallel Reference Corpus (Geremia23/AquinasLatinEnglish), Scriptum super Sententiis';
    }
    if (c.includes('contra gentiles') || c.includes('scg')) {
      return 'Parallel Reference Corpus (Geremia/AquinasOperaOmnia & Geremia23/AquinasLatinEnglish), Summa Contra Gentiles';
    }
    if (/\b(?:i|ii|iii|suppl)\b/.test(c) && /\bq\.\s*\d+/.test(c) && !c.includes('quodlibet')) {
      return 'Fathers of the English Dominican Province (1920, Public Domain), Summa Theologiae';
    }
    if (c.includes('summa theologiae')) {
      return 'Fathers of the English Dominican Province (1920, Public Domain), Summa Theologiae';
    }
    return 'Isidore.co / AquinasOperaOmnia (Geremia/AquinasOperaOmnia & Geremia23/AquinasLatinEnglish)';
  }

  private populateEnglishColumnForParagraph(
    p: HTMLElement,
    englishCol: HTMLElement,
    cleanText: string,
    citation: string
  ): void {
    if (englishCol.hasAttribute('data-loaded')) return;
    if (!isParallelCorpusLoaded()) {
      englishCol.innerHTML = `
        <div class="st-col-english-header">
          Loading Reference Translation (${this.escapeHtml(citation || 'Parallel Text')})...
        </div>
        <div style="font-size:0.92em;color:var(--st-text-secondary);">
          Loading parallel English corpus...
        </div>
      `;
      void Promise.all([
        ensureLexicalDataLoaded(this.win),
        ensureParallelCorpusLoaded(this.win),
      ]).then(([, parallelOk]) => {
        englishCol.removeAttribute('data-loaded');
        if (parallelOk) {
          this.populateEnglishColumnForParagraph(p, englishCol, cleanText, citation);
        } else {
          this.renderFallbackEnglishColumn(p, englishCol, citation);
        }
      });
      return;
    }
    englishCol.setAttribute('data-loaded', 'true');
    const tr = translateLatinSentence(cleanText, citation, cleanText);
    const provLabel = this.getTranslationProvenanceLabel(citation);
    if (tr.referenceTranslation) {
      englishCol.innerHTML = `
        <div class="st-col-english-header">
          English Translation \u2022 ${this.escapeHtml(provLabel)} (${this.escapeHtml(citation || 'Parallel Text')})
        </div>
        <div>${this.escapeHtml(tr.referenceTranslation)}</div>
      `;
    } else {
      this.renderFallbackEnglishColumn(p, englishCol, citation);
    }
    p.setAttribute('data-bilingual-ready', 'true');
  }

  private renderFallbackEnglishColumn(
    p: HTMLElement,
    englishCol: HTMLElement,
    citation: string
  ): void {
    englishCol.setAttribute('data-loaded', 'true');
    englishCol.innerHTML = `
      <div class="st-col-english-header">
        No Bundled Reference Translation (${this.escapeHtml(citation || 'Section')})
      </div>
      <div style="font-size:0.92em;color:var(--st-text-secondary);margin-bottom:8px;">
        No authoritative English translation is bundled for this specific paragraph. Use the Interlinear Word-by-Word Gloss below or click any Latin word to inspect its 5 dictionaries.
      </div>
      <button type="button" class="st-para-btn st-open-gloss-from-col">Open Interlinear Word-by-Word Gloss Below</button>
    `;
    englishCol.querySelector('.st-open-gloss-from-col')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const glossBtn = p.querySelector<HTMLButtonElement>('.st-para-gloss-btn');
      if (glossBtn && glossBtn.getAttribute('aria-expanded') !== 'true') {
        glossBtn.click();
      }
    });
    p.setAttribute('data-bilingual-ready', 'true');
  }

  public populateAllBilingualColumns(): void {
    const paras = Array.from(this.doc.querySelectorAll<HTMLElement>('P[TITLE][data-st-enhanced]'));
    for (const p of paras) {
      const englishCol = p.querySelector<HTMLElement>('.st-col-english');
      if (!englishCol) continue;
      const cleanText = p.getAttribute('data-clean-text') || '';
      const citation = p.getAttribute('data-citation') || p.getAttribute('TITLE') || '';
      this.populateEnglishColumnForParagraph(p, englishCol, cleanText, citation);
    }
  }

  public selectWordElement(wordEl: HTMLElement): void {
    if (this.selectedElement !== wordEl) {
      this.lastSavedToast = '';
    }
    if (this.selectedElement) {
      this.selectedElement.classList.remove('ct-selected');
    }
    this.doc.querySelectorAll<HTMLElement>('.ct-word[tabindex="0"]').forEach((el) => {
      if (el !== wordEl) el.setAttribute('tabindex', '-1');
    });
    wordEl.setAttribute('tabindex', '0');
    this.selectedElement = wordEl;
    wordEl.classList.add('ct-selected');

    const rawWord = wordEl.getAttribute('data-word') || wordEl.textContent || '';
    const charOffset = Number(wordEl.getAttribute('data-char-offset') || '0');
    const para = wordEl.closest('[data-st-enhanced], p') as HTMLElement | null;
    const citationAttr = para?.getAttribute('data-citation') || para?.getAttribute('TITLE') || para?.getAttribute('title') || '';
    const corpusIdAttr = para?.getAttribute('data-corpus-id') || '';
    const cleanParaText = para?.getAttribute('data-clean-text') || para?.textContent || '';

    const sentenceMeta = findContainingSentence(cleanParaText, charOffset, citationAttr);
    const charOffsetInSentence = Math.max(0, charOffset - sentenceMeta.sentenceStartOffset);

    this.currentSentence = sentenceMeta.sentence;
    this.currentCitation = sentenceMeta.citation
      ? `${corpusIdAttr ? `[${corpusIdAttr}] ` : ''}${sentenceMeta.citation}`
      : '';

    this.currentAnalysis = analyzeWordInContext(
      rawWord,
      this.currentSentence,
      sentenceMeta.citation,
      cleanParaText,
      charOffsetInSentence
    );
    wordEl.setAttribute(
      'data-lemma',
      cleanLatinString(this.currentAnalysis.wordAnalysis.primaryLemma || rawWord)
    );

    this.renderPopup(wordEl, this.currentAnalysis);
    this.prefs.activeTab = 'context';
    this.renderSidePanel();

    // NEW-003: Only load lexical datasets (~18 MB) on word click, NOT the 27 MB parallel corpus
    if (!isLexicalDataLoaded()) {
      void ensureLexicalDataLoaded(this.win).then((ok) => {
        if (!ok) return;
        this.rehydratePageLemmasAndCoverage();
        if (this.selectedElement === wordEl) {
          this.currentAnalysis = analyzeWordInContext(
            rawWord,
            this.currentSentence,
            sentenceMeta.citation,
            cleanParaText,
            charOffsetInSentence
          );
          wordEl.setAttribute(
            'data-lemma',
            cleanLatinString(this.currentAnalysis.wordAnalysis.primaryLemma || rawWord)
          );
          const noteEditorEl = this.doc.getElementById('st-popup-note-editor');
          const isEditingNote = Boolean(noteEditorEl && noteEditorEl.style.display !== 'none');
          if (!isEditingNote) {
            this.renderPopup(wordEl, this.currentAnalysis);
          }
          this.renderSidePanel();
        }
      });
    }

    // Enrich Wiktionary entry live in the background when online and user has not opted out
    const primaryLemma = this.currentAnalysis.wordAnalysis.primaryLemma;
    if (this.prefs.liveWiktionary !== false) {
      void fetchLiveWiktionaryEntry(primaryLemma, rawWord, {
        locationHost: this.win.location?.hostname,
        onLine: this.win.navigator?.onLine,
      }).then((liveEntry) => {
        if (liveEntry && this.selectedElement === wordEl) {
          this.currentAnalysis = analyzeWordInContext(
            rawWord,
            this.currentSentence,
            sentenceMeta.citation,
            cleanParaText,
            charOffsetInSentence
          );
          const noteEditorEl = this.doc.getElementById('st-popup-note-editor');
          const isEditingNote = Boolean(noteEditorEl && noteEditorEl.style.display !== 'none');
          if (!isEditingNote) {
            this.renderPopup(wordEl, this.currentAnalysis);
          }
          this.renderSidePanel();
        }
      });
    }
  }

  public saveCurrentWord(familiarity: FamiliarityLevel = 1): VocabularyEntry | undefined {
    if (!this.currentAnalysis) return undefined;
    const wa = this.currentAnalysis.wordAnalysis;
    const parse = this.currentAnalysis.selectedParse || wa.morphologicalParses[0];

    // If the user has unsaved draft text open in #st-popup-note-editor, preserve it when rating familiarity
    const noteEditorEl = this.doc.getElementById('st-popup-note-editor');
    const isEditingNote = Boolean(noteEditorEl && noteEditorEl.style.display !== 'none');
    const draftDef = isEditingNote
      ? this.doc.querySelector<HTMLInputElement>('#st-custom-def-input')?.value?.trim()
      : undefined;
    const draftNote = isEditingNote
      ? this.doc.querySelector<HTMLTextAreaElement>('#st-custom-note-input')?.value?.trim()
      : undefined;

    const tags = ['Corpus Thomisticum'];
    if (wa.isThomisticKeyTerm) tags.push('Thomistic Key Term');
    if (this.currentCitation) tags.push(this.currentCitation.split('q.')[0].trim());

    const saved = this.vocabStore.saveWord({
      word: wa.word,
      lemma: wa.primaryLemma,
      headword: wa.headword,
      translation: wa.ecclesiasticalMeaning.split(';')[0].trim(),
      ...(draftDef !== undefined ? { customDefinition: draftDef } : {}),
      ...(draftNote !== undefined ? { notes: draftNote } : {}),
      contextualMeaning: this.currentAnalysis.contextualMeaning,
      partOfSpeech: wa.partOfSpeech,
      morphologySummary: parse ? parse.formExplanation : wa.partOfSpeech,
      originalSentence: this.currentSentence,
      sentenceTranslation:
        this.currentAnalysis.sentenceTranslation.contextualTranslation ||
        this.currentAnalysis.sentenceTranslation.literalTranslation,
      sourceWork: this.currentWorkTitle,
      sourceCitation: this.currentCitation,
      sourceUrl: this.win.location?.href || '',
      familiarity,
      tags: Array.from(new Set(tags.filter(Boolean))),
    });

    const famLabels: Record<number, string> = {
      1: 'New (Learning)',
      2: 'Familiar',
      3: 'Learned',
      4: 'Known',
    };
    this.lastSavedToast = `\u2713 Saved "${wa.primaryLemma}" as ${famLabels[familiarity] || 'Learning'}`;

    this.updateLemmaDOMStatus(saved.lemma, familiarity);
    this.persistState();
    this.renderSidePanel();
    if (this.selectedElement && this.currentAnalysis) {
      this.renderPopup(this.selectedElement, this.currentAnalysis);
    }

    // OBS-01: If parallel corpus was not yet loaded when saving, hydrate it in background and upgrade sentenceTranslation
    if (!this.currentAnalysis.sentenceTranslation.contextualTranslation && !isParallelCorpusLoaded()) {
      const savedSentence = this.currentSentence;
      const savedCit = this.currentCitation.replace(/^\[\d+\]\s*/, '');
      void ensureParallelCorpusLoaded(this.win).then((ok) => {
        if (ok) {
          const tr = translateLatinSentence(savedSentence, savedCit, savedSentence);
          if (tr.contextualTranslation) {
            this.vocabStore.updateEntry(saved.id, { sentenceTranslation: tr.contextualTranslation });
            this.persistState();
            this.renderSidePanel();
          }
        }
      });
    }
    return saved;
  }

  public saveCurrentWordAnnotation(
    customDefinition: string,
    notes: string
  ): VocabularyEntry | undefined {
    if (!this.currentAnalysis) return undefined;
    const wa = this.currentAnalysis.wordAnalysis;
    const parse = this.currentAnalysis.selectedParse || wa.morphologicalParses[0];
    const existing = this.vocabStore.getByLemma(wa.primaryLemma);
    const currentFam = this.vocabStore.getLemmaFamiliarity(wa.primaryLemma);
    const targetFam: FamiliarityLevel = currentFam > 0 ? currentFam : 1;

    const tags = ['Corpus Thomisticum'];
    if (wa.isThomisticKeyTerm) tags.push('Thomistic Key Term');
    if (this.currentCitation) tags.push(this.currentCitation.split('q.')[0].trim());

    const saved = this.vocabStore.saveWord({
      word: wa.word,
      lemma: wa.primaryLemma,
      headword: wa.headword,
      translation: existing?.translation || wa.ecclesiasticalMeaning.split(';')[0].trim(),
      customDefinition: customDefinition.trim(),
      notes: notes.trim(),
      contextualMeaning: this.currentAnalysis.contextualMeaning,
      partOfSpeech: wa.partOfSpeech,
      morphologySummary: parse ? parse.formExplanation : wa.partOfSpeech,
      originalSentence: this.currentSentence,
      sentenceTranslation:
        this.currentAnalysis.sentenceTranslation.contextualTranslation ||
        this.currentAnalysis.sentenceTranslation.literalTranslation,
      sourceWork: this.currentWorkTitle,
      sourceCitation: this.currentCitation,
      sourceUrl: this.win.location?.href || '',
      familiarity: targetFam,
      tags: Array.from(new Set(tags.filter(Boolean))),
    });

    const trimmedDef = customDefinition.trim();
    const trimmedNote = notes.trim();
    this.lastSavedToast =
      trimmedDef || trimmedNote
        ? `\u2713 Saved personal definition & note for "${wa.primaryLemma}"`
        : `\u2713 Cleared personal definition & note for "${wa.primaryLemma}"`;
    this.updateLemmaDOMStatus(saved.lemma, saved.familiarity);
    this.persistState();
    this.renderSidePanel();
    if (this.selectedElement && this.currentAnalysis) {
      this.renderPopup(this.selectedElement, this.currentAnalysis);
    }
    return saved;
  }

  private formatShortInlineGloss(rawText?: string): string {
    if (!rawText) return '';
    return rawText
      .split(/[;,.(]/)[0]
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');
  }

  public updateLemmaDOMStatus(lemma: string, familiarity: FamiliarityLevel): void {
    const norm = cleanLatinString(lemma);
    if (familiarity === 4) {
      this.vocabStore.markLemmaKnown(norm);
    } else if (familiarity >= 1) {
      const existing = this.vocabStore.getByLemma(norm);
      if (existing) {
        this.vocabStore.updateEntry(existing.id, { familiarity });
      }
    }

    const allSpans = Array.from(
      this.doc.querySelectorAll<HTMLElement>(`.ct-word[data-lemma="${norm}"]`)
    );
    const savedEntry = this.vocabStore.getByLemma(norm);
    const customShort = this.formatShortInlineGloss(savedEntry?.customDefinition);
    const isThomistic = Boolean(INLINE_THOMISTIC_GLOSSES[norm]);
    const shortGloss =
      customShort ||
      (isThomistic
        ? INLINE_THOMISTIC_GLOSSES[norm]
        : this.formatShortInlineGloss(savedEntry?.translation));
    for (const sp of allSpans) {
      sp.setAttribute('data-familiarity', String(familiarity));
      if (customShort || (familiarity >= 1 && familiarity <= 3 && shortGloss) || (familiarity === 0 && isThomistic)) {
        if (shortGloss) {
          sp.setAttribute('data-gloss', shortGloss);
        }
      } else {
        sp.removeAttribute('data-gloss');
      }
    }
  }

  private createTopBar(): void {
    if (this.doc.getElementById('st-topbar')) return;
    const bar = this.doc.createElement('header');
    bar.id = 'st-topbar';
    bar.innerHTML = `
      <a href="#st-sidepanel" id="st-skip-link" class="st-skip-link">Skip to Side Panel &amp; Study Tools</a>
      <div class="st-brand">
        <span>\u2720 Schola Thomistica</span>
        <span id="st-coverage-display" class="st-coverage-pill">Loading coverage...</span>
      </div>
      <div class="st-controls">
        <select id="st-reading-mode-select" class="st-btn" title="Progressive Reading Assistance Level" aria-label="Progressive Reading Assistance Level">
          <option value="assisted">Mode: Assisted Reading</option>
          <option value="guided">Mode: Guided Scholastic</option>
          <option value="independent">Mode: Independent Reader</option>
        </select>
        <button type="button" id="st-bilingual-toggle" class="st-btn" aria-pressed="false" title="Toggle Side-by-Side Parallel English Translation (B)">Side-by-Side EN</button>
        <button type="button" id="st-font-dec" class="st-btn" title="Decrease font size">A-</button>
        <button type="button" id="st-font-inc" class="st-btn" title="Increase font size">A+</button>
        <button type="button" id="st-dark-toggle" class="st-btn" title="Toggle Dark Mode (D)">Nocturne</button>
        <button type="button" id="st-open-phrasepump" class="st-btn st-btn-primary" title="Practice Saved Vocabulary with PhrasePump & FSRS (R)">
          PhrasePump Review (<span id="st-due-badge">0</span>)
        </button>
        <button type="button" id="st-toggle-panel" class="st-btn" title="Toggle Side Panel">Side Panel</button>
      </div>
    `;
    this.doc.body.insertBefore(bar, this.doc.body.firstChild);

    const modeSelect = bar.querySelector('#st-reading-mode-select') as HTMLSelectElement;
    modeSelect.value = this.prefs.readingMode;
    modeSelect.addEventListener('change', () => {
      const nextMode = modeSelect.value as ReaderPreferences['readingMode'];
      this.prefs.readingMode = nextMode;
      // Independent Reader mode automatically collapses the side panel for distraction-free reading;
      // Assisted Reading and Guided Scholastic open the side panel if collapsed (BUG-09.5).
      if (nextMode === 'independent') {
        this.prefs.panelCollapsed = true;
      } else if (nextMode === 'assisted' || nextMode === 'guided') {
        this.prefs.panelCollapsed = false;
      }
      this.applyPreferences();
      this.renderSidePanel();
      this.persistState();
    });

    bar.querySelector('#st-skip-link')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (this.prefs.panelCollapsed) {
        this.prefs.panelCollapsed = false;
        this.applyPreferences();
      }
      const panelEl = this.doc.getElementById('st-sidepanel');
      const firstTab = panelEl?.querySelector<HTMLElement>('.st-tab.st-active, .st-tab');
      (firstTab || panelEl)?.focus?.();
    });

    bar.querySelector('#st-bilingual-toggle')?.addEventListener('click', () => {
      this.prefs.bilingualMode = !this.prefs.bilingualMode;
      // On narrower screens (< 1150px), auto-collapse the side panel when activating Side-by-Side so both columns have comfortable reading width
      if (this.prefs.bilingualMode && (this.win.innerWidth || 1280) < 1150) {
        this.prefs.panelCollapsed = true;
      }
      this.syncAllParagraphBilingualButtons(true);
      this.applyPreferences();
      this.persistState();
    });

    bar.querySelector('#st-font-dec')?.addEventListener('click', () => {
      this.prefs.fontSizePx = Math.max(14, this.prefs.fontSizePx - 1);
      this.applyPreferences();
      this.persistState();
    });
    bar.querySelector('#st-font-inc')?.addEventListener('click', () => {
      this.prefs.fontSizePx = Math.min(26, this.prefs.fontSizePx + 1);
      this.applyPreferences();
      this.persistState();
    });
    bar.querySelector('#st-dark-toggle')?.addEventListener('click', () => {
      this.prefs.darkMode = !this.prefs.darkMode;
      this.applyPreferences();
      this.persistState();
    });
    bar.querySelector('#st-open-phrasepump')?.addEventListener('click', () => {
      this.openPhrasePumpModal();
    });
    bar.querySelector('#st-toggle-panel')?.addEventListener('click', () => {
      this.prefs.panelCollapsed = !this.prefs.panelCollapsed;
      this.applyPreferences();
      this.persistState();
    });
  }

  private refreshTopBarCoverage(
    sampleText?: string,
    precomputedReport?: ReturnType<StatsTracker['computeTextCoverage']>
  ): void {
    const covEl = this.doc.getElementById('st-coverage-display');
    const dueEl = this.doc.getElementById('st-due-badge');
    if (dueEl) {
      dueEl.textContent = String(this.vocabStore.getDueEntries().length);
    }
    if (!covEl) return;

    if (!precomputedReport) {
      const wordElements = Array.from(this.doc.querySelectorAll('.ct-word'));
      if (wordElements.length === 0 && !sampleText?.trim()) {
        covEl.textContent = 'Index Page \u2022 Open a work to start reading';
        return;
      }
      const textToMeasure =
        sampleText || wordElements.map((e) => e.textContent || '').join(' ');
      precomputedReport = this.statsTracker.computeTextCoverage(textToMeasure);
    }
    const report = precomputedReport;
    if (report.totalWords === 0) {
      covEl.textContent = 'Index Page \u2022 Open a work to start reading';
      return;
    }
    const fullCovText = `Coverage: ${report.knownPercentage}% Known \u2022 ${report.learningWords} Learning \u2022 ${report.unfamiliarWords} Unfamiliar`;
    covEl.textContent = `${report.knownPercentage}% Known \u2022 ${report.learningWords} Learning \u2022 ${report.unfamiliarWords} Unfamiliar`;
    covEl.title = fullCovText;
  }

  private toEcclesiasticalPhonetic(word: string): string {
    let w = word.toLowerCase().replace(/[^a-z\u00E6\u0153]/g, '');
    w = w.replace(/\u00E6/g, 'ae').replace(/\u0153/g, 'oe');
    w = w
      .replace(/sc(?=[eiaeo])/g, 'sh')
      .replace(/c(?=[eiaeo])/g, 'ch')
      .replace(/g(?=[eiaeo])/g, 'j')
      .replace(/gn/g, 'ny')
      .replace(/ti(?=[aeiou])/g, 'tsi')
      .replace(/ae|oe/g, 'eh')
      .replace(/ph/g, 'f')
      .replace(/ch/g, 'k')
      .replace(/th/g, 't');
    return `[${w}]`;
  }

  public closePopup(): void {
    const popup = this.doc.getElementById('st-popup');
    popup?.classList.remove('st-visible');
    if (this.selectedElement) {
      this.selectedElement.classList.remove('ct-selected');
      this.selectedElement = null;
    }
    this.lastSavedToast = '';
  }

  private createPopup(): void {
    if (this.doc.getElementById('st-popup')) return;
    const popup = this.doc.createElement('div');
    popup.id = 'st-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'false');
    popup.setAttribute('aria-label', 'Word Analysis and Dictionary Lookup');
    this.doc.body.appendChild(popup);

    this.doc.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement | null;
      const wordEl = target?.closest?.('.ct-word') as HTMLElement | null;
      if (wordEl) {
        ev.stopPropagation();
        this.selectWordElement(wordEl);
        return;
      }
      if (
        target &&
        this.doc.contains(target) &&
        !target.closest('#st-popup') &&
        !target.closest('.ct-word') &&
        !target.closest('#st-sidepanel') &&
        !target.closest('#st-topbar')
      ) {
        this.closePopup();
      }
    });

    this.doc.addEventListener('keydown', (ev) => {
      const target = ev.target as HTMLElement | null;
      const wordEl = target?.closest?.('.ct-word') as HTMLElement | null;
      if (!wordEl) return;

      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        this.selectWordElement(wordEl);
      } else if (
        ev.key === 'ArrowRight' ||
        ev.key === 'ArrowLeft' ||
        ev.key === 'ArrowDown' ||
        ev.key === 'ArrowUp'
      ) {
        ev.preventDefault();
        const allWords = Array.from(this.doc.querySelectorAll<HTMLElement>('.ct-word'));
        const curIdx = allWords.indexOf(wordEl);
        if (curIdx >= 0 && allWords.length > 1) {
          const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1;
          const nextIdx = (curIdx + step + allWords.length) % allWords.length;
          const nextWord = allWords[nextIdx];
          wordEl.setAttribute('tabindex', '-1');
          nextWord.setAttribute('tabindex', '0');
          nextWord.focus();
        }
      }
    });

    const onViewportChange = (): void => {
      this.syncLayoutOffsets();
      if (popup.classList.contains('st-visible') && this.selectedElement) {
        this.positionPopup();
      }
    };
    this.win.addEventListener('scroll', onViewportChange, { passive: true });
    this.win.addEventListener('resize', onViewportChange, { passive: true });
  }

  public positionPopup(): void {
    const popup = this.doc.getElementById('st-popup');
    const wordEl = this.selectedElement;
    if (!popup || !wordEl || !popup.classList.contains('st-visible')) return;

    const rect = wordEl.getBoundingClientRect();
    const vh = this.win.innerHeight || 800;
    const winW = this.win.innerWidth || 1200;

    const topbarEl = this.doc.getElementById('st-topbar');
    const topbarBottom = (topbarEl?.getBoundingClientRect().bottom || 48) + 6;
    const bottomMargin = 12;
    const gap = 8;

    // If the word is scrolled completely outside the visible reading area, hide popup temporarily
    if (rect.bottom < topbarBottom - 4 || rect.top > vh - 4) {
      popup.style.opacity = '0';
      popup.style.pointerEvents = 'none';
      return;
    }
    popup.style.opacity = '1';
    popup.style.pointerEvents = 'auto';

    // Reset maxHeight before measuring natural popup height
    popup.style.maxHeight = '';
    const popupRect = popup.getBoundingClientRect();
    const naturalH = popupRect.height || popup.offsetHeight || 280;
    const popupW = popupRect.width || popup.offsetWidth || 320;

    const spaceBelow = vh - bottomMargin - (rect.bottom + gap);
    const spaceAbove = rect.top - gap - topbarBottom;

    let top: number;
    if (spaceBelow >= naturalH) {
      // Enough room below the word
      top = rect.bottom + gap;
      popup.setAttribute('data-placement', 'below');
    } else if (spaceAbove >= naturalH || spaceAbove > spaceBelow) {
      // Word is near the bottom (or more room above than below): place popup ABOVE the word
      popup.setAttribute('data-placement', 'above');
      if (spaceAbove < naturalH) {
        const constrainedH = Math.max(150, spaceAbove);
        popup.style.maxHeight = `${constrainedH}px`;
        top = Math.max(topbarBottom, rect.top - gap - constrainedH);
      } else {
        top = rect.top - gap - naturalH;
      }
    } else {
      // Word is near the top on a short viewport: place below and constrain height so buttons aren't cut off
      popup.setAttribute('data-placement', 'below');
      const constrainedH = Math.max(150, spaceBelow);
      popup.style.maxHeight = `${constrainedH}px`;
      top = rect.bottom + gap;
    }

    const panelEl = this.doc.getElementById('st-sidepanel');
    const panelW = this.prefs.panelCollapsed
      ? 0
      : panelEl?.getBoundingClientRect().width || Math.min(335, winW * 0.46);
    const maxLeft = Math.max(12, winW - panelW - popupW - 16);
    const left = Math.min(maxLeft, Math.max(12, rect.left));

    popup.style.top = `${Math.round(top)}px`;
    popup.style.left = `${Math.round(left)}px`;
  }

  private renderPopup(wordEl: HTMLElement, analysis: ContextualAnalysisResult): void {
    const popup = this.doc.getElementById('st-popup');
    if (!popup) return;

    const wa = analysis.wordAnalysis;
    const parse = analysis.selectedParse || wa.morphologicalParses[0];
    const currentFam = this.vocabStore.getLemmaFamiliarity(wa.primaryLemma);
    const savedEntry = this.vocabStore.getByLemma(wa.primaryLemma);
    const hasUserAnnotation = Boolean(savedEntry?.customDefinition || savedEntry?.notes);

    const userAnnotationCardHtml = hasUserAnnotation
      ? `
        <div class="st-popup-dict-item" id="st-popup-user-card" style="background:var(--st-bg-elevated);padding:5px 8px;border-radius:6px;border:1.5px solid var(--st-accent-teal);margin-bottom:6px;">
          <span class="st-dict-badge" data-source="My Definition & Note">My Definition &amp; Note</span>
          ${savedEntry?.customDefinition ? `<strong>${this.escapeHtml(savedEntry.customDefinition)}</strong>` : ''}
          ${savedEntry?.notes ? `<div style="font-size:11.5px;color:var(--st-text-secondary);margin-top:2px;">\uD83D\uDCDD ${this.escapeHtml(savedEntry.notes)}</div>` : ''}
        </div>
      `
      : '';

    const dictItemsHtml = wa.dictionaryEntries
      .map((d) => {
        const conciseDef =
          d.definition.length > 210 ? `${d.definition.slice(0, 210)}...` : d.definition;
        return `
          <div class="st-popup-dict-item">
            <span class="st-dict-badge" data-source="${this.escapeHtml(d.source)}">${this.escapeHtml(d.source)}</span>
            <span>${this.escapeHtml(conciseDef)}</span>
          </div>
        `;
      })
      .join('');

    popup.innerHTML = `
      <div class="st-popup-header" style="margin-bottom:4px;">
        <div style="min-width:0;">
          <div class="st-popup-headword" style="font-size:15px;line-height:1.25;">${this.escapeHtml(wa.headword)}</div>
          <div style="font-size:11px;color:var(--st-text-muted);">
            Token: <strong>${this.escapeHtml(wa.word)}</strong> \u2022 Lemma: <strong>${this.escapeHtml(wa.primaryLemma)}</strong>
          </div>
        </div>
        <div style="display:flex;gap:3px;align-items:center;flex-shrink:0;">
          ${wa.isThomisticKeyTerm ? '<span class="st-popup-pos" style="white-space:nowrap;background:var(--st-accent-rubric-soft);color:var(--st-accent-rubric);">Thomistic Term</span>' : ''}
          <span class="st-popup-pos" style="white-space:nowrap;">${this.escapeHtml(wa.partOfSpeech)}</span>
          <button type="button" id="st-popup-pronounce" class="st-popup-icon-btn" title="Pronounce Latin word (Ecclesiastical)" aria-label="Pronounce word">\uD83D\uDD0A</button>
          <button type="button" id="st-popup-copy" class="st-popup-icon-btn" title="Copy lemma and definition" aria-label="Copy definition">\u29C9</button>
          <button type="button" id="st-popup-close" class="st-popup-icon-btn" title="Close popup (Esc)" aria-label="Close popup">\u00D7</button>
        </div>
      </div>
      <div class="st-popup-morph" style="margin-bottom:4px;font-size:11.5px;">
        ${parse ? this.escapeHtml(parse.formExplanation) : this.escapeHtml(wa.partOfSpeech)}
        ${this.lastSavedToast ? `<span id="st-popup-toast" role="status" aria-live="polite" style="margin-left:6px;color:var(--st-accent-teal);font-weight:700;">${this.escapeHtml(this.lastSavedToast)}</span>` : ''}
      </div>
      <div class="st-popup-context-reason" style="padding:4px 7px;margin-bottom:5px;line-height:1.3;">
        <strong>In Context:</strong> ${this.escapeHtml(analysis.disambiguationReason)}
      </div>
      <div class="st-status-bar" style="margin-bottom:5px;">
        <button type="button" class="st-status-btn ${currentFam === 1 ? 'st-active' : ''}" data-set-fam="1" aria-pressed="${currentFam === 1}" title="Shortcut: 1 or S">1 \u2022 New</button>
        <button type="button" class="st-status-btn ${currentFam === 2 ? 'st-active' : ''}" data-set-fam="2" aria-pressed="${currentFam === 2}" title="Shortcut: 2">2 \u2022 Familiar</button>
        <button type="button" class="st-status-btn ${currentFam === 3 ? 'st-active' : ''}" data-set-fam="3" aria-pressed="${currentFam === 3}" title="Shortcut: 3">3 \u2022 Learned</button>
        <button type="button" class="st-status-btn ${currentFam === 4 ? 'st-active' : ''}" data-set-fam="4" aria-pressed="${currentFam === 4}" title="Shortcut: 4 or K">4 \u2022 Known</button>
      </div>
      ${userAnnotationCardHtml}
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;margin-bottom:5px;">
        <span style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--st-accent-teal);">
          Dictionary Perspectives (${wa.dictionaryEntries.length} Sources)
        </span>
        <button type="button" id="st-popup-toggle-note-btn" class="st-btn st-btn-primary" style="font-size:11px;padding:3px 9px;min-height:24px;" aria-expanded="false">
          ${hasUserAnnotation ? '\u270E Edit Definition / Note' : '+ Custom Definition / Note'}
        </button>
      </div>
      <div id="st-popup-note-editor" style="display:none;padding:7px;margin-bottom:4px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg-elevated);">
        <div style="margin-bottom:4px;">
          <label for="st-custom-def-input" style="display:block;font-size:11px;font-weight:700;color:var(--st-text-secondary);margin-bottom:2px;">My Custom Definition (for lemma "${this.escapeHtml(wa.primaryLemma)}"):</label>
          <input type="text" id="st-custom-def-input" value="${this.escapeHtml(savedEntry?.customDefinition || '')}" placeholder="Write your own definition..." style="width:100%;box-sizing:border-box;padding:4px 7px;font-size:12px;border:1px solid var(--st-border);border-radius:5px;background:var(--st-bg-card);color:var(--st-text-primary);" />
        </div>
        <div style="margin-bottom:5px;">
          <label for="st-custom-note-input" style="display:block;font-size:11px;font-weight:700;color:var(--st-text-secondary);margin-bottom:2px;">Personal Annotation / Study Note:</label>
          <textarea id="st-custom-note-input" rows="2" placeholder="Add philosophical, grammatical, or cross-reference notes..." style="width:100%;box-sizing:border-box;padding:4px 7px;font-size:12px;border:1px solid var(--st-border);border-radius:5px;background:var(--st-bg-card);color:var(--st-text-primary);font-family:var(--st-font-ui);">${this.escapeHtml(savedEntry?.notes || '')}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:6px;">
          <button type="button" id="st-save-note-btn" class="st-btn st-btn-primary" style="font-size:11.5px;padding:3px 10px;min-height:24px;">Save Definition &amp; Note</button>
        </div>
      </div>
      <div class="st-popup-dicts" style="margin-bottom:0;">
        ${dictItemsHtml}
      </div>
    `;

    popup.querySelector('#st-popup-close')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.closePopup();
    });

    popup.querySelector('#st-popup-pronounce')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const phonetic = this.toEcclesiasticalPhonetic(wa.word);
      this.lastSavedToast = `\uD83D\uDD0A Eccl. pronunciation: ${phonetic}`;
      const morphEl = popup.querySelector('.st-popup-morph');
      if (morphEl) {
        const baseMorph = parse ? this.escapeHtml(parse.formExplanation) : this.escapeHtml(wa.partOfSpeech);
        morphEl.innerHTML = `${baseMorph} <span id="st-popup-toast" role="status" aria-live="polite" style="margin-left:6px;color:var(--st-accent-teal);font-weight:700;">${this.escapeHtml(this.lastSavedToast)}</span>`;
      }
      try {
        if ('speechSynthesis' in this.win) {
          this.win.speechSynthesis.cancel();
          const utter = new this.win.SpeechSynthesisUtterance(wa.word);
          utter.lang = 'it-IT'; // Ecclesiastical Latin phonology matches Italian vowel/consonant values closely
          utter.rate = 0.88;
          this.win.speechSynthesis.speak(utter);
        }
      } catch {
        // Ignore speech synthesis errors in headless environments
      }
    });

    popup.querySelector('#st-popup-copy')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const copyBtn = popup.querySelector('#st-popup-copy');
      const customStr = savedEntry?.customDefinition ? `${savedEntry.customDefinition} | ` : '';
      const textToCopy = `${wa.headword} — ${customStr}${wa.ecclesiasticalMeaning}`;
      if (copyBtn) copyBtn.textContent = '\u2713';
      try {
        void this.win.navigator?.clipboard?.writeText(textToCopy)?.catch(() => {});
      } catch {
        // Ignore clipboard errors
      }
    });

    popup.querySelectorAll<HTMLButtonElement>('[data-set-fam]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const fam = Number(btn.getAttribute('data-set-fam')) as FamiliarityLevel;
        this.saveCurrentWord(fam);
        this.refreshTopBarCoverage();
      });
    });

    const toggleNoteBtn = popup.querySelector<HTMLButtonElement>('#st-popup-toggle-note-btn');
    const noteEditor = popup.querySelector<HTMLElement>('#st-popup-note-editor');
    const dictsListEl = popup.querySelector<HTMLElement>('.st-popup-dicts');
    const contextReasonEl = popup.querySelector<HTMLElement>('.st-popup-context-reason');
    const userCardEl = popup.querySelector<HTMLElement>('#st-popup-user-card');
    const submitPopupNote = (): void => {
      const defVal = popup.querySelector<HTMLInputElement>('#st-custom-def-input')?.value || '';
      const noteVal = popup.querySelector<HTMLTextAreaElement>('#st-custom-note-input')?.value || '';
      this.saveCurrentWordAnnotation(defVal, noteVal);
      this.refreshTopBarCoverage();
    };

    toggleNoteBtn?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!noteEditor) return;
      const isHidden = noteEditor.style.display === 'none';
      noteEditor.style.display = isHidden ? 'block' : 'none';
      if (dictsListEl) {
        dictsListEl.style.display = isHidden ? 'none' : 'block';
      }
      if (contextReasonEl) {
        contextReasonEl.style.display = isHidden ? 'none' : 'block';
      }
      if (userCardEl) {
        userCardEl.style.display = isHidden ? 'none' : 'block';
      }
      toggleNoteBtn.setAttribute('aria-expanded', String(isHidden));
      this.positionPopup();
      if (isHidden) {
        popup.querySelector<HTMLInputElement>('#st-custom-def-input')?.focus();
      }
    });

    popup.querySelector<HTMLButtonElement>('#st-save-note-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      submitPopupNote();
    });

    popup.querySelector<HTMLInputElement>('#st-custom-def-input')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        submitPopupNote();
      }
    });

    popup.querySelector<HTMLTextAreaElement>('#st-custom-note-input')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        ev.stopPropagation();
        submitPopupNote();
      }
    });

    popup.classList.add('st-visible');
    this.positionPopup();
  }

  private createSidePanel(): void {
    if (this.doc.getElementById('st-sidepanel')) return;
    const panel = this.doc.createElement('aside');
    panel.id = 'st-sidepanel';
    panel.setAttribute('tabindex', '-1');
    panel.setAttribute('aria-label', 'Schola Thomistica Study Panel');
    panel.innerHTML = `
      <div class="st-tabs" role="tablist" aria-label="Study Panel Sections">
        <button type="button" role="tab" aria-selected="true" aria-controls="st-panel-body" class="st-tab st-active" data-tab="context">Context</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="st-panel-body" class="st-tab" data-tab="dictionaries">Lexica (5)</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="st-panel-body" class="st-tab" data-tab="vocabulary">Vocab</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="st-panel-body" class="st-tab" data-tab="stats">Stats</button>
      </div>
      <div class="st-panel-body" id="st-panel-body" role="tabpanel"></div>
    `;
    this.doc.body.appendChild(panel);

    panel.querySelectorAll<HTMLButtonElement>('.st-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as ReaderPreferences['activeTab'];
        this.prefs.activeTab = tab;
        this.renderSidePanel();
      });
    });
  }

  public renderSidePanel(): void {
    const panel = this.doc.getElementById('st-sidepanel');
    const body = this.doc.getElementById('st-panel-body');
    if (!panel || !body) return;

    panel.querySelectorAll('.st-tab').forEach((btn) => {
      const isActive = btn.getAttribute('data-tab') === this.prefs.activeTab;
      btn.classList.toggle('st-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    const dueEl = this.doc.getElementById('st-due-badge');
    if (dueEl) {
      dueEl.textContent = String(this.vocabStore.getDueEntries().length);
    }

    if (this.prefs.activeTab === 'context') {
      this.renderContextTab(body);
    } else if (this.prefs.activeTab === 'dictionaries') {
      this.renderDictionariesTab(body);
    } else if (this.prefs.activeTab === 'vocabulary') {
      this.renderVocabularyTab(body);
    } else {
      this.renderStatsTab(body);
    }
  }

  private renderModeLegendHtml(): string {
    const modeDescriptions: Record<ReaderPreferences['readingMode'], string> = {
      assisted:
        '<strong>Assisted Reading:</strong> Shows all cues \u2014 Unseen dotted underline, Thomistic rubric top-bar, and Saved levels 1\u20133.',
      guided:
        '<strong>Guided Scholastic:</strong> Hides unseen underlines; shows Thomistic rubric top-bars and Saved levels 1\u20133.',
      independent:
        '<strong>Independent Reader:</strong> Clean text showing only your active struggling words (1 \u2022 New & 2 \u2022 Familiar).',
    };
    return `
      <div class="st-card" id="st-mode-legend" style="font-size:11.5px;line-height:1.45;">
        <div class="st-card-title">Reading Mode & Highlight Legend</div>
        <div style="margin-bottom:6px;">${modeDescriptions[this.prefs.readingMode]}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <span style="padding:1px 6px;border-radius:3px;background:rgba(217,119,6,0.25);border-bottom:2px solid #B45309;">1 \u2022 New</span>
          <span style="padding:1px 6px;border-radius:3px;background:rgba(37,99,235,0.16);border-bottom:2px dashed #1D4ED8;">2 \u2022 Familiar</span>
          <span style="padding:1px 6px;border-radius:3px;background:rgba(22,163,74,0.16);border-bottom:1.5px dotted #15803D;">3 \u2022 Learned</span>
          <span style="padding:1px 6px;border-radius:3px;border:1px solid var(--st-border);">4 \u2022 Known (Clean)</span>
          <span style="padding:1px 6px;border-radius:3px;box-shadow:inset 0 2px 0 0 var(--st-accent-rubric);border:1px solid var(--st-border);">Thomistic Term</span>
        </div>
      </div>
    `;
  }

  private renderContextTab(container: HTMLElement): void {
    const hasWordsOnPage = this.doc.querySelectorAll('.ct-word').length > 0;
    if (!this.currentAnalysis) {
      container.innerHTML = `
        <div class="st-card">
          <div class="st-card-title">Interactive Scholastic Reader</div>
          <p style="font-size:13px;line-height:1.5;margin:0;">
            ${
              hasWordsOnPage
                ? 'Click on any Latin word in Thomas Aquinas\'s text to inspect its <strong>Ecclesiastical & Thomistic translation</strong>, <strong>morphological parse</strong>, <strong>contextual sentence interpretation</strong>, and <strong>5-dictionary comparison</strong>.'
                : 'This is a navigation or index page. Open any work of St. Thomas Aquinas from the index to begin interactive Latin reading, or use the <strong>Lexica (5)</strong> tab above to look up any Latin word.'
            }
          </p>
          <p style="font-size:12px;color:var(--st-text-secondary);margin-top:8px;">
            <strong>Shortcuts:</strong> <code>1\u20134</code> set familiarity \u2022 <code>S</code> save word \u2022 <code>K</code> mark known \u2022 <code>B</code> side-by-side EN \u2022 <code>R</code> PhrasePump (<code>Space</code> reveal) \u2022 <code>D</code> dark mode \u2022 <code>Esc</code> close.
          </p>
        </div>
        ${this.renderModeLegendHtml()}
      `;
      return;
    }

    const a = this.currentAnalysis;
    const wa = a.wordAnalysis;
    const tr = a.sentenceTranslation;
    const savedEntry = this.vocabStore.getByLemma(wa.primaryLemma);
    const hasUserAnnotation = Boolean(savedEntry?.customDefinition || savedEntry?.notes);

    container.innerHTML = `
      <div class="st-card">
        <div class="st-card-title">Selected Word & Contextual Disambiguation</div>
        <div style="font-size:17px;font-weight:700;color:var(--st-accent-rubric);">${this.escapeHtml(wa.headword)}</div>
        <div style="font-size:12px;color:var(--st-text-secondary);margin:3px 0 8px 0;">
          ${this.escapeHtml(a.selectedParse?.formExplanation || wa.partOfSpeech)}
          ${this.currentCitation ? ` • <strong>${this.escapeHtml(this.currentCitation)}</strong>` : ''}
        </div>
        ${
          hasUserAnnotation
            ? `
            <div style="padding:7px 9px;margin-bottom:8px;border:1.5px solid var(--st-accent-teal);border-radius:6px;background:var(--st-bg-elevated);font-size:12.5px;">
              <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--st-accent-teal);margin-bottom:2px;">My Definition &amp; Note</div>
              ${savedEntry?.customDefinition ? `<div style="font-weight:700;">${this.escapeHtml(savedEntry.customDefinition)}</div>` : ''}
              ${savedEntry?.notes ? `<div style="font-size:12px;color:var(--st-text-secondary);margin-top:2px;">\uD83D\uDCDD ${this.escapeHtml(savedEntry.notes)}</div>` : ''}
            </div>
          `
            : ''
        }
        <div style="font-size:13px;line-height:1.45;margin-bottom:8px;">
          <strong>Contextual Meaning:</strong> ${this.escapeHtml(a.contextualMeaning)}
        </div>
        <div style="font-size:12px;background:var(--st-bg-elevated);padding:8px;border-radius:6px;">
          <strong>Why this parse:</strong> ${this.escapeHtml(a.disambiguationReason)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
          <button type="button" class="st-btn st-btn-primary" id="st-panel-save-btn">+ Save to Vocabulary (S)</button>
          <button type="button" class="st-btn" id="st-panel-known-btn">Mark Known (K)</button>
        </div>
      </div>

      <div class="st-card">
        <div class="st-card-title">Literal vs. Contextual / Thomistic Nuance</div>
        <div style="font-size:12.5px;line-height:1.5;">
          <div style="margin-bottom:6px;"><strong>Thomistic / Contextual:</strong> ${this.escapeHtml(a.literalVsContextual.contextual)}</div>
          <div style="margin-bottom:6px;"><strong>Classical / Literal:</strong> ${this.escapeHtml(a.literalVsContextual.literal)}</div>
          <div style="color:var(--st-text-secondary);">${this.escapeHtml(a.literalVsContextual.nuanceExplanation)}</div>
        </div>
      </div>

      <div class="st-card">
        <div class="st-card-title">${this.escapeHtml(a.scholasticSectionGuide.label)}</div>
        <div style="font-size:12px;color:var(--st-text-secondary);margin-bottom:8px;">
          ${this.escapeHtml(a.scholasticSectionGuide.readingAdvice)}
        </div>
        <div style="font-family:var(--st-font-latin);font-size:14.5px;padding:8px;background:var(--st-bg-elevated);border-radius:6px;margin-bottom:8px;">
          ${this.escapeHtml(this.currentSentence)}
        </div>
        ${
          tr.referenceTranslation
            ? `<div style="font-size:12.5px;margin-bottom:8px;"><strong>Reference Translation (${this.escapeHtml(this.getTranslationProvenanceLabel(this.currentCitation))}):</strong> ${this.escapeHtml(tr.referenceTranslation)}</div>`
            : `<div style="font-size:12.5px;margin-bottom:8px;"><strong>Sentence Translation:</strong> ${this.escapeHtml(tr.contextualTranslation)}</div>`
        }
        <div class="st-card-title" style="margin-top:8px;">Word-by-Word Interlinear Gloss</div>
        <div class="st-interlinear-grid">
          ${tr.interlinearGloss
            .map(
              (tok) => `
              <div class="st-interlinear-item">
                <div class="st-interlinear-lat">${this.escapeHtml(tok.word)}</div>
                <div class="st-interlinear-en">${this.escapeHtml(tok.gloss)}</div>
                <div class="st-interlinear-morph">${this.escapeHtml(tok.morphShort)}</div>
              </div>
            `
            )
            .join('')}
        </div>
      </div>

      <div class="st-card">
        <div class="st-card-title">Scholastic Grammar Assistant</div>
        ${a.grammarConstructions
          .map(
            (g) => `
            <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--st-border);">
              <div style="font-weight:700;font-size:12.5px;color:var(--st-accent-rubric);">${this.escapeHtml(g.name)}</div>
              <div style="font-size:11px;color:var(--st-text-muted);margin:2px 0;">Pattern: ${this.escapeHtml(g.trigger)}</div>
              <div style="font-size:12px;line-height:1.45;">${this.escapeHtml(g.explanation)}</div>
            </div>
          `
          )
          .join('')}
      </div>
    `;

    container.querySelector('#st-panel-save-btn')?.addEventListener('click', () => {
      this.saveCurrentWord(1);
      this.refreshTopBarCoverage();
    });
    container.querySelector('#st-panel-known-btn')?.addEventListener('click', () => {
      this.saveCurrentWord(4);
      this.refreshTopBarCoverage();
    });
  }

  private renderDictionariesTab(container: HTMLElement): void {
    const wa = this.currentAnalysis?.wordAnalysis;
    const savedEntry = wa ? this.vocabStore.getByLemma(wa.primaryLemma) : undefined;
    const hasUserAnnotation = Boolean(savedEntry?.customDefinition || savedEntry?.notes);
    container.innerHTML = `
      <div class="st-card">
        <div class="st-card-title">Multi-Dictionary Lookup</div>
        <div style="display:flex;gap:6px;">
          <input type="text" id="st-dict-search-input" value="${this.escapeHtml(wa?.word || '')}" placeholder="Search any Latin word or lemma..." style="flex:1;padding:6px 8px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg-elevated);color:var(--st-text-primary);" />
          <button type="button" class="st-btn st-btn-primary" id="st-dict-search-btn">Lookup</button>
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11.5px;color:var(--st-text-secondary);cursor:pointer;">
          <input type="checkbox" id="st-live-wiktionary-toggle" ${this.prefs.liveWiktionary !== false ? 'checked' : ''} />
          <span>Enable live Wiktionary API enrichment on corpusthomisticum.org (disabled offline)</span>
        </label>
      </div>
      ${
        wa && hasUserAnnotation
          ? `
          <div class="st-card" style="border:1.5px solid var(--st-accent-teal);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span class="st-card-title" style="margin:0;">My Definition &amp; Note</span>
              <span style="font-size:10.5px;color:var(--st-text-muted);">Personal Annotation</span>
            </div>
            <div style="font-weight:700;font-size:14px;color:var(--st-accent-rubric);margin-bottom:4px;">
              ${this.escapeHtml(wa.headword)}
            </div>
            ${savedEntry?.customDefinition ? `<div style="font-size:12.5px;font-weight:700;line-height:1.5;">${this.escapeHtml(savedEntry.customDefinition)}</div>` : ''}
            ${savedEntry?.notes ? `<div style="font-size:12px;color:var(--st-text-secondary);margin-top:4px;">\uD83D\uDCDD ${this.escapeHtml(savedEntry.notes)}</div>` : ''}
          </div>
        `
          : ''
      }
      ${
        wa
          ? wa.dictionaryEntries
              .map(
                (d) => `
              <div class="st-card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <span class="st-card-title" style="margin:0;">${this.escapeHtml(d.source)}</span>
                  <span style="font-size:10.5px;color:var(--st-text-muted);">${this.escapeHtml(d.ageLabel || '')}</span>
                </div>
                <div style="font-weight:700;font-size:14px;color:var(--st-accent-rubric);margin-bottom:4px;">
                  ${this.escapeHtml(d.headword)}
                </div>
                <div style="font-size:12.5px;line-height:1.5;">${this.escapeHtml(d.definition)}</div>
                ${
                  d.axioms && d.axioms.length > 0
                    ? `<div style="margin-top:6px;font-size:11.5px;color:var(--st-accent-teal);"><strong>Thomistic Axioms:</strong> ${d.axioms.map((ax) => `<em>"${this.escapeHtml(ax)}"</em>`).join(' • ')}</div>`
                    : ''
                }
                ${
                  d.latinQuotes && d.latinQuotes.length > 0
                    ? `<div style="margin-top:6px;font-size:11.5px;color:var(--st-text-secondary);"><strong>Aquinas Usage:</strong> ${d.latinQuotes.slice(0, 3).map((q) => `"${this.escapeHtml(q)}"`).join('; ')}</div>`
                    : ''
                }
              </div>
            `
              )
              .join('')
          : '<div class="st-card">Select a word or search above to compare definitions across Thomistic Lexicon, Ecclesiastical Latin, Whitaker\'s Words, and Lewis & Short.</div>'
      }
      ${
        wa && wa.morphologicalParses.length > 0
          ? `
          <div class="st-card">
            <div class="st-card-title">All Possible Morphological Parses (${wa.morphologicalParses.length})</div>
            ${wa.morphologicalParses
              .map(
                (p) => `
                <div style="font-size:12px;padding:4px 0;border-bottom:1px dashed var(--st-border);">
                  <strong>${this.escapeHtml(p.headword)}</strong> — ${this.escapeHtml(p.formExplanation)}
                </div>
              `
              )
              .join('')}
          </div>
        `
          : ''
      }
      <div class="st-card" style="font-size:11px;color:var(--st-text-muted);line-height:1.45;">
        <strong>Lexical &amp; Corpus Attributions:</strong> Ludwig Sch\u00FCtz <em>Thomas-Lexikon</em> (1895, PD) \u2022 William Whitaker's Words (PD) \u2022 Wiktionary &amp; Victionarium (CC BY-SA 4.0) \u2022 Lewis &amp; Short via Perseus Digital Library (CC BY-SA 3.0 US) \u2022 <em>Summa Theologiae</em> tr. English Dominican Fathers (1920, PD) \u2022 Parallel <em>Sentences</em> &amp; <em>SCG</em> via Geremia/AquinasOperaOmnia &amp; Geremia23/AquinasLatinEnglish (see <code>THIRD_PARTY_NOTICES.md</code>).
      </div>
    `;

    const liveToggle = container.querySelector('#st-live-wiktionary-toggle') as HTMLInputElement | null;
    liveToggle?.addEventListener('change', () => {
      this.prefs.liveWiktionary = Boolean(liveToggle.checked);
      this.persistState();
    });

    const input = container.querySelector('#st-dict-search-input') as HTMLInputElement | null;
    const btn = container.querySelector('#st-dict-search-btn');
    const runSearch = (): void => {
      const q = input?.value.trim();
      if (q) {
        this.currentAnalysis = analyzeWordInContext(q, q, '');
        this.renderSidePanel();
      }
    };
    btn?.addEventListener('click', runSearch);
    input?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        runSearch();
      }
    });
  }

  private renderVocabularyTab(container: HTMLElement): void {
    const entries = this.vocabStore.getAll();
    container.innerHTML = `
      <div class="st-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="st-card-title" style="margin:0;">Saved Vocabulary (${entries.length})</span>
          <div style="display:flex;gap:4px;">
            <button type="button" class="st-btn" id="st-export-anki-btn" title="Export Anki TSV">Export Anki</button>
            <button type="button" class="st-btn" id="st-export-json-btn" title="Export JSON">JSON</button>
          </div>
        </div>
        <div id="st-export-preview" style="display:none;margin-top:8px;">
          <textarea id="st-export-textarea" rows="5" style="width:100%;font-size:11px;font-family:monospace;"></textarea>
        </div>
      </div>
      ${
        entries.length === 0
          ? '<div class="st-card" style="font-size:12.5px;">No words saved yet. Click any Latin word in the text to save it with its full Thomistic sentence context.</div>'
          : entries
              .map(
                (e) => `
                <div class="st-card" data-vocab-id="${this.escapeHtml(e.id)}">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
                    <div>
                      <strong style="color:var(--st-accent-rubric);font-size:14px;">${this.escapeHtml(e.word)}</strong>
                      <span style="font-size:11.5px;color:var(--st-text-muted);"> (${this.escapeHtml(e.headword)})</span>
                      <span class="st-popup-pos" style="margin-left:4px;">${
                        e.familiarity === 1
                          ? '1 \u2022 New'
                          : e.familiarity === 2
                          ? '2 \u2022 Familiar'
                          : e.familiarity === 3
                          ? '3 \u2022 Learned'
                          : '4 \u2022 Known'
                      }</span>
                    </div>
                    <div style="display:flex;gap:4px;">
                      <button type="button" class="st-para-btn" data-edit-vocab-id="${this.escapeHtml(e.id)}">Edit Note / Def.</button>
                      <button type="button" class="st-para-btn" data-remove-id="${this.escapeHtml(e.id)}">Remove</button>
                    </div>
                  </div>
                  ${
                    e.customDefinition
                      ? `<div style="font-size:12.5px;margin:4px 0;color:var(--st-accent-teal);font-weight:700;">My Definition: ${this.escapeHtml(e.customDefinition)}</div>`
                      : ''
                  }
                  <div style="font-size:12.5px;margin:4px 0;">${this.escapeHtml(e.translation)}</div>
                  ${
                    e.notes
                      ? `<div style="font-size:12px;margin:4px 0;padding:5px 8px;background:var(--st-bg-elevated);border-left:3px solid var(--st-accent-teal);border-radius:4px;">\uD83D\uDCDD ${this.escapeHtml(e.notes)}</div>`
                      : ''
                  }
                  <div data-vocab-editor="${this.escapeHtml(e.id)}" style="display:none;margin:6px 0;padding:8px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg-elevated);">
                    <input type="text" data-edit-def-id="${this.escapeHtml(e.id)}" value="${this.escapeHtml(e.customDefinition || '')}" placeholder="Custom definition..." style="width:100%;box-sizing:border-box;margin-bottom:5px;padding:4px 6px;font-size:12px;border:1px solid var(--st-border);border-radius:4px;background:var(--st-bg-card);color:var(--st-text-primary);" />
                    <textarea data-edit-note-id="${this.escapeHtml(e.id)}" rows="2" placeholder="Personal study note..." style="width:100%;box-sizing:border-box;margin-bottom:5px;padding:4px 6px;font-size:12px;border:1px solid var(--st-border);border-radius:4px;background:var(--st-bg-card);color:var(--st-text-primary);font-family:var(--st-font-ui);">${this.escapeHtml(e.notes || '')}</textarea>
                    <button type="button" class="st-btn st-btn-primary" data-save-vocab-id="${this.escapeHtml(e.id)}" style="font-size:11.5px;padding:3px 10px;">Save</button>
                  </div>
                  <div style="font-size:11px;color:var(--st-text-secondary);margin-bottom:4px;">${this.escapeHtml(e.morphologySummary)} • ${this.escapeHtml(e.sourceCitation)}</div>
                  <div style="font-family:var(--st-font-latin);font-size:12px;padding:6px;background:var(--st-bg-elevated);border-radius:4px;">
                    "${this.escapeHtml(e.originalSentence)}"
                  </div>
                </div>
              `
              )
              .join('')
      }
    `;

    container.querySelectorAll<HTMLButtonElement>('[data-remove-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-id')!;
        const existing = this.vocabStore.getAll().find((e) => e.id === id);
        this.vocabStore.removeEntry(id);
        if (existing) {
          this.updateLemmaDOMStatus(existing.lemma, 0);
        }
        this.persistState();
        this.renderSidePanel();
        this.refreshTopBarCoverage();
        if (this.selectedElement && this.currentAnalysis) {
          this.renderPopup(this.selectedElement, this.currentAnalysis);
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-edit-vocab-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-vocab-id')!;
        const editor = container.querySelector<HTMLElement>(`[data-vocab-editor="${id}"]`);
        if (editor) {
          const isHidden = editor.style.display === 'none';
          editor.style.display = isHidden ? 'block' : 'none';
          if (isHidden) {
            container.querySelector<HTMLInputElement>(`[data-edit-def-id="${id}"]`)?.focus();
          }
        }
      });
    });

    const saveVocabEditorById = (id: string): void => {
      const defInput = container.querySelector<HTMLInputElement>(`[data-edit-def-id="${id}"]`);
      const noteInput = container.querySelector<HTMLTextAreaElement>(`[data-edit-note-id="${id}"]`);
      const updated = this.vocabStore.updateEntry(id, {
        customDefinition: (defInput?.value || '').trim(),
        notes: (noteInput?.value || '').trim(),
      });
      if (updated) {
        this.updateLemmaDOMStatus(updated.lemma, updated.familiarity);
        this.persistState();
        this.renderSidePanel();
        if (this.selectedElement && this.currentAnalysis) {
          this.renderPopup(this.selectedElement, this.currentAnalysis);
        }
      }
    };

    container.querySelectorAll<HTMLButtonElement>('[data-save-vocab-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-save-vocab-id')!;
        saveVocabEditorById(id);
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-edit-def-id]').forEach((inp) => {
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          const id = inp.getAttribute('data-edit-def-id')!;
          saveVocabEditorById(id);
        }
      });
    });

    container.querySelectorAll<HTMLTextAreaElement>('[data-edit-note-id]').forEach((ta) => {
      ta.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          ev.stopPropagation();
          const id = ta.getAttribute('data-edit-note-id')!;
          saveVocabEditorById(id);
        }
      });
    });

    const previewBox = container.querySelector('#st-export-preview') as HTMLElement | null;
    const textArea = container.querySelector('#st-export-textarea') as HTMLTextAreaElement | null;
    container.querySelector('#st-export-anki-btn')?.addEventListener('click', () => {
      if (previewBox && textArea) {
        previewBox.style.display = 'block';
        textArea.value = this.vocabStore.exportAnkiTSV();
      }
    });
    container.querySelector('#st-export-json-btn')?.addEventListener('click', () => {
      if (previewBox && textArea) {
        previewBox.style.display = 'block';
        textArea.value = this.vocabStore.exportJSON();
      }
    });
  }

  private renderStatsTab(container: HTMLElement): void {
    const summary = this.statsTracker.getSummary();
    container.innerHTML = `
      ${this.renderModeLegendHtml()}
      <div class="st-card">
        <div class="st-card-title">Vocabulary Milestone Stage</div>
        <div style="font-weight:700;font-size:13.5px;color:var(--st-accent-rubric);margin-bottom:4px;">
          ${this.escapeHtml(summary.progressiveStage)}
        </div>
        <div style="font-size:12px;color:var(--st-text-secondary);">
          As you mark lemmas Known or master them in PhrasePump FSRS reviews, inline visual scaffolding automatically adapts toward independent reading.
        </div>
      </div>
      <div class="st-card">
        <div class="st-card-title">Reading & Acquisition Metrics</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;">
          <div style="padding:8px;background:var(--st-bg-elevated);border-radius:6px;">
            <div style="color:var(--st-text-muted);font-size:11px;">Words Encountered</div>
            <div style="font-size:18px;font-weight:700;">${summary.totalWordsEncountered}</div>
          </div>
          <div style="padding:8px;background:var(--st-bg-elevated);border-radius:6px;">
            <div style="color:var(--st-text-muted);font-size:11px;">Unique Lemmas</div>
            <div style="font-size:18px;font-weight:700;">${summary.uniqueLemmasEncountered}</div>
          </div>
          <div style="padding:8px;background:var(--st-bg-elevated);border-radius:6px;">
            <div style="color:var(--st-text-muted);font-size:11px;">Learning Vocabulary</div>
            <div style="font-size:18px;font-weight:700;color:var(--st-accent-gold);">${summary.learningLemmasCount}</div>
          </div>
          <div style="padding:8px;background:var(--st-bg-elevated);border-radius:6px;">
            <div style="color:var(--st-text-muted);font-size:11px;">Review Accuracy</div>
            <div style="font-size:18px;font-weight:700;color:var(--st-accent-teal);">${summary.reviewAccuracy}%</div>
          </div>
        </div>
        <button type="button" class="st-btn st-btn-primary" id="st-stats-start-review" style="width:100%;justify-content:center;margin-top:12px;padding:8px;">
          Start PhrasePump FSRS Session
        </button>
      </div>
    `;

    container.querySelector('#st-stats-start-review')?.addEventListener('click', () => {
      this.openPhrasePumpModal();
    });
  }

  private createPhrasePumpModal(): void {
    if (this.doc.getElementById('st-phrasepump-modal')) return;
    const modal = this.doc.createElement('div');
    modal.id = 'st-phrasepump-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'PhrasePump and FSRS Vocabulary Review');
    this.doc.body.appendChild(modal);
  }

  public closePhrasePumpModal(): void {
    const modal = this.doc.getElementById('st-phrasepump-modal');
    modal?.classList.remove('st-visible');
    if (this.modalOpenerElement && this.doc.contains(this.modalOpenerElement)) {
      this.modalOpenerElement.focus?.();
    }
  }

  public openPhrasePumpModal(): void {
    const modal = this.doc.getElementById('st-phrasepump-modal');
    if (!modal) return;

    if (!modal.classList.contains('st-visible')) {
      this.modalOpenerElement = this.doc.activeElement as HTMLElement | null;
    }

    const allCards = this.vocabStore.getAll();
    const session = generatePhrasePumpSession(allCards, {
      mode: this.phrasePumpMode,
      limit: 20,
    });
    this.currentSessionExercises = session.exercises;
    this.currentExerciseIndex = 0;
    this.isAnswerRevealed = false;

    modal.classList.add('st-visible');
    this.renderCurrentPhrasePumpExercise();
    const initialFocus = modal.querySelector<HTMLElement>(
      '#st-reveal-answer-btn, #st-close-modal'
    );
    initialFocus?.focus?.();
  }

  private renderCurrentPhrasePumpExercise(): void {
    const modal = this.doc.getElementById('st-phrasepump-modal');
    if (!modal) return;

    if (this.currentSessionExercises.length === 0) {
      modal.innerHTML = `
        <div class="st-modal-dialog">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;color:var(--st-accent-rubric);">PhrasePump & Anki FSRS Studio</h3>
            <button type="button" class="st-btn" id="st-close-modal">Close</button>
          </div>
          <p style="font-size:14px;line-height:1.5;margin:16px 0;">
            No saved vocabulary cards yet! Click on any unfamiliar Latin word in Corpus Thomisticum to save it, then open PhrasePump to practice contextual sentences.
          </p>
        </div>
      `;
      modal.querySelector('#st-close-modal')?.addEventListener('click', () => {
        this.closePhrasePumpModal();
      });
      return;
    }

    if (this.currentExerciseIndex >= this.currentSessionExercises.length) {
      modal.innerHTML = `
        <div class="st-modal-dialog">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;color:var(--st-accent-rubric);">Session Complete!</h3>
            <button type="button" class="st-btn" id="st-close-modal">Return to Reading</button>
          </div>
          <p style="font-size:14.5px;line-height:1.55;margin:16px 0;">
            You completed all <strong>${this.currentSessionExercises.length}</strong> contextual PhrasePump exercises. FSRS intervals have been updated based on your recall ratings.
          </p>
        </div>
      `;
      modal.querySelector('#st-close-modal')?.addEventListener('click', () => {
        this.closePhrasePumpModal();
      });
      return;
    }

    const ex = this.currentSessionExercises[this.currentExerciseIndex];
    const liveEntry = this.vocabStore.getByLemma(ex.lemma) || ex.entry;
    const now = new Date();
    const preview1 = scheduleFSRSReview(liveEntry.fsrsCard, 1, now).card.scheduledDays;
    const preview2 = scheduleFSRSReview(liveEntry.fsrsCard, 2, now).card.scheduledDays;
    const preview3 = scheduleFSRSReview(liveEntry.fsrsCard, 3, now).card.scheduledDays;
    const preview4 = scheduleFSRSReview(liveEntry.fsrsCard, 4, now).card.scheduledDays;
    const progressPct = Math.round(
      ((this.currentExerciseIndex + 1) / Math.max(1, this.currentSessionExercises.length)) * 100
    );

    modal.innerHTML = `
      <div class="st-modal-dialog">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="st-section-badge" data-type="corpus">${this.escapeHtml(ex.promptTitle)} (${this.currentExerciseIndex + 1}/${this.currentSessionExercises.length})</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <select id="st-phrasepump-mode" class="st-btn" title="Select PhrasePump Exercise Mode" aria-label="Select PhrasePump Exercise Mode">
              <option value="mixed" ${this.phrasePumpMode === 'mixed' ? 'selected' : ''}>Mode: Mixed (All 4)</option>
              <option value="phrasepump-cloze" ${this.phrasePumpMode === 'phrasepump-cloze' ? 'selected' : ''}>Mode: Sentence Cloze</option>
              <option value="la-to-en" ${this.phrasePumpMode === 'la-to-en' ? 'selected' : ''}>Mode: Latin \u2192 English</option>
              <option value="en-to-la" ${this.phrasePumpMode === 'en-to-la' ? 'selected' : ''}>Mode: English \u2192 Latin</option>
              <option value="grammar-context" ${this.phrasePumpMode === 'grammar-context' ? 'selected' : ''}>Mode: Scholastic Grammar</option>
            </select>
            <button type="button" class="st-btn" id="st-close-modal">Close (Esc)</button>
          </div>
        </div>
        <div class="st-phrasepump-progress-track">
          <div class="st-phrasepump-progress-bar" style="width:${progressPct}%;"></div>
        </div>
        <div style="font-size:12px;color:var(--st-text-muted);margin-bottom:4px;">
          Source: <strong>${this.escapeHtml(ex.sourceWork)} ${this.escapeHtml(ex.sourceCitation)}</strong>
        </div>

        <div class="st-cloze-sentence">
          ${this.escapeHtml(this.isAnswerRevealed ? ex.originalSentence : ex.clozeSentence)}
        </div>

        <div style="font-size:13.5px;color:var(--st-text-secondary);margin-bottom:12px;">
          <strong>Sentence Context:</strong> "${this.escapeHtml(ex.sentenceTranslation)}"
        </div>

        <div style="padding:10px 12px;background:var(--st-bg-elevated);border-radius:8px;margin-bottom:14px;font-size:13px;">
          ${
            ex.type === 'en-to-la'
              ? `<strong>Recall the Latin word for:</strong> "${this.escapeHtml(ex.translationHint)}" (${this.escapeHtml(ex.grammarHint)})`
              : ex.type === 'la-to-en'
              ? `<strong>Recall the English meaning of:</strong> <span style="color:var(--st-accent-rubric);font-weight:700;">${this.escapeHtml(ex.latinWord)}</span> (${this.escapeHtml(ex.headword)})`
              : ex.type === 'grammar-context'
              ? `<strong>Identify the grammatical form of:</strong> <span style="color:var(--st-accent-rubric);font-weight:700;">${this.escapeHtml(ex.latinWord)}</span>`
              : `<strong>Cloze Cue:</strong> ${this.escapeHtml(ex.translationHint)} \u2022 <em>${this.escapeHtml(ex.grammarHint)}</em>`
          }
        </div>

        ${
          !this.isAnswerRevealed
            ? `
            <button type="button" class="st-btn st-btn-primary" id="st-reveal-answer-btn" style="width:100%;justify-content:center;padding:10px;font-size:14px;">
              Show Answer & Contextual Explanation (Space)
            </button>
          `
            : `
            <div style="padding:12px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-bg-elevated);margin-bottom:12px;">
              <div style="font-size:16px;font-weight:700;color:var(--st-accent-rubric);margin-bottom:4px;">
                Answer: ${this.escapeHtml(ex.expectedAnswer)} (${this.escapeHtml(ex.headword)})
              </div>
              <div style="font-size:13px;margin-bottom:4px;"><strong>Meaning:</strong> ${this.escapeHtml(ex.contextualMeaning)}</div>
              ${ex.userNotes ? `<div style="font-size:12.5px;margin-bottom:4px;color:var(--st-accent-teal);"><strong>My Note:</strong> ${this.escapeHtml(ex.userNotes)}</div>` : ''}
              <div style="font-size:12px;color:var(--st-text-secondary);"><strong>Grammar:</strong> ${this.escapeHtml(ex.grammarHint)}</div>
            </div>
            <div class="st-fsrs-buttons">
              <button type="button" class="st-fsrs-btn st-fsrs-1" data-fsrs-grade="1">1 \u2022 Again<br><small>${preview1 === 0 ? '10m' : `${preview1}d`}</small></button>
              <button type="button" class="st-fsrs-btn st-fsrs-2" data-fsrs-grade="2">2 \u2022 Hard<br><small>${preview2}d</small></button>
              <button type="button" class="st-fsrs-btn st-fsrs-3" data-fsrs-grade="3">3 \u2022 Good<br><small>${preview3}d</small></button>
              <button type="button" class="st-fsrs-btn st-fsrs-4" data-fsrs-grade="4">4 \u2022 Easy<br><small>${preview4}d</small></button>
            </div>
          `
        }
      </div>
    `;

    modal.querySelector('#st-close-modal')?.addEventListener('click', () => {
      this.closePhrasePumpModal();
    });

    const modeSelect = modal.querySelector('#st-phrasepump-mode') as HTMLSelectElement | null;
    modeSelect?.addEventListener('change', () => {
      this.phrasePumpMode = modeSelect.value as 'mixed' | PhrasePumpExerciseType;
      this.openPhrasePumpModal();
    });

    modal.querySelector('#st-reveal-answer-btn')?.addEventListener('click', () => {
      this.isAnswerRevealed = true;
      this.renderCurrentPhrasePumpExercise();
    });

    modal.querySelectorAll<HTMLButtonElement>('[data-fsrs-grade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rating = Number(btn.getAttribute('data-fsrs-grade')) as FSRSRating;
        this.gradeCurrentPhrasePumpCard(rating);
      });
    });
  }

  public gradeCurrentPhrasePumpCard(rating: FSRSRating): void {
    const ex = this.currentSessionExercises[this.currentExerciseIndex];
    if (!ex) return;

    this.vocabStore.reviewEntry(ex.entryId, rating);
    this.statsTracker.recordReviewOutcome(rating >= 2, rating);
    this.persistState();

    this.currentExerciseIndex += 1;
    this.isAnswerRevealed = false;
    this.renderCurrentPhrasePumpExercise();
    this.renderSidePanel();
    this.refreshTopBarCoverage();
  }

  private bindGlobalKeyboardShortcuts(): void {
    this.doc.addEventListener('keydown', (ev) => {
      const modalEl = this.doc.getElementById('st-phrasepump-modal');
      const modalVisible = Boolean(modalEl?.classList.contains('st-visible'));
      const popupEl = this.doc.getElementById('st-popup');
      const popupVisible = Boolean(popupEl?.classList.contains('st-visible'));
      const activeEl = this.doc.activeElement as HTMLElement | null;
      const activeTag = activeEl?.tagName;

      // BUG-04: Trap Tab / Shift+Tab inside PhrasePump modal while open
      if (modalVisible && ev.key === 'Tab' && modalEl) {
        const focusables = Array.from(
          modalEl.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (ev.shiftKey) {
            if (!activeEl || activeEl === first || !modalEl.contains(activeEl)) {
              ev.preventDefault();
              last.focus();
            }
          } else {
            if (!activeEl || activeEl === last || !modalEl.contains(activeEl)) {
              ev.preventDefault();
              first.focus();
            }
          }
        }
        return;
      }

      if (ev.key === 'Escape') {
        if (modalVisible) {
          this.closePhrasePumpModal();
        } else if (
          activeEl &&
          (activeTag === 'INPUT' || activeTag === 'TEXTAREA') &&
          activeEl.closest('#st-sidepanel')
        ) {
          // BUG-09.1: Escape inside a sidepanel search/edit input blurs the input without closing the word popup
          activeEl.blur?.();
        } else {
          this.closePopup();
        }
        return;
      }

      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      if (modalVisible) {
        if (ev.code === 'Space' || ev.key === ' ') {
          ev.preventDefault();
          if (!this.isAnswerRevealed) {
            this.isAnswerRevealed = true;
            this.renderCurrentPhrasePumpExercise();
          } else {
            this.gradeCurrentPhrasePumpCard(3);
          }
          return;
        }
        if (['1', '2', '3', '4'].includes(ev.key)) {
          ev.preventDefault();
          if (this.isAnswerRevealed) {
            this.gradeCurrentPhrasePumpCard(Number(ev.key) as FSRSRating);
          }
          return;
        }
        // Ignore other hotkeys while modal is open so they never mutate background reading state
        return;
      }

      if ((ev.key === 's' || ev.key === 'S') && popupVisible && this.selectedElement && this.currentAnalysis) {
        this.saveCurrentWord(1);
        this.refreshTopBarCoverage();
      } else if ((ev.key === 'k' || ev.key === 'K') && popupVisible && this.selectedElement && this.currentAnalysis) {
        this.saveCurrentWord(4);
        this.refreshTopBarCoverage();
      } else if (['1', '2', '3', '4'].includes(ev.key) && popupVisible && this.selectedElement && this.currentAnalysis) {
        this.saveCurrentWord(Number(ev.key) as FamiliarityLevel);
        this.refreshTopBarCoverage();
      } else if (ev.key === 'r' || ev.key === 'R') {
        this.openPhrasePumpModal();
      } else if (ev.key === 'b' || ev.key === 'B') {
        this.prefs.bilingualMode = !this.prefs.bilingualMode;
        this.applyPreferences();
        this.persistState();
      } else if (ev.key === 'd' || ev.key === 'D') {
        this.prefs.darkMode = !this.prefs.darkMode;
        this.applyPreferences();
        this.persistState();
      }
    });
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
