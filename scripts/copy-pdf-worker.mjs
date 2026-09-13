
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  'node_modules/pdfjs-dist/build/pdf.worker.mjs',
];

const source = candidates.map((p) => join(root, p)).find((p) => existsSync(p));

if (!source) {
  console.error(
    '[copy-pdf-worker] Could not find the pdf.js worker in node_modules.\n' +
      'Run `npm install` first.',
  );
  process.exit(1);
}

const destDir = join(root, 'public');
mkdirSync(destDir, { recursive: true });
copyFileSync(source, join(destDir, 'pdf.worker.min.mjs'));
console.log('[copy-pdf-worker] public/pdf.worker.min.mjs updated');
