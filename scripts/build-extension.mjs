import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_EXT = path.join(ROOT, 'src', 'extension');
const SRC_DATA = path.join(ROOT, 'src', 'data');
const DIST_EXT = path.join(ROOT, 'dist', 'extension');
const DIST_EXT_LITE = path.join(ROOT, 'dist', 'extension-lite');

function createSolidPng(size, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawRows = Buffer.alloc(size * (size * 4 + 1));
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const arm = Math.max(1, Math.floor(size * 0.14));
  const margin = Math.max(1, Math.floor(size * 0.18));

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rawRows[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const inCross =
        (Math.abs(x - cx) <= arm && y >= margin && y < size - margin) ||
        (Math.abs(y - cy) <= arm && x >= margin && x < size - margin);
      if (inCross) {
        // Gold cross (#E5B85C) on Rubric background (#800000)
        rawRows[px] = 229;
        rawRows[px + 1] = 184;
        rawRows[px + 2] = 92;
        rawRows[px + 3] = 255;
      } else {
        rawRows[px] = r;
        rawRows[px + 1] = g;
        rawRows[px + 2] = b;
        rawRows[px + 3] = 255;
      }
    }
  }

  const idat = zlib.deflateSync(rawRows);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function buildExtension() {
  fs.rmSync(DIST_EXT, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST_EXT, 'styles'), { recursive: true });
  fs.mkdirSync(path.join(DIST_EXT, 'popup'), { recursive: true });
  fs.mkdirSync(path.join(DIST_EXT, 'study'), { recursive: true });
  fs.mkdirSync(path.join(DIST_EXT, 'data'), { recursive: true });
  fs.mkdirSync(path.join(DIST_EXT, 'icons'), { recursive: true });

  // Generate extension icons (16x16, 48x48, 128x128)
  const srcIconsDir = path.join(SRC_EXT, 'icons');
  fs.mkdirSync(srcIconsDir, { recursive: true });
  for (const sz of [16, 48, 128]) {
    const png = createSolidPng(sz, 128, 0, 0);
    fs.writeFileSync(path.join(srcIconsDir, `icon${sz}.png`), png);
    fs.writeFileSync(path.join(DIST_EXT, 'icons', `icon${sz}.png`), png);
  }

  // Copy static assets & legal/privacy disclosures
  fs.copyFileSync(path.join(SRC_EXT, 'manifest.json'), path.join(DIST_EXT, 'manifest.json'));
  for (const docFile of ['PRIVACY_POLICY.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    const srcDoc = path.join(ROOT, docFile);
    if (fs.existsSync(srcDoc)) {
      fs.copyFileSync(srcDoc, path.join(DIST_EXT, docFile));
    }
  }
  fs.copyFileSync(
    path.join(SRC_EXT, 'styles', 'content.css'),
    path.join(DIST_EXT, 'styles', 'content.css')
  );
  fs.copyFileSync(
    path.join(SRC_EXT, 'popup', 'popup.html'),
    path.join(DIST_EXT, 'popup', 'popup.html')
  );
  fs.copyFileSync(
    path.join(SRC_EXT, 'study', 'study.html'),
    path.join(DIST_EXT, 'study', 'study.html')
  );

  // Copy external JSON data shards for on-demand browser loading (DEF-003)
  const archiveExtDir = path.join(ROOT, 'archive', '_extension');
  const archiveDataDir = path.join(archiveExtDir, 'data');
  fs.mkdirSync(archiveDataDir, { recursive: true });
  for (const file of fs.readdirSync(SRC_DATA)) {
    if (file.endsWith('.json')) {
      fs.copyFileSync(path.join(SRC_DATA, file), path.join(DIST_EXT, 'data', file));
      fs.copyFileSync(path.join(SRC_DATA, file), path.join(archiveDataDir, file));
    }
  }

  // Write scoped MAIN-world Perseus double-click neutralizer (DEF-011)
  fs.writeFileSync(
    path.join(DIST_EXT, 'neutralize-perseus.js'),
    'try { if (typeof window.goPage === "function" || /corpusthomisticum/i.test(location.hostname) || /thomas|thomistic/i.test(document.title)) { document.ondblclick = null; window.goPage = function() {}; } } catch (e) {}\n',
    'utf-8'
  );

  // Bundle content.ts, background.ts, popup.ts, study.ts (lightweight < 100 KB bundles!)
  await esbuild.build({
    entryPoints: [
      { in: path.join(SRC_EXT, 'content.ts'), out: 'content' },
      { in: path.join(SRC_EXT, 'background.ts'), out: 'background' },
      { in: path.join(SRC_EXT, 'popup', 'popup.ts'), out: 'popup/popup' },
      { in: path.join(SRC_EXT, 'study', 'study.ts'), out: 'study/study' },
    ],
    outdir: DIST_EXT,
    bundle: true,
    format: 'iife',
    target: ['chrome114', 'edge114'],
    charset: 'ascii',
    minify: true,
    sourcemap: false,
  });

  // Also copy content.js and content.css into archive/_extension/ so the local archive server can preview it directly in any browser tab
  fs.copyFileSync(path.join(DIST_EXT, 'content.js'), path.join(archiveExtDir, 'content.js'));
  fs.copyFileSync(
    path.join(DIST_EXT, 'styles', 'content.css'),
    path.join(archiveExtDir, 'content.css')
  );

    // Create a live interactive demo preview page in archive/demo-reader.html that loads sth1001.html with the extension active
    const sth1001Raw = fs.readFileSync(path.join(ROOT, 'archive', 'sth1001.html'), 'latin1');
    const injectedDemo = sth1001Raw
      .replace(
        '</HEAD>',
        '<LINK REL="stylesheet" HREF="_extension/content.css?v=1.2.0" TYPE="text/css">\n</HEAD>'
      )
      .replace('</BODY>', '<SCRIPT SRC="_extension/content.js?v=1.2.0"></SCRIPT>\n</BODY>');
    fs.writeFileSync(path.join(ROOT, 'archive', 'demo-reader.html'), injectedDemo, 'latin1');

  const contentBytes = fs.statSync(path.join(DIST_EXT, 'content.js')).size;
  const studyBytes = fs.statSync(path.join(DIST_EXT, 'study', 'study.js')).size;

  // Also build Essential / Lite Edition (dist/extension-lite) with the 5 dictionaries only (without summa-english.json)
  fs.rmSync(DIST_EXT_LITE, { recursive: true, force: true });
  fs.cpSync(DIST_EXT, DIST_EXT_LITE, { recursive: true });
  const liteSummaPath = path.join(DIST_EXT_LITE, 'data', 'summa-english.json');
  if (fs.existsSync(liteSummaPath)) {
    fs.rmSync(liteSummaPath, { force: true });
  }

  console.log(
    `[build] Successfully built Complete Edition (${DIST_EXT}) and Essential Edition (${DIST_EXT_LITE}) (content.js: ${(contentBytes / 1024).toFixed(1)} KB, study.js: ${(studyBytes / 1024).toFixed(1)} KB)`
  );
}

buildExtension().catch((err) => {
  console.error(err);
  process.exit(1);
});
