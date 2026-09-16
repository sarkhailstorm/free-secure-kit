/**
 * Shared types for the Background Remover.
 *
 * Everything happens in the browser. The one thing this tool fetches is its
 * own cut-out engine, from this site's own origin, and only after the user
 * has asked for a cut-out — never on page load.
 */

/** Which kind of cut-out the user asked for. */
export type ModelChoice = 'person' | 'anything';

export interface ModelChoiceInfo {
  id: ModelChoice;
  label: string;
  hint: string;
  /** Honest one-time transfer, engine included, e.g. "about 7 MB". */
  downloadLabel: string;
  /** Smaller figure to quote when the engine is already here and only this choice is new. */
  extraDownloadLabel: string;
}

export type RemovalStage = 'reading' | 'downloading' | 'starting' | 'removing' | 'saving';

export interface RemovalProgress {
  stage: RemovalStage;
  /** 0–1 where it can be measured, otherwise null. */
  ratio: number | null;
  /** Ready to show as-is. */
  message: string;
  /** Uncompressed, and only useful for driving a bar — show `message` instead. */
  downloadedBytes: number;
  totalBytes: number;
}

export type RemovalProgressHandler = (progress: RemovalProgress) => void;

export interface RemoveBackgroundOptions {
  model?: ModelChoice;
  signal?: AbortSignal;
}

export interface RemovalResult {
  /** PNG with a transparent background. */
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  /** True when the photo was scaled down to stay inside the pixel cap. */
  resized: boolean;
  elapsedMs: number;
}

/** An error we raised ourselves, whose message is already fit to show. */
export class BackgroundRemoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundRemoverError';
  }
}
