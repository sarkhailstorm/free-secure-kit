import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Both Apache-2.0, see MODEL-LICENCES.md. The hash is in the filename so a
// browser can keep the file forever and never ask for it a second time.
const models = [
  {
    name: 'modnet-7bad6522.onnx',
    url: 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_uint8.onnx',
    bytes: 6627048,
    sha256: '7bad6522b3cde60246e69e234b7786337ef9c88abc790ee5c1aaa6e535b0c61d',
  },
  {
    name: 'u2netp-309c8469.onnx',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
    bytes: 4574861,
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
  },
];

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');

const destDir = join(root, 'public/models');
mkdirSync(destDir, { recursive: true });

for (const model of models) {
  const dest = join(destDir, model.name);

  if (existsSync(dest) && digest(readFileSync(dest)) === model.sha256) {
    console.log(`[fetch-bg-models] public/models/${model.name} already present, skipped`);
    continue;
  }

  const response = await fetch(model.url, { redirect: 'follow' });
  if (!response.ok) {
    console.error(
      `[fetch-bg-models] ${model.url} returned ${response.status}.\n` +
        'Check your connection and run `npm install` again.',
    );
    process.exit(1);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== model.bytes || digest(bytes) !== model.sha256) {
    console.error(
      `[fetch-bg-models] ${model.name} did not match and was not written.\n` +
        `Expected ${model.bytes} bytes / ${model.sha256}\n` +
        `Received ${bytes.length} bytes / ${digest(bytes)}`,
    );
    process.exit(1);
  }

  writeFileSync(dest, bytes);
  console.log(`[fetch-bg-models] public/models/${model.name} downloaded (${bytes.length} bytes)`);
}
