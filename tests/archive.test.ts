import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ARCHIVE_DIR = path.resolve(import.meta.dirname, '../archive');
const MANIFEST_PATH = path.join(ARCHIVE_DIR, 'manifest-archive.json');

describe('Task 1: Corpus Thomisticum Website Archive', () => {
  it('creates manifest-archive.json with complete site inventory', () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.totalFiles).toBeGreaterThanOrEqual(700);
    expect(manifest.totalBytes).toBeGreaterThan(50_000_000);
    expect(manifest.sourceUrl).toBe('https://www.corpusthomisticum.org/');
  });

  it('archives core navigation, Opera Omnia, Thomas-Lexikon, and stylesheets', () => {
    const requiredFiles = [
      'index.html',
      'iopera.html',
      'tl.html',
      'tla.html',
      'tls.html',
      'sth0000.html',
      'sth1001.html',
      'scg1001.html',
      'snp0000.html',
      'vscreen.css',
      'vprint.css',
      'ichartae.html',
      'ibfonvit.html',
      'ilcatope.html',
      'uabbrev.html',
    ];
    for (const rel of requiredFiles) {
      const fullPath = path.join(ARCHIVE_DIR, rel);
      expect(fs.existsSync(fullPath), `Missing archived file: ${rel}`).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(100);
    }
  });

  it('preserves authentic Latin texts and citation anchors in Summa Theologiae I q. 1', () => {
    const sth1001 = fs.readFileSync(path.join(ARCHIVE_DIR, 'sth1001.html'), 'latin1');
    expect(sth1001).toContain('[28236]');
    expect(sth1001).toContain('Respondeo dicendum quod necessarium fuit ad humanam salutem');
    expect(sth1001).toContain('TITLE="I q. 1 a. 1 co."');
  });

  it('DEF-014 & DEF-015: resolves 100% of internal HTML/CSS references in archived pages and keeps manifest-archive.json free of form-value junk URLs', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.totalFiles).toBe(1217);
    for (const u of manifest.failedUrls || []) {
      expect(u).not.toMatch(/\/(OK|UTF-8|Adelante|Agedum|REPERI|&nbsp;)/);
    }

    const linkRe = /(?:HREF|SRC|href|src)\s*=\s*["']([^"']+)["']/gi;
    const collectHtmlFiles = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '_extension' || entry.name === 'demo-reader.html') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...collectHtmlFiles(full));
        } else if (entry.isFile() && /\.htm(l)?$/i.test(entry.name)) {
          out.push(full);
        }
      }
      return out;
    };
    const htmlFiles = collectHtmlFiles(ARCHIVE_DIR);
    const missingInternal: string[] = [];

    for (const filePath of htmlFiles) {
      const content = fs.readFileSync(filePath, 'latin1');
      const parentDir = path.dirname(filePath);
      for (const m of content.matchAll(linkRe)) {
        const raw = m[1].trim();
        if (!raw || /^(#|https?:\/\/|mailto:|javascript:|data:)/i.test(raw)) continue;
        const clean = raw.split('#')[0].split('?')[0];
        if (!clean) continue;
        const resolved = clean.startsWith('/')
          ? path.resolve(ARCHIVE_DIR, clean.slice(1))
          : path.resolve(parentDir, clean);
        if (!fs.existsSync(resolved)) {
          missingInternal.push(`${path.relative(ARCHIVE_DIR, filePath)} -> ${raw}`);
        }
      }
    }
    expect(missingInternal).toEqual([]);
  });
});
