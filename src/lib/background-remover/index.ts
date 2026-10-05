import { safeFilename } from '@/lib/download';
import { baseName } from '@/lib/format';
import { cutOut, getSession, MAX_SOURCE_PIXELS } from './infer';
import { DEFAULT_MODEL, loadAssets, MODEL_CHOICES } from './model';
import {
  BackgroundRemoverError,
  type RemovalProgressHandler,
  type RemovalResult,
  type RemovalStage,
  type RemoveBackgroundOptions,
} from './types';

export { clearDownloads, DEFAULT_MODEL, isModelReady, MODEL_CHOICES } from './model';
export { MAX_SOURCE_PIXELS, releaseSession } from './infer';
export { BackgroundRemoverError } from './types';
export type {
  ModelChoice,
  ModelChoiceInfo,
  RemovalProgress,
  RemovalProgressHandler,
  RemovalResult,
  RemovalStage,
  RemoveBackgroundOptions,
} from './types';

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isSupportedPhoto(file: File): boolean {
  if (SUPPORTED.has(file.type)) return true;
  // Some file pickers hand over an empty type, so fall back to the name
  return file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
}

async function decode(file: File): Promise<{ bitmap: ImageBitmap; resized: boolean }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new BackgroundRemoverError(
      `“${file.name}” couldn’t be opened as a photo. It may be corrupt, or a kind of image this browser can’t read.`,
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
    const context = canvas.getContext('2d');
    if (!context) throw new BackgroundRemoverError('This browser wouldn’t provide a 2D canvas.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { bitmap: await createImageBitmap(canvas), resized: true };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function removeBackground(
  file: File,
  options: RemoveBackgroundOptions = {},
  onProgress?: RemovalProgressHandler,
): Promise<RemovalResult> {
  const choice = options.model ?? DEFAULT_MODEL;
  const signal = options.signal;
  const started = performance.now();

  const report = (
    stage: RemovalStage,
    ratio: number | null,
    message: string,
    downloadedBytes = 0,
    totalBytes = 0,
  ) => onProgress?.({ stage, ratio, message, downloadedBytes, totalBytes });

  if (!isSupportedPhoto(file)) {
    throw new BackgroundRemoverError('Choose a JPEG, PNG or WebP photo.');
  }
  throwIfAborted(signal);

  report('reading', null, 'Opening your photo…');
  const { bitmap, resized } = await decode(file);

  try {
    const size = MODEL_CHOICES[choice].downloadLabel;
    report('downloading', 0, `Getting the background remover ready — a one-time ${size} download.`);
    const assets = await loadAssets(
      choice,
      (received, total) => {
        if (total === 0) return;
        const ratio = received / total;
        report(
          'downloading',
          ratio,
          `Getting the background remover ready — ${Math.round(ratio * 100)}% of a one-time ${size} download.`,
          received,
          total,
        );
      },
      signal,
    );
    throwIfAborted(signal);

    report('starting', null, 'Starting the background remover…');
    const session = await getSession(choice, assets);
    throwIfAborted(signal);

    report('removing', null, 'Removing the background…');
    const blob = await cutOut(session, choice, bitmap, signal);

    report('saving', 1, 'Your PNG is ready.');
    return {
      blob,
      filename: safeFilename(`${baseName(file.name)} - no background.png`, 'no-background.png'),
      width: bitmap.width,
      height: bitmap.height,
      resized,
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    bitmap.close();
  }
}

export function describeBackgroundError(err: unknown, filename?: string): string {
  if (err instanceof Error && err.name === 'BackgroundRemoverError') return err.message;
  if (err instanceof Error && err.name === 'AbortError') return 'Cancelled.';

  const label = filename ? `“${filename}”` : 'That photo';
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  if (
    name === 'ChunkLoadError' ||
    /loading chunk .*failed|importing a module script failed|dynamically imported module/i.test(
      message,
    )
  ) {
    return 'This page is out of date, so part of the background remover could not load. Reload the page and try again.';
  }
  if (/failed to fetch|networkerror|load failed|err_/i.test(message)) {
    return 'The background remover couldn’t be downloaded. Check your connection and try again.';
  }
  if (/memory|allocation failed|Maximum call stack/i.test(message)) {
    return `${label} is too large for this browser tab to hold in memory. Try a smaller copy.`;
  }

  const detail = message.trim().slice(0, 140);
  return detail
    ? `The background couldn’t be removed from ${label}: ${detail}`
    : `The background couldn’t be removed from ${label}.`;
}
