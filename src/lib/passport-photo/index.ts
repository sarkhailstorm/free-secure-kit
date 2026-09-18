import { MAX_SOURCE_PIXELS, segment } from '@/lib/background-remover/infer';
import { bytesOutstanding, loadAssets } from '@/lib/onnx/assets';
import { getSession, releaseSessions } from '@/lib/onnx/runtime';
import type { AssetId } from '@/lib/onnx/types';
import { detectFaces } from './detect';
import { backgroundSpread, measure, toMask } from './measure';
import {
  PassportPhotoError,
  type Analysis,
  type MaskData,
  type ProgressHandler,
  type ProgressStage,
} from './types';

export { detectFaces, eyeLine, turn } from './detect';
export { drawPhoto, guideOverlay, renderPhoto } from './compose';
export {
  eyesInRange,
  headInRange,
  overhang,
  planLayout,
  preferredEyeMm,
  preferredHeadMm,
  pxPerMm,
  type LayoutOptions,
} from './layout';
export { backgroundSpread, findCrown, measure, toMask } from './measure';
export { runChecks, worstSeverity, type CheckInput } from './checks';
export { renderSheet, sheetCapacity, type SheetOptions, type SheetResult } from './sheet';
export {
  DEFAULT_SHEET,
  DEFAULT_SPEC,
  getSpec,
  SHEETS,
  sizeLabel,
  SPEC_ORDER,
  SPECS,
} from './specs';
export { clearDownloads } from '@/lib/onnx/assets';
export { PassportPhotoError } from './types';
export type * from './types';

/** Everything this tool needs on the device before it can look at a photo. */
const NEEDED: readonly AssetId[] = ['engine', 'yunet', 'modnet'];

const CUTTER_KEY = 'cutter:person';
const FACE_KEY = 'face:yunet';

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isSupportedPhoto(file: File): boolean {
  if (SUPPORTED.has(file.type)) return true;
  // Some file pickers hand over an empty type; fall back to the name.
  return file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name);
}

/** True when nothing needs downloading and picking a photo is instant. */
export async function isReady(): Promise<boolean> {
  return (await bytesOutstanding(NEEDED)) === 0;
}

/** "about 9 MB", or null when there is nothing left to fetch. */
export async function downloadSize(): Promise<string | null> {
  const bytes = await bytesOutstanding(NEEDED);
  if (bytes === 0) return null;
  // Everything is served compressed, and these compress to roughly 45%.
  return `about ${Math.max(1, Math.round((bytes * 0.45) / 1_000_000))} MB`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new PassportPhotoError('This browser wouldn’t provide a 2D canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

async function decode(file: File): Promise<{ bitmap: ImageBitmap; resized: boolean }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PassportPhotoError(
      `“${file.name}” couldn’t be opened as a photo. It may be damaged, or a kind of image this browser can’t read.`,
    );
  }

  const pixels = bitmap.width * bitmap.height;
  if (pixels <= MAX_SOURCE_PIXELS) return { bitmap, resized: false };

  const scale = Math.sqrt(MAX_SOURCE_PIXELS / pixels);
  const width = Math.max(1, Math.floor(bitmap.width * scale));
  const height = Math.max(1, Math.floor(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  try {
    canvas.width = width;
    canvas.height = height;
    context2d(canvas).drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { bitmap: await createImageBitmap(canvas), resized: true };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * A small copy of the photo, for judging the background.
 *
 * The full photo can be 16 megapixels, and holding a second copy of that as
 * raw bytes is 64 MB for a question that a thumbnail answers just as well.
 */
function smallCopy(bitmap: ImageBitmap): ImageData {
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  try {
    canvas.width = width;
    canvas.height = height;
    const context = context2d(canvas);
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Look at one photo: find the face, cut the person out, and measure the head.
 *
 * The models are fetched on the first call and never again. Nothing leaves the
 * device at any point — the only request made is for the tool's own files, from
 * this site.
 */
export async function analysePhoto(
  file: File,
  signal?: AbortSignal,
  onProgress?: ProgressHandler,
): Promise<Analysis> {
  const report = (stage: ProgressStage, ratio: number | null, message: string) =>
    onProgress?.({ stage, ratio, message });

  if (!isSupportedPhoto(file)) {
    throw new PassportPhotoError('Choose a JPEG, PNG or WebP photo.');
  }
  throwIfAborted(signal);

  report('reading', null, 'Opening your photo…');
  const { bitmap, resized } = await decode(file);

  try {
    const size = (await downloadSize()) ?? '';
    report(
      'downloading',
      0,
      size ? `Getting ready — a one-time ${size} download.` : 'Getting ready…',
    );
    const assets = await loadAssets(
      NEEDED,
      (received, total) => {
        if (total === 0) return;
        const ratio = received / total;
        report(
          'downloading',
          ratio,
          `Getting ready — ${Math.round(ratio * 100)}% of a one-time ${size} download.`,
        );
      },
      signal,
    );
    throwIfAborted(signal);

    if (!assets.yunet || !assets.modnet) {
      throw new PassportPhotoError(
        'The photo checker couldn’t be downloaded. Check your connection and try again.',
      );
    }

    report('starting', null, 'Starting the photo checker…');
    // Both stay open together: the face finder answers where the eyes are and
    // the cutter answers where the hair ends, and a crop needs both.
    await releaseSessions([CUTTER_KEY, FACE_KEY]);
    const faceSession = await getSession(FACE_KEY, assets.yunet, assets.engine);
    const cutterSession = await getSession(CUTTER_KEY, assets.modnet);
    throwIfAborted(signal);

    report('measuring', null, 'Finding your face…');
    const faces = await detectFaces(faceSession, bitmap, signal);
    throwIfAborted(signal);

    report('measuring', null, 'Measuring your head…');
    let mask: MaskData | null = null;
    try {
      mask = toMask(await segment(cutterSession, 'person', bitmap, signal));
    } catch (err) {
      if (signal?.aborted) throw err;
      // Without a cut-out the crown is a guess rather than a measurement, which
      // the editor says out loud. It is not worth failing the whole photo over.
    }
    throwIfAborted(signal);

    const background = mask ? backgroundSpread(smallCopy(bitmap), mask) : null;

    report('saving', 1, 'Ready.');
    return {
      bitmap,
      faces,
      measurements: measure(bitmap.width, bitmap.height, faces[0] ?? null, mask),
      mask,
      background: background ? { spread: background.spread, colour: background.colour } : null,
      fileBytes: file.size,
      resized,
    };
  } catch (err) {
    bitmap.close();
    throw err;
  }
}

/** Let the models go. Everything downloads again only if the cache was cleared. */
export async function release(): Promise<void> {
  await releaseSessions();
}

/** Turn whatever was thrown into one sentence a person can act on. */
export function describePassportError(err: unknown, filename?: string): string {
  if (err instanceof Error && err.name === 'PassportPhotoError') return err.message;
  if (err instanceof Error && err.name === 'ModelDownloadError') return err.message;
  if (err instanceof Error && err.name === 'AbortError') return 'Cancelled.';

  const label = filename ? `“${filename}”` : 'That photo';
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  // A tab left open across a new deploy asks for chunks that no longer exist.
  if (
    name === 'ChunkLoadError' ||
    /loading chunk .*failed|importing a module script failed|dynamically imported module/i.test(
      message,
    )
  ) {
    return 'This page is out of date, so part of the tool could not load. Reload the page and try again.';
  }
  if (/failed to fetch|networkerror|load failed|err_/i.test(message)) {
    return 'The tool couldn’t be downloaded. Check your connection and try again.';
  }
  if (/memory|allocation failed|Maximum call stack/i.test(message)) {
    return `${label} is too large for this browser tab to hold in memory. Try a smaller copy.`;
  }

  const detail = message.trim().slice(0, 140);
  return detail ? `${label} couldn’t be checked: ${detail}` : `${label} couldn’t be checked.`;
}
