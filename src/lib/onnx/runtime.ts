import type { InferenceSession } from 'onnxruntime-web';

type OrtModule = typeof import('onnxruntime-web');

let ort: OrtModule | null = null;
const held = new Map<string, InferenceSession>();

export async function loadOrt(): Promise<OrtModule> {
  if (ort) return ort;
  // The /wasm subpath only: the bare package drags in the WebGPU build for nothing.
  const loaded = await import('onnxruntime-web/wasm');
  loaded.env.wasm.wasmPaths = '/ort/';
  // A static export can't be cross-origin isolated, so one thread is the only option.
  loaded.env.wasm.numThreads = 1;
  ort = loaded;
  return loaded;
}

/** Hands back the session already running under `key`; each one pins its weights until released. */
export async function getSession(
  key: string,
  model: Uint8Array,
  engine?: Uint8Array,
): Promise<InferenceSession> {
  const existing = held.get(key);
  if (existing) return existing;

  const runtime = await loadOrt();
  if (engine) runtime.env.wasm.wasmBinary = engine;
  try {
    const session = await runtime.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    held.set(key, session);
    return session;
  } finally {
    // Only read once, and holding it would pin 14 MB for the life of the page.
    runtime.env.wasm.wasmBinary = undefined;
  }
}

export async function releaseSessions(keep: readonly string[] = []): Promise<void> {
  const kept = new Set(keep);
  for (const [key, session] of [...held]) {
    if (kept.has(key)) continue;
    held.delete(key);
    try {
      await session.release();
    } catch {
      // Already gone; nothing useful to do about it.
    }
  }
}
