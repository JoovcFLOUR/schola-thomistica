export {};

const STORAGE_KEY_VOCAB = 'schola_thomistica_vocab_v1';

function updateDueBadge(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.get([STORAGE_KEY_VOCAB], (res) => {
    const snap = res[STORAGE_KEY_VOCAB];
    if (!snap || !Array.isArray(snap.entries)) {
      chrome.action?.setBadgeText({ text: '' });
      return;
    }
    const now = Date.now();
    const dueCount = snap.entries.filter(
      (e: { familiarity: number; fsrsCard?: { due?: string } }) =>
        e.familiarity < 4 && e.fsrsCard?.due && new Date(e.fsrsCard.due).getTime() <= now
    ).length;

    chrome.action?.setBadgeBackgroundColor({ color: '#800000' });
    chrome.action?.setBadgeText({ text: dueCount > 0 ? String(dueCount) : '' });
  });
}

if (typeof chrome !== 'undefined') {
  chrome.runtime?.onInstalled?.addListener(() => {
    updateDueBadge();
  });
  chrome.storage?.onChanged?.addListener(() => {
    updateDueBadge();
  });
}
