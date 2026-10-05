import type { InferenceSession } from 'onnxruntime-web';
import { getSession as openSession, loadOrt, releaseSessions } from '@/lib/onnx/runtime';
import type { DownloadedAssets } from './model';
import { BackgroundRemoverError, type ModelChoice } from './types';

// iOS caps total canvas area and hands back a blank canvas rather than throwing
export const MAX_SOURCE_PIXELS = 16_777_216;

// MODNet wants the shorter side at 512 and both sides a multiple of 32
const PERSON_SHORT_EDGE = 512;
const PERSON_MAX_EDGE = 1024;
const ANYTHING_EDGE = 320;

const ANYTHING_MEAN = [0.485, 0.456, 0.406];
const ANYTHING_STD = [0.229, 0.224, 0.225];

// All-white pixels, with the coverage in the alpha channel
export interface Stencil {
  image: ImageData;
  width: number;
  height: number;
}

// Only one cutter stays alive at a time; each holds several megabytes
export async function getSession(
  choice: ModelChoice,
  assets: DownloadedAssets,
): Promise<InferenceSession> {
  const key = `cutter:${choice}`;
  await releaseSessions([key]);
  return openSession(key, assets.cutter, assets.engine ?? undefined);
}

export async function releaseSession(): Promise<void> {
  await releaseSessions();
}

function floorTo32(value: number): number {
  return Math.max(32, Math.floor(value / 32) * 32);
}

function workingSize(choice: ModelChoice, width: number, height: number) {
  if (choice === 'anything') return { width: ANYTHING_EDGE, height: ANYTHING_EDGE };

  const scale = PERSON_SHORT_EDGE / Math.min(width, height);
  let w = Math.round(width * scale);
  let h = Math.round(height * scale);
  const longest = Math.max(w, h);
  if (longest > PERSON_MAX_EDGE) {
    const shrink = PERSON_MAX_EDGE / longest;
    w = Math.round(w * shrink);
    h = Math.round(h * shrink);
  }
  return { width: floorTo32(w), height: floorTo32(h) };
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new BackgroundRemoverError('This browser wouldn’t provide a 2D canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

function toInput(pixels: Uint8ClampedArray, count: number, choice: ModelChoice): Float32Array {
  const data = new Float32Array(3 * count);
  const green = count;
  const blue = count * 2;

  if (choice === 'person') {
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      data[i] = pixels[p] / 127.5 - 1;
      data[green + i] = pixels[p + 1] / 127.5 - 1;
      data[blue + i] = pixels[p + 2] / 127.5 - 1;
    }
    return data;
  }

  for (let i = 0; i < count; i++) {
    const p = i * 4;
    data[i] = (pixels[p] / 255 - ANYTHING_MEAN[0]) / ANYTHING_STD[0];
    data[green + i] = (pixels[p + 1] / 255 - ANYTHING_MEAN[1]) / ANYTHING_STD[1];
    data[blue + i] = (pixels[p + 2] / 255 - ANYTHING_MEAN[2]) / ANYTHING_STD[2];
  }
  return data;
}

function toStencil(
  raw: Float32Array,
  width: number,
  height: number,
  choice: ModelChoice,
): ImageData {
  let low = 0;
  let high = 1;
  if (choice === 'anything') {
    low = Number.POSITIVE_INFINITY;
    high = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] < low) low = raw[i];
      if (raw[i] > high) high = raw[i];
    }
    if (!(high > low)) {
      low = 0;
      high = 1;
    }
  }

  const span = high - low;
  const stencil = new ImageData(width, height);
  const out = stencil.data;
  for (let i = 0; i < raw.length; i++) {
    const value = (raw[i] - low) / span;
    const p = i * 4;
    out[p] = 255;
    out[p + 1] = 255;
    out[p + 2] = 255;
    out[p + 3] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
  }
  return stencil;
}

function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
}

// The stencil comes back at the size the network saw, not the source's size
export async function segment(
  session: InferenceSession,
  choice: ModelChoice,
  source: ImageBitmap,
  signal?: AbortSignal,
): Promise<Stencil> {
  const size = workingSize(choice, source.width, source.height);
  const small = document.createElement('canvas');

  try {
    small.width = size.width;
    small.height = size.height;
    const shrunk = context2d(small);
    shrunk.drawImage(source, 0, 0, size.width, size.height);
    const pixels = shrunk.getImageData(0, 0, size.width, size.height).data;
    const input = toInput(pixels, size.width * size.height, choice);
    throwIfAborted(signal);

    const runtime = await loadOrt();
    const results = await session.run({
      [session.inputNames[0]]: new runtime.Tensor('float32', input, [
        1,
        3,
        size.height,
        size.width,
      ]),
    });
    throwIfAborted(signal);

    // Both models put the full-size result first; the rest are coarser drafts
    const raw = results[session.outputNames[0]]?.data;
    if (!(raw instanceof Float32Array) || raw.length !== size.width * size.height) {
      throw new BackgroundRemoverError('The background remover returned something unreadable.');
    }

    return {
      image: toStencil(raw, size.width, size.height, choice),
      width: size.width,
      height: size.height,
    };
  } finally {
    release(small);
  }
}

export async function cutOut(
  session: InferenceSession,
  choice: ModelChoice,
  source: ImageBitmap,
  signal?: AbortSignal,
): Promise<Blob> {
  const mask = await segment(session, choice, source, signal);
  const stencil = document.createElement('canvas');
  const full = document.createElement('canvas');

  try {
    stencil.width = mask.width;
    stencil.height = mask.height;
    context2d(stencil).putImageData(mask.image, 0, 0);

    full.width = source.width;
    full.height = source.height;
    const out = context2d(full);
    out.drawImage(source, 0, 0);
    out.globalCompositeOperation = 'destination-in';
    out.drawImage(stencil, 0, 0, source.width, source.height);
    out.globalCompositeOperation = 'source-over';

    const blob = await new Promise<Blob | null>((resolve) => {
      full.toBlob(resolve, 'image/png');
    });
    if (!blob) throw new BackgroundRemoverError('The cut-out couldn’t be saved as a PNG.');
    return blob;
  } finally {
    release(stencil);
    release(full);
  }
}
