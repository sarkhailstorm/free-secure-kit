import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// CPU build only; the jsep/jspi/asyncify variants need WebGPU or stack switching and add 60 MB
const names = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

const sourceDir = join(root, 'node_modules/onnxruntime-web/dist');
const missing = names.filter((name) => !existsSync(join(sourceDir, name)));

if (missing.length > 0) {
  console.error(
    `[copy-onnx-runtime] Could not find ${missing.join(', ')} in node_modules.\n` +
      'Run `npm install` first.',
  );
  process.exit(1);
}

const destDir = join(root, 'public/ort');
mkdirSync(destDir, { recursive: true });
for (const name of names) {
  copyFileSync(join(sourceDir, name), join(destDir, name));
}
console.log(`[copy-onnx-runtime] public/ort/ updated (${names.length} files)`);
