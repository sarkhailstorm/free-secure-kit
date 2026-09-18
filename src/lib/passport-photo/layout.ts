import type { Crop, Layout, Measurements, PhotoSpec } from './types';

/**
 * Turning four measurements into a crop.
 *
 * Authorities measure two things: how tall the head is, chin to the top of the
 * hair, and — some of them — how far the eyes sit above the bottom edge. Both
 * are millimetre rules on the finished photo, so the crop is worked out in
 * millimetres and converted to source pixels at the end.
 */

/** Where the crown sits when the authority says nothing about the eyes. */
const CROWN_SHARE = 0.3;

export interface LayoutOptions {
  /** Chin-to-crown height to aim for. Clamped to what the spec allows. */
  headMm?: number;
  /** Move the subject within the frame. Positive is right and down, in mm. */
  offsetXMm?: number;
  offsetYMm?: number;
}

export function pxPerMm(dpi: number): number {
  return dpi / 25.4;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** The middle of the allowed band, which is the safest place to sit. */
export function preferredHeadMm(spec: PhotoSpec): number {
  return (spec.headMinMm + spec.headMaxMm) / 2;
}

/** The middle of the allowed eye band, or null when the spec sets none. */
export function preferredEyeMm(spec: PhotoSpec): number | null {
  if (spec.eyeMinMm == null || spec.eyeMaxMm == null) return null;
  return (spec.eyeMinMm + spec.eyeMaxMm) / 2;
}

/**
 * Work out which rectangle of the source photo becomes the finished photo.
 *
 * The rectangle is allowed to fall outside the source: that is how the tool
 * knows to tell someone their photo is cropped too tightly to use, rather than
 * quietly shrinking the head to make it fit.
 */
export function planLayout(
  spec: PhotoSpec,
  measurements: Measurements,
  options: LayoutOptions = {},
): Layout {
  const headPx = Math.max(1, measurements.chinY - measurements.crownY);
  const headMm = clamp(options.headMm ?? preferredHeadMm(spec), spec.headMinMm, spec.headMaxMm);

  const mmPerPx = headMm / headPx;
  const cropWidth = spec.widthMm / mmPerPx;
  const cropHeight = spec.heightMm / mmPerPx;

  const eyeFromChinMm = (measurements.chinY - measurements.eyeY) * mmPerPx;
  const eyeTarget = preferredEyeMm(spec);

  let crownMm: number;
  if (eyeTarget != null) {
    // Solve for the crown from where the eyes have to land, using this person's
    // own eye-within-head proportion rather than an assumed one.
    const chinFromBottomMm = eyeTarget - eyeFromChinMm;
    crownMm = spec.heightMm - chinFromBottomMm - headMm;
  } else {
    crownMm = (spec.heightMm - headMm) * CROWN_SHARE;
  }
  crownMm = clamp(crownMm, 0, Math.max(0, spec.heightMm - headMm));

  const offsetX = (options.offsetXMm ?? 0) / mmPerPx;
  const offsetY = (options.offsetYMm ?? 0) / mmPerPx;

  const crop: Crop = {
    x: measurements.centreX - cropWidth / 2 - offsetX,
    y: measurements.crownY - crownMm / mmPerPx - offsetY,
    width: cropWidth,
    height: cropHeight,
  };

  const outputWidth = Math.round(spec.widthMm * pxPerMm(spec.dpi));
  const outputHeight = Math.round(spec.heightMm * pxPerMm(spec.dpi));

  return {
    crop,
    outputWidth,
    outputHeight,
    headMm,
    crownMm: (measurements.crownY - crop.y) * mmPerPx,
    eyeMm: spec.heightMm - (measurements.eyeY - crop.y) * mmPerPx,
    sourcePerOutput: cropWidth / outputWidth,
  };
}

/** How far the crop runs past each edge of the photo, in source pixels. */
export function overhang(
  crop: Crop,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number; any: boolean } {
  const left = Math.max(0, -crop.x);
  const top = Math.max(0, -crop.y);
  const right = Math.max(0, crop.x + crop.width - width);
  const bottom = Math.max(0, crop.y + crop.height - height);
  return { left, top, right, bottom, any: left + top + right + bottom > 0.5 };
}

/** True when the head height this layout achieves is inside what the spec allows. */
export function headInRange(spec: PhotoSpec, layout: Layout): boolean {
  return layout.headMm >= spec.headMinMm - 0.05 && layout.headMm <= spec.headMaxMm + 0.05;
}

/** True when the eyes land where the spec says, or when it does not say. */
export function eyesInRange(spec: PhotoSpec, layout: Layout): boolean {
  if (spec.eyeMinMm == null || spec.eyeMaxMm == null) return true;
  return layout.eyeMm >= spec.eyeMinMm - 0.05 && layout.eyeMm <= spec.eyeMaxMm + 0.05;
}
