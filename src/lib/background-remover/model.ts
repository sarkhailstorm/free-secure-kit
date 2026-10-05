import { areAssetsReady, loadAssets as loadCached, type AssetId } from '@/lib/assets';
import { BackgroundRemoverError, type ModelChoice, type ModelChoiceInfo } from './types';

export { clearDownloads } from '@/lib/assets';

const CUTTERS: Record<ModelChoice, AssetId> = {
  anything: 'u2netp',
  person: 'modnet',
};

export const MODEL_CHOICES: Record<ModelChoice, ModelChoiceInfo> = {
  anything: {
    id: 'anything',
    label: 'Anything',
    hint: 'Works on people, products, pets and objects.',
    downloadLabel: 'about 7 MB',
    extraDownloadLabel: 'about 4 MB',
  },
  person: {
    id: 'person',
    label: 'Photos of people',
    hint: 'Much better edges around hair, but only for photos of people.',
    downloadLabel: 'about 9 MB',
    extraDownloadLabel: 'about 6 MB',
  },
};

export const DEFAULT_MODEL: ModelChoice = 'anything';

export interface DownloadedAssets {
  // Null when the engine could not be fetched here and must be loaded the usual way
  engine: Uint8Array | null;
  cutter: Uint8Array;
}

export async function isModelReady(choice: ModelChoice): Promise<boolean> {
  return areAssetsReady(['engine', CUTTERS[choice]]);
}

export async function loadAssets(
  choice: ModelChoice,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<DownloadedAssets> {
  const id = CUTTERS[choice];
  const loaded = await loadCached(['engine', id], onProgress, signal);
  const cutter = loaded[id];
  if (!cutter) {
    throw new BackgroundRemoverError(
      'The background remover couldn’t be downloaded. Check your connection and try again.',
    );
  }
  return { engine: loaded.engine ?? null, cutter };
}
