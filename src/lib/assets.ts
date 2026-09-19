export type AssetId = 'engine' | 'modnet' | 'u2netp' | 'yunet' | 'qpdf';

/** The message is already fit to show the user. */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

// Renaming these would make every existing visitor download everything again.
const CACHE_NAME = 'securekit-background-remover-v1';
const CACHE_PREFIX = 'securekit-background-remover-';

export interface Asset {
  url: string;
  /** Exact uncompressed length, used to verify the download and size the bar. */
  bytes: number;
}

/** Every big file this site serves; `prune` deletes any cached copy not listed here. */
export const ASSETS: Record<AssetId, Asset> = {
  engine: { url: '/ort/ort-wasm-simd-threaded.wasm', bytes: 14_239_897 },
  modnet: { url: '/models/modnet-7bad6522.onnx', bytes: 6_627_048 },
  u2netp: { url: '/models/u2netp-309c8469.onnx', bytes: 4_574_861 },
  yunet: { url: '/models/yunet-8f2383e4.onnx', bytes: 232_589 },
  // Kept in step with scripts/copy-qpdf.mjs, which checks the hash in the name.
  qpdf: { url: '/qpdf/qpdf-cbd81a24.wasm', bytes: 1_274_647 },
};

/** The engine alone can be loaded the ordinary way, so failing to fetch it here is survivable. */
const OPTIONAL: ReadonlySet<AssetId> = new Set<AssetId>(['engine']);

export type LoadedAssets = Partial<Record<AssetId, Uint8Array>>;

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
    // Storage is full or blocked; the tool still works, it just costs again next time.
  }
}

async function prune(cache: Cache | null): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      }
    }
    if (!cache) return;
    const keep = new Set(Object.values(ASSETS).map((asset) => absolute(asset.url)));
    for (const request of await cache.keys()) {
      if (!keep.has(request.url)) await cache.delete(request);
    }
  } catch {
    // Housekeeping only. Never allowed to fail a job.
  }
}

async function download(
  asset: Asset,
  onChunk: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  // These names carry a content hash and are served immutable, so force-cache is safe.
  const response = await fetch(asset.url, { signal, cache: 'force-cache' });
  if (!response.ok || !response.body) {
    throw new DownloadError(
      'That could not be downloaded. Check your connection and try again.',
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
    throw new DownloadError(
      'That only downloaded part-way. Check your connection and try again.',
    );
  }
  return bytes;
}

export async function areAssetsReady(ids: readonly AssetId[]): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  const present = await Promise.all(ids.map((id) => isStored(cache, ASSETS[id])));
  return present.every(Boolean);
}

/** Uncompressed bytes still to fetch — zero when everything is already here. */
export async function bytesOutstanding(ids: readonly AssetId[]): Promise<number> {
  const cache = await openCache();
  let total = 0;
  for (const id of ids) {
    if (!(await isStored(cache, ASSETS[id]))) total += ASSETS[id].bytes;
  }
  return total;
}

/** `onProgress` counts only what is actually fetched, so a returning visitor gets a total of zero. */
export async function loadAssets(
  ids: readonly AssetId[],
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<LoadedAssets> {
  const cache = await openCache();
  const stored = new Map<AssetId, Uint8Array | null>();
  for (const id of ids) stored.set(id, await readStored(cache, ASSETS[id]));

  let total = 0;
  for (const id of ids) if (!stored.get(id)) total += ASSETS[id].bytes;

  let received = 0;
  const tick = (chunk: number) => {
    received += chunk;
    onProgress(Math.min(received, total), total);
  };
  onProgress(0, total);

  const loaded: LoadedAssets = {};
  for (const id of ids) {
    const already = stored.get(id);
    if (already) {
      loaded[id] = already;
      continue;
    }
    try {
      const bytes = await download(ASSETS[id], tick, signal);
      await store(cache, ASSETS[id], bytes);
      loaded[id] = bytes;
    } catch (err) {
      if (signal?.aborted || !OPTIONAL.has(id)) throw err;
    }
  }

  void prune(cache);
  onProgress(total, total);
  return loaded;
}

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
