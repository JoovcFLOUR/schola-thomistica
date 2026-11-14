import { analyzeWordInContext } from '../../core/context-analyzer';
import { VocabularyStore } from '../../core/vocabulary-store';
import { generatePhrasePumpSession, FSRSRating } from '../../core/fsrs';

const STORAGE_KEY_VOCAB = 'schola_thomistica_vocab_v1';

function seedStarterDeckIfEmpty(store: VocabularyStore): void {
  if (store.getAll().length > 0) return;
  store.saveWord({
    word: 'doctrinam',
    lemma: 'doctrina',
    headword: 'doctrina, -ae (f.)',
    translation: 'sacred doctrine, teaching, systematic instruction',
    contextualMeaning: 'divinely revealed sacred doctrine beyond natural philosophy',
    partOfSpeech: 'Noun',
    morphologySummary: 'Accusative Singular Feminine, 1st declension',
    originalSentence:
      'Necessarium igitur fuit, praeter philosophicas disciplinas, quae per rationem investigantur, sacram doctrinam per revelationem haberi.',
    sentenceTranslation:
      'It was therefore necessary that besides philosophical science built up by reason, there should be a sacred science learned through revelation.',
    sourceWork: 'Summa Theologiae',
    sourceCitation: '[28236] I\u00AA q. 1 a. 1 co.',
    tags: ['Thomistic Key Term', 'ST I q. 1'],
  });
  store.saveWord({
    word: 'ente',
    lemma: 'ens',
    headword: 'ens, entis (n.)',
    translation: 'being, that which is (id quod habet esse)',
    contextualMeaning: 'being, convertible with the true (quod cum ente convertitur)',
    partOfSpeech: 'Noun / Participle',
    morphologySummary: 'Ablative Singular Neuter, 3rd declension',
    originalSentence:
      'Praeterea, doctrina non potest esse nisi de ente, nihil enim scitur nisi verum, quod cum ente convertitur.',
    sentenceTranslation:
      'Further, knowledge can be concerned only with being, for nothing can be known, save what is true; and all that is, is true.',
    sourceWork: 'Summa Theologiae',
    sourceCitation: '[28234] I\u00AA q. 1 a. 1 arg. 2',
    tags: ['Thomistic Key Term', 'Metaphysics'],
  });
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function persistStudyStore(win: Window & typeof globalThis, store: VocabularyStore): void {
  const snap = store.toSnapshot();
  try {
    win.localStorage?.setItem(STORAGE_KEY_VOCAB, JSON.stringify(snap));
  } catch {
    // Ignore localStorage quota/sandbox errors
  }
  try {
    const chromeApi = (win as unknown as { chrome?: typeof chrome }).chrome;
    if (chromeApi?.storage?.local) {
      chromeApi.storage.local.set({ [STORAGE_KEY_VOCAB]: snap });
    }
  } catch {
    // Ignore chrome.storage errors
  }
}

export function initStudyCenter(
  win: Window & typeof globalThis = typeof window !== 'undefined'
    ? (window as Window & typeof globalThis)
    : (globalThis as unknown as Window & typeof globalThis)
): void {
  const doc = win.document;
  if (!doc) return;
  const root = doc.getElementById('study-app-root');
  if (!root) return;

  const store = new VocabularyStore();
  let hasSavedSnapshot = false;

  try {
    const raw = win.localStorage?.getItem(STORAGE_KEY_VOCAB);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.entries) && parsed.entries.length > 0) {
        hasSavedSnapshot = true;
      }
      store.mergeSnapshot(parsed);
    }
  } catch {
    // Ignore localStorage parse errors
  }

  const startSessionAndRender = (): void => {
    if (!hasSavedSnapshot && store.getAll().length === 0) {
      seedStarterDeckIfEmpty(store);
      persistStudyStore(win, store);
    }

    let idx = 0;
    let revealed = false;
    const session = generatePhrasePumpSession(store.getAll(), { mode: 'mixed', limit: 20 });

    const render = (): void => {
      const ex = session.exercises[idx];
      if (!ex) {
        root.innerHTML = `<div class="st-card"><h3>All PhrasePump reviews completed!</h3></div>`;
        return;
      }

      const analysis = analyzeWordInContext(ex.latinWord, ex.originalSentence, ex.sourceCitation);
      root.innerHTML = `
        <div class="st-card">
          <div class="st-card-title">${escapeHtml(ex.promptTitle)} (${idx + 1}/${session.exercises.length})</div>
          <div class="st-cloze-sentence">${escapeHtml(revealed ? ex.originalSentence : ex.clozeSentence)}</div>
          <div style="margin-bottom:10px;color:var(--st-text-secondary);">"${escapeHtml(ex.sentenceTranslation)}"</div>
          ${
            !revealed
              ? `<button class="st-btn st-btn-primary" id="study-reveal">Reveal Answer & Grammar Analysis</button>`
              : `
              <div style="padding:12px;background:var(--st-bg-elevated);border-radius:8px;margin-bottom:12px;">
                <div style="font-size:17px;font-weight:700;color:var(--st-accent-rubric);">${escapeHtml(ex.expectedAnswer)} (${escapeHtml(ex.headword)})</div>
                <div style="margin:4px 0;">${escapeHtml(ex.contextualMeaning)}</div>
                ${ex.userNotes ? `<div style="font-size:12.5px;margin:4px 0;color:var(--st-accent-teal);"><strong>My Note:</strong> ${escapeHtml(ex.userNotes)}</div>` : ''}
                <div style="font-size:12px;color:var(--st-text-secondary);">${escapeHtml(analysis.disambiguationReason)}</div>
              </div>
              <div class="st-fsrs-buttons">
                <button class="st-fsrs-btn st-fsrs-1" data-rate="1">Again</button>
                <button class="st-fsrs-btn st-fsrs-2" data-rate="2">Hard</button>
                <button class="st-fsrs-btn st-fsrs-3" data-rate="3">Good</button>
                <button class="st-fsrs-btn st-fsrs-4" data-rate="4">Easy</button>
              </div>
            `
          }
        </div>
      `;

      root.querySelector('#study-reveal')?.addEventListener('click', () => {
        revealed = true;
        render();
      });
      root.querySelectorAll<HTMLButtonElement>('[data-rate]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = Number(btn.getAttribute('data-rate')) as FSRSRating;
          store.reviewEntry(ex.entryId, r);
          persistStudyStore(win, store);
          idx += 1;
          revealed = false;
          render();
        });
      });
    };

    render();
  };

  const chromeApi = (win as unknown as { chrome?: typeof chrome }).chrome;
  if (chromeApi?.storage?.local) {
    chromeApi.storage.local.get([STORAGE_KEY_VOCAB], (res) => {
      if (res?.[STORAGE_KEY_VOCAB]) {
        const shared = res[STORAGE_KEY_VOCAB];
        if (Array.isArray(shared?.entries) && shared.entries.length > 0) {
          hasSavedSnapshot = true;
        }
        store.mergeSnapshot(shared);
        persistStudyStore(win, store);
      } else if (store.getAll().length > 0) {
        persistStudyStore(win, store);
      }
      startSessionAndRender();
    });
  } else {
    startSessionAndRender();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initStudyCenter());
}
