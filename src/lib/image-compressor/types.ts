/**
 * Shared types for the Image Compressor.
 *
 * Nothing in this directory touches the network. The only "I/O" that happens
 * anywhere in this tool is reading a File the user picked and writing a Blob
 * back out via a download — both entirely inside the browser process.
 */

/** MIME types the canvas encoder can reliably produce. */
export type EncodableType = 'image/jpeg' | 'image/png' | 'image/webp';

/** What the user picked in the "Output format" control. */
export type OutputFormat = 'original' | EncodableType;

/** Resize preset ids. `custom` reads width/height from the settings. */
export type ResizePresetId = 'original' | 'web' | 'social' | 'thumb' | 'custom';

export interface ResizeSettings {
  preset: ResizePresetId;
  /** Only meaningful when `preset === 'custom'`. `null` means "unconstrained". */
  customWidth: number | null;
  customHeight: number | null;
}

export interface CompressSettings {
  /**
   * 10–100, passed to the encoder as 0.1–1.0. JPEG and WebP take it as a lossy
   * quality level; PNG takes it as a colour budget. See `qualityEffect`.
   */
  quality: number;
  resize: ResizeSettings;
  format: OutputFormat;
}

export interface Dimensions {
  width: number;
  height: number;
}

/** Lifecycle of a single image in the batch. */
export type ItemStatus = 'queued' | 'compressing' | 'done' | 'failed';

/** The finished, in-memory result for one image. */
export interface CompressOutcome {
  blob: Blob;
  size: number;
  /** Actual MIME type the encoder produced. */
  type: string;
  /** Suggested download name, extension matched to `type`. */
  filename: string;
  width: number;
  height: number;
}

/** A result plus the object URL its thumbnail is drawn from. */
export interface ItemResult extends CompressOutcome {
  /** Must be revoked when the result is replaced, removed or unmounted. */
  previewUrl: string;
}

/** One image in the batch, as held in component state. */
export interface ImageItem {
  id: string;
  /**
   * The user's ORIGINAL file, kept for the life of the item so that changing
   * the quality always re-compresses from the source rather than from a
   * previous result.
   */
  file: File;
  status: ItemStatus;
  error: string | null;
  /** Pixel size of the source, measured once and reused across re-runs. */
  source: Dimensions | null;
  result: ItemResult | null;
  /** Fingerprint of the settings that produced `result`. */
  appliedKey: string | null;
  /**
   * Id of the batch run currently holding this item. Lets a cancelled run put
   * back only the items it was actually working on.
   */
  runId: number | null;
}

/** An item known to have finished successfully. */
export type ReadyItem = ImageItem & { result: ItemResult };
