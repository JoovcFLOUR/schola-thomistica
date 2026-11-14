import { ScholaThomisticaReader } from './reader-controller';

function shouldActivateReader(): boolean {
  const host = window.location.hostname || '';
  if (host.includes('corpusthomisticum.org')) return true;
  const title = document.title || '';
  const metaKeywords =
    document.querySelector('meta[name="keywords"], meta[NAME="keywords"]')?.getAttribute('content') ||
    document.querySelector('meta[name="keywords"], meta[NAME="keywords"]')?.getAttribute('CONTENT') ||
    '';
  if (
    title.includes('Corpus Thomisticum') ||
    title.includes('Thomas de Aquino') ||
    title.includes('Thomas-Lexikon') ||
    metaKeywords.includes('Thomas de Aquino')
  ) {
    return true;
  }
  return false;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const startReader = (): void => {
    if (shouldActivateReader()) {
      const reader = new ScholaThomisticaReader(window);
      reader.init();
      (window as unknown as { __scholaThomistica?: ScholaThomisticaReader }).__scholaThomistica =
        reader;
    }
  };
  if (/jsdom/i.test(window.navigator?.userAgent || '')) {
    startReader();
  } else {
    window.setTimeout(startReader, 0);
  }
}
