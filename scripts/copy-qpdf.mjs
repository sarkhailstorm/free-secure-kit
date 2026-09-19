import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// qpdf, Apache-2.0, compiled to WebAssembly. See THIRD-PARTY-LICENCES.md.
// The hash is pinned so an unexpected build fails the install loudly rather
// than shipping a binary nobody looked at, and it is in the served filename so
// a browser can keep the file forever.
const EXPECTED = 'cbd81a244d622a39e3cf16f2e589a9a0d7cc51f588d35b3dd6b425a677cc3f99';

const source = join(root, 'node_modules/@jspawn/qpdf-wasm/qpdf.wasm');
if (!existsSync(source)) {
  console.error('[copy-qpdf] node_modules/@jspawn/qpdf-wasm/qpdf.wasm is missing. Run `npm install` first.');
  process.exit(1);
}

const bytes = readFileSync(source);
const digest = createHash('sha256').update(bytes).digest('hex');
if (digest !== EXPECTED) {
  console.error(
    `[copy-qpdf] qpdf.wasm did not match and was not copied.\n` +
      `Expected ${EXPECTED}\nReceived ${digest}\n` +
      `If the upgrade is intended, update EXPECTED here and QPDF_FILE in src/lib/assets.ts to qpdf-${digest.slice(0, 8)}.wasm.`,
  );
  process.exit(1);
}

const name = `qpdf-${digest.slice(0, 8)}.wasm`;
const destDir = join(root, 'public/qpdf');
mkdirSync(destDir, { recursive: true });

// Drop any older build, so a renamed file does not sit in public/ forever.
for (const existing of readdirSync(destDir)) {
  if (existing !== name) rmSync(join(destDir, existing));
}

const dest = join(destDir, name);
if (existsSync(dest) && readFileSync(dest).length === bytes.length) {
  console.log(`[copy-qpdf] public/qpdf/${name} already present, skipped`);
} else {
  writeFileSync(dest, bytes);
  console.log(`[copy-qpdf] public/qpdf/${name} written (${bytes.length} bytes)`);
}
