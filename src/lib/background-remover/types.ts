export type ModelChoice = 'person' | 'anything';

export interface ModelChoiceInfo {
  id: ModelChoice;
  label: string;
  hint: string;
  // One-time transfer with the engine included, e.g. "about 7 MB"
  downloadLabel: string;
  // Quoted instead when the engine is already cached and only this choice is new
  extraDownloadLabel: string;
}

export type RemovalStage = 'reading' | 'downloading' | 'starting' | 'removing' | 'saving';

export interface RemovalProgress {
  stage: RemovalStage;
  // 0–1 where it can be measured, otherwise null
  ratio: number | null;
  message: string;
  // Uncompressed bytes; show `message` to the user rather than these
  downloadedBytes: number;
  totalBytes: number;
}

export type RemovalProgressHandler = (progress: RemovalProgress) => void;

export interface RemoveBackgroundOptions {
  model?: ModelChoice;
  signal?: AbortSignal;
}

export interface RemovalResult {
  // PNG with a transparent background
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  resized: boolean;
  elapsedMs: number;
}

// Message is already fit to show the user
export class BackgroundRemoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundRemoverError';
  }
}
