/**
 * Shared types for Passport Photos.
 *
 * Every length a document authority publishes is in millimetres, so that is the
 * unit here too. Pixels only appear where something is measured on the photo
 * the user picked, and those are always source pixels.
 */

export type SpecId =
  | 'uk-passport'
  | 'uk-driving-licence'
  | 'us-passport'
  | 'schengen-visa'
  | 'ireland-passport'
  | 'australia-passport'
  | 'canada-passport'
  | 'india-passport'
  | 'india-oci'
  | 'icao-35x45'
  | 'icao-51x51'
  | 'custom';

/** What the authority says about the background. */
export interface BackgroundRule {
  /** Shown to the user, e.g. "Plain light grey or cream". */
  label: string;
  /** Swatches that satisfy the rule, lightest first. */
  swatches: readonly string[];
}

/** What a digital copy has to be, where the authority accepts one. */
export interface DigitalRule {
  minPx: number;
  maxPx?: number;
  minBytes?: number;
  maxBytes?: number;
}

export interface PhotoSpec {
  id: SpecId;
  /** Grouping in the picker. */
  country: string;
  /** Shown in the picker, e.g. "Passport". */
  document: string;
  widthMm: number;
  heightMm: number;
  /** Chin to the top of the head, hair included. */
  headMinMm: number;
  headMaxMm: number;
  /** Eye line measured up from the bottom edge. Not every authority states one. */
  eyeMinMm?: number;
  eyeMaxMm?: number;
  background: BackgroundRule;
  digital?: DigitalRule;
  /** Dots per inch for a print at the size above. */
  dpi: number;
  /** The page these numbers were taken from. */
  source: string;
  /** Things the numbers do not say but a person needs to know. */
  notes?: readonly string[];
}

/** Where a face is in the photo the user picked. All in source pixels. */
export interface FaceDetection {
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Subject's right eye, left eye, nose tip, right mouth corner, left mouth corner. */
  points: readonly (readonly [number, number])[];
}

/** How a number was arrived at. */
export type Origin = 'detected' | 'estimated' | 'manual';

/**
 * The four numbers a passport crop needs, in source pixels.
 *
 * `crownY` is the top of the head including hair, which is what every authority
 * measures to — not the top of the forehead.
 */
export interface Measurements {
  crownY: number;
  chinY: number;
  eyeY: number;
  centreX: number;
  origin: Origin;
}

/** A rectangle of the source photo, which may run outside it. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A crop worked out from a spec and a set of measurements. */
export interface Layout {
  crop: Crop;
  /** Output size in pixels at the spec's dpi. */
  outputWidth: number;
  outputHeight: number;
  /** The chin-to-crown height this layout achieves. */
  headMm: number;
  /** Gap from the top edge down to the crown. */
  crownMm: number;
  /** Eye line above the bottom edge. */
  eyeMm: number;
  /** Source pixels per output pixel. Above 1 means the photo is being shrunk. */
  sourcePerOutput: number;
}

export type Severity = 'blocker' | 'warning' | 'note';

export type CheckId =
  | 'no-face'
  | 'many-faces'
  | 'not-enough-photo'
  | 'too-few-pixels'
  | 'head-tilted'
  | 'looking-away'
  | 'busy-background'
  | 'background-not-plain'
  | 'file-too-large'
  | 'file-too-small'
  | 'edited-photo';

export interface Check {
  id: CheckId;
  severity: Severity;
  /** One sentence, already fit to show. */
  message: string;
  /** What to do about it, where there is something to do. */
  fix?: string;
}

/** What the tool learned about the photo before any crop was chosen. */
export interface Analysis {
  bitmap: ImageBitmap;
  /** Every face found, best score first. */
  faces: readonly FaceDetection[];
  measurements: Measurements;
  /** Alpha coverage of the person, at the size the cutter worked at. */
  mask: MaskData | null;
  background: { spread: number; colour: readonly [number, number, number] } | null;
  fileBytes: number;
  /** True when the photo was scaled down to stay inside the pixel cap. */
  resized: boolean;
}

export interface MaskData {
  /** One byte per pixel: 0 is background, 255 is person. */
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
}

export type BackgroundChoice = { kind: 'keep' } | { kind: 'colour'; colour: string };

export interface RenderOptions {
  spec: PhotoSpec;
  layout: Layout;
  background: BackgroundChoice;
  format: 'image/jpeg' | 'image/png';
  /** JPEG only. */
  quality: number;
}

export interface RenderedPhoto {
  blob: Blob;
  width: number;
  height: number;
  filename: string;
}

/** A sheet of prints, for a shop that prints photos but not passport photos. */
export interface SheetSpec {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  /** Shown in the picker so a person can pick what their shop offers. */
  hint: string;
}

export type ProgressStage = 'reading' | 'downloading' | 'starting' | 'measuring' | 'saving';

export interface AnalysisProgress {
  stage: ProgressStage;
  ratio: number | null;
  message: string;
}

export type ProgressHandler = (progress: AnalysisProgress) => void;

/** An error we raised ourselves, whose message is already fit to show. */
export class PassportPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassportPhotoError';
  }
}
