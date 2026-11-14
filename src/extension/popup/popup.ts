export {};

const STORAGE_KEY_VOCAB = 'schola_thomistica_vocab_v1';

function initPopup(): void {
  const savedEl = document.getElementById('pop-saved');
  const dueEl = document.getElementById('pop-due');
  const studyBtn = document.getElementById('open-study-btn');

  studyBtn?.addEventListener('click', () => {
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('study/study.html')
      : '../study/study.html';
    window.open(url, '_blank');
  });

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get([STORAGE_KEY_VOCAB], (res) => {
      const snap = res[STORAGE_KEY_VOCAB];
      if (snap && Array.isArray(snap.entries)) {
        if (savedEl) savedEl.textContent = String(snap.entries.length);
        const now = Date.now();
        const due = snap.entries.filter(
          (e: { familiarity: number; fsrsCard?: { due?: string } }) =>
            e.familiarity < 4 && e.fsrsCard?.due && new Date(e.fsrsCard.due).getTime() <= now
        ).length;
        if (dueEl) dueEl.textContent = String(due);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initPopup);
