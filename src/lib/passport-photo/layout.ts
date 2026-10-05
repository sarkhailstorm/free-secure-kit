import type { Crop, Layout, Measurements, PhotoSpec } from './types';

// Share of the leftover height that goes above the crown when the spec sets no eye line
const CROWN_SHARE = 0.3;

export interface LayoutOptions {
  // Chin-to-crown height to aim for, clamped to what the spec allows
  headMm?: number;
  // Positive is right and down, in mm
  offsetXMm?: number;
  offsetYMm?: number;
}

export function pxPerMm(dpi: number): number {
  return dpi / 25.4;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

export function preferredHeadMm(spec: PhotoSpec): number {
  return (spec.headMinMm + spec.headMaxMm) / 2;
}

// Null when the spec sets no eye band
export function preferredEyeMm(spec: PhotoSpec): number | null {
  if (spec.eyeMinMm == null || spec.eyeMaxMm == null) return null;
  return (spec.eyeMinMm + spec.eyeMaxMm) / 2;
}

// The crop may fall outside the source, which is how a too-tight photo is caught
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

// How far the crop runs past each edge, in source pixels
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

export function headInRange(spec: PhotoSpec, layout: Layout): boolean {
  return layout.headMm >= spec.headMinMm - 0.05 && layout.headMm <= spec.headMaxMm + 0.05;
}

// Also true when the spec sets no eye band at all
export function eyesInRange(spec: PhotoSpec, layout: Layout): boolean {
  if (spec.eyeMinMm == null || spec.eyeMaxMm == null) return true;
  return layout.eyeMm >= spec.eyeMinMm - 0.05 && layout.eyeMm <= spec.eyeMaxMm + 0.05;
}
