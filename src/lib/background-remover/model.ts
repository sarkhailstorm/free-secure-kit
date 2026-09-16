import { BackgroundRemoverError, type ModelChoice, type ModelChoiceInfo } from './types';

/**
 * The one-time download, and the Cache Storage copy that stops it happening twice.
 *
 * Nothing here runs until the user asks for a cut-out. The site is on a fixed
 * monthly transfer allowance and is paused rather than billed when it runs out,
 * so a second download of the same bytes is not a small waste — it is the thing
 * most likely to take the whole site offline.
 */

/** Bump when a file below is replaced, so older copies are dropped wholesale. */
const CACHE_NAME = 'securekit-background-remover-v1';
const CACHE_PREFIX = 'securekit-background-remover-';

interface Asset {
  url: string;
  /** Exact uncompressed length, used to verify the download and size the bar. */
  bytes: number;
}

/** Shared by both choices, and over a third of the first-use download. */
const ENGINE: Asset = { url: '/ort/ort-wasm-simd-threaded.wasm', bytes: 14_239_897 };

const CUTTERS: Record<ModelChoice, Asset> = {
  anything: { url: '/models/u2netp-309c8469.onnx', bytes: 4_574_861 },
  person: { url: '/models/modnet-7bad6522.onnx', bytes: 6_627_048 },
};

export const MODEL_CHOICES: Record<ModelChoice, ModelChoiceInfo> = {
  anything: {
    id: 'anything',
    label: 'Anything',
    hint: 'Works on people, products, pets and objects.',
    downloadLabel: 'about 7 MB',
    extraDownloadLabel: 'about 4 MB',
  },
  person: {
    id: 'person',
    label: 'Photos of people',
    hint: 'Much better edges around hair, but only for photos of people.',
    downloadLabel: 'about 9 MB',
    extraDownloadLabel: 'about 6 MB',
  },
};

export const DEFAULT_MODEL: ModelChoice = 'anything';

export interface DownloadedAssets {
  /** Null when the engine could not be fetched here and must be loaded the usual way. */
  engine: Uint8Array | null;
  cutter: Uint8Array;
}

/** Cache Storage keys are absolute URLs, so a bare path never matches on read-back. */
function absolute(url: string): string {
  return new URL(url, location.href).href;
}

/** Missing on insecure origins, and throws outright in some private windows. */
async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function isStored(cache: Cache | null, asset: Asset): Promise<boolean> {
  if (!cache) return false;
  try {
    return (await cache.match(asset.url)) !== undefined;
  } catch {
    return false;
  }
}

async function readStored(cache: Cache | null, asset: Asset): Promise<Uint8Array | null> {
  if (!cache) return null;
  try {
    const hit = await cache.match(asset.url);
    if (!hit) return null;
    const bytes = new Uint8Array(await hit.arrayBuffer());
    if (bytes.byteLength === asset.bytes) return bytes;
    await cache.delete(asset.url);
    return null;
  } catch {
    return null;
  }
}

async function store(cache: Cache | null, asset: Asset, bytes: Uint8Array): Promise<void> {
  if (!cache) return;
  try {
    await cache.put(asset.url, new Response(bytes));
  } catch {
    // Storage is full or blocked; the cut-out still works, it just costs again next time.
  }
}

/** Drop anything we no longer ask for — a renamed file would otherwise sit there forever. */
async function prune(cache: Cache | null): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      }
    }
    if (!cache) return;
    const keep = new Set([ENGINE, ...Object.values(CUTTERS)].map((asset) => absolute(asset.url)));
    for (const request of await cache.keys()) {
      if (!keep.has(request.url)) await cache.delete(request);
    }
  } catch {
    // Housekeeping only. Never allowed to fail a cut-out.
  }
}

async function download(
  asset: Asset,
  onChunk: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  // These names carry a content hash and are served immutable, so the browser's
  // own cache is allowed to answer without asking the server first.
  const response = await fetch(asset.url, { signal, cache: 'force-cache' });
  if (!response.ok || !response.body) {
    throw new BackgroundRemoverError(
      'The background remover couldn’t be downloaded. Check your connection and try again.',
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onChunk(value.byteLength);
  }

  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  if (bytes.byteLength !== asset.bytes) {
    throw new BackgroundRemoverError(
      'The background remover only downloaded part-way. Check your connection and try again.',
    );
  }
  return bytes;
}

/** True when this choice is already on the device and costs nothing to use. */
export async function isModelReady(choice: ModelChoice): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  const [engine, cutter] = await Promise.all([
    isStored(cache, ENGINE),
    isStored(cache, CUTTERS[choice]),
  ]);
  return engine && cutter;
}

/**
 * Fetch what this choice needs, reading from Cache Storage where possible.
 *
 * `onProgress` is called with uncompressed byte counts covering only what is
 * actually being fetched, so a returning visitor sees a total of zero rather
 * than a bar that fills instantly.
 */
export async function loadAssets(
  choice: ModelChoice,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<DownloadedAssets> {
  const asset = CUTTERS[choice];
  const cache = await openCache();
  const storedEngine = await readStored(cache, ENGINE);
  const storedCutter = await readStored(cache, asset);

  const total = (storedEngine ? 0 : ENGINE.bytes) + (storedCutter ? 0 : asset.bytes);
  let received = 0;
  const tick = (chunk: number) => {
    received += chunk;
    onProgress(Math.min(received, total), total);
  };
  onProgress(0, total);

  let engine = storedEngine;
  if (!engine) {
    try {
      engine = await download(ENGINE, tick, signal);
      await store(cache, ENGINE, engine);
    } catch (err) {
      if (signal?.aborted) throw err;
      // Not fatal on its own: the engine can still be loaded the ordinary way.
      engine = null;
    }
  }

  const cutter = storedCutter ?? (await download(asset, tick, signal));
  if (!storedCutter) await store(cache, asset, cutter);

  void prune(cache);
  onProgress(total, total);
  return { engine, cutter };
}

/** Give the space back. Everything downloads again the next time it is needed. */
export async function clearDownloads(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
    }
  } catch {
    // Nothing to clear, or storage is blocked.
  }
}
