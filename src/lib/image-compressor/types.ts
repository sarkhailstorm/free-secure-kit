export type EncodableType = 'image/jpeg' | 'image/png' | 'image/webp';

export type OutputFormat = 'original' | EncodableType;

export type ResizePresetId = 'original' | 'web' | 'social' | 'thumb' | 'custom';

export interface ResizeSettings {
  preset: ResizePresetId;
  // Only read when preset is 'custom'; null means unconstrained
  customWidth: number | null;
  customHeight: number | null;
}

export interface CompressSettings {
  // 10–100, passed to the encoder as 0.1–1.0
  quality: number;
  resize: ResizeSettings;
  format: OutputFormat;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type ItemStatus = 'queued' | 'compressing' | 'done' | 'failed';

export interface CompressOutcome {
  blob: Blob;
  size: number;
  // What the encoder actually produced, which may differ from the type asked for
  type: string;
  filename: string;
  width: number;
  height: number;
}

export interface ItemResult extends CompressOutcome {
  // Must be revoked when the result is replaced, removed or unmounted
  previewUrl: string;
}

export interface ImageItem {
  id: string;
  // The original, kept so every re-run compresses from the source
  file: File;
  status: ItemStatus;
  error: string | null;
  source: Dimensions | null;
  result: ItemResult | null;
  // Fingerprint of the settings that produced `result`
  appliedKey: string | null;
  // Batch run that owns this item, so a cancelled run releases only its own
  runId: number | null;
}

export type ReadyItem = ImageItem & { result: ItemResult };
