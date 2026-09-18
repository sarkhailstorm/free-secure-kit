/** A model file this site serves from its own origin. */
export type AssetId = 'engine' | 'modnet' | 'u2netp' | 'yunet';

/** A model could not be fetched. The message is already fit to show. */
export class ModelDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelDownloadError';
  }
}
