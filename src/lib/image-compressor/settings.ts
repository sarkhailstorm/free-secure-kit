import { baseName, extension } from '@/lib/format';
import { safeFilename } from '@/lib/download';
import type {
  CompressSettings,
  Dimensions,
  EncodableType,
  OutputFormat,
  ResizePresetId,
  ResizeSettings,
} from './types';

const ENCODABLE: readonly EncodableType[] = ['image/jpeg', 'image/png', 'image/webp'];

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const LABEL_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/avif': 'AVIF',
  'image/tiff': 'TIFF',
};

export const FORMAT_OPTIONS: readonly { id: OutputFormat; label: string }[] = [
  { id: 'original', label: 'Keep original' },
  { id: 'image/jpeg', label: 'JPEG' },
  { id: 'image/png', label: 'PNG' },
  { id: 'image/webp', label: 'WebP' },
];

export function formatLabel(mime: string): string {
  return LABEL_BY_TYPE[mime] ?? (mime.split('/')[1] ?? mime).toUpperCase();
}

// "Keep original" falls back to PNG when the source is a type the canvas can't write
export function resolveOutputType(sourceType: string, format: OutputFormat): EncodableType {
  if (format !== 'original') return format;
  const match = ENCODABLE.find((t) => t === sourceType);
  return match ?? 'image/png';
}

export function outputFilename(originalName: string, type: string): string {
  const ext = EXTENSION_BY_TYPE[type] ?? 'img';
  return safeFilename(`${baseName(originalName)}.${ext}`, `image.${ext}`);
}

// PNG has no lossy mode: the encoder spends quality as a colour budget, not detail
export function qualityEffect(type: string): 'detail' | 'colours' {
  return type === 'image/png' ? 'colours' : 'detail';
}

export interface ResizePreset {
  id: ResizePresetId;
  label: string;
  // Longest-edge cap in pixels; null when the preset has no fixed cap
  max: number | null;
  detail: string;
}

export const RESIZE_PRESETS: readonly ResizePreset[] = [
  { id: 'original', label: 'Original', max: null, detail: 'No resizing' },
  { id: 'web', label: 'Web', max: 1920, detail: '1920 px' },
  { id: 'social', label: 'Social', max: 1080, detail: '1080 px' },
  { id: 'thumb', label: 'Thumbnail', max: 300, detail: '300 px' },
  { id: 'custom', label: 'Custom', max: null, detail: 'Your size' },
];

export function parsePixelInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), 20000);
}

// Longest-edge cap in the source's own pixels; undefined means leave the size alone
export function resolveMaxDimension(
  source: Dimensions,
  resize: ResizeSettings,
): number | undefined {
  const longest = Math.max(source.width, source.height);
  if (longest <= 0) return undefined;

  if (resize.preset === 'custom') {
    let scale = 1;
    if (resize.customWidth && source.width > 0) {
      scale = Math.min(scale, resize.customWidth / source.width);
    }
    if (resize.customHeight && source.height > 0) {
      scale = Math.min(scale, resize.customHeight / source.height);
    }
    if (scale >= 1) return undefined;
    return Math.max(1, Math.round(longest * scale));
  }

  const preset = RESIZE_PRESETS.find((p) => p.id === resize.preset);
  if (!preset?.max) return undefined;
  return longest > preset.max ? preset.max : undefined;
}

export function describeResize(resize: ResizeSettings): string {
  if (resize.preset === 'custom') {
    const { customWidth: w, customHeight: h } = resize;
    if (w && h) return `Fits inside ${w} × ${h} px`;
    if (w) return `Max width ${w} px`;
    if (h) return `Max height ${h} px`;
    return 'No size set — images keep their original size';
  }
  const preset = RESIZE_PRESETS.find((p) => p.id === resize.preset);
  if (!preset?.max) return 'Images keep their original pixel size';
  return `Longest edge capped at ${preset.max} px`;
}

export function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    if (!taken.has(name.toLowerCase())) {
      taken.add(name.toLowerCase());
      return name;
    }
    const stem = baseName(name);
    const ext = extension(name);
    let n = 2;
    let candidate = ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`;
    while (taken.has(candidate.toLowerCase())) {
      n += 1;
      candidate = ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

export function settingsKey(settings: CompressSettings): string {
  const { quality, format, resize } = settings;
  const custom = resize.preset === 'custom' ? `${resize.customWidth ?? ''}x${resize.customHeight ?? ''}` : '';
  return `${quality}|${format}|${resize.preset}|${custom}`;
}

export const DEFAULT_SETTINGS: CompressSettings = {
  quality: 75,
  resize: { preset: 'original', customWidth: null, customHeight: null },
  format: 'original',
};
