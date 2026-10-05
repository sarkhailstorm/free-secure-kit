import type { Stencil } from '@/lib/background-remover/infer';
import { eyeLine } from './detect';
import type { FaceDetection, MaskData, Measurements } from './types';

// Alpha above this counts as part of the person
const SOLID = 128;

// A row needs this share of the band filled before it counts as the head
const ROW_SHARE = 0.06;

// How far either side of the face box to look for the top of the hair
const BAND_SPREAD = 0.25;

// Where the chin sits below the bottom of a YuNet box, as a share of box height
const CHIN_DROP = 0.04;

// Where the crown sits above a face box when there is no cut-out to ask
const CROWN_RISE = 0.34;

export function toMask(stencil: Stencil): MaskData {
  const alpha = new Uint8ClampedArray(stencil.width * stencil.height);
  const data = stencil.image.data;
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, width: stencil.width, height: stencil.height };
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

// Source pixels; null when nothing solid sits in the band
export function findCrown(
  mask: MaskData,
  sourceWidth: number,
  sourceHeight: number,
  fromX: number,
  toX: number,
): number | null {
  const scaleX = mask.width / sourceWidth;
  const scaleY = mask.height / sourceHeight;
  const left = clamp(Math.floor(fromX * scaleX), 0, mask.width - 1);
  const right = clamp(Math.ceil(toX * scaleX), left + 1, mask.width);
  const needed = Math.max(2, Math.round((right - left) * ROW_SHARE));

  for (let row = 0; row < mask.height; row++) {
    let filled = 0;
    const start = row * mask.width;
    for (let col = left; col < right; col++) {
      if (mask.alpha[start + col] >= SOLID) filled++;
    }
    if (filled >= needed) return row / scaleY;
  }
  return null;
}

export function measure(
  sourceWidth: number,
  sourceHeight: number,
  face: FaceDetection | null,
  mask: MaskData | null,
): Measurements {
  if (!face) return withoutFace(sourceWidth, sourceHeight, mask);

  const eyes = eyeLine(face);
  const chinY = face.y + face.height * (1 + CHIN_DROP);

  const spread = face.width * BAND_SPREAD;
  const fromMask = mask
    ? findCrown(mask, sourceWidth, sourceHeight, face.x - spread, face.x + face.width + spread)
    : null;

  // A crown below the eyes means the cut-out found something other than a head
  const usable = fromMask != null && fromMask < eyes.y - face.height * 0.1;
  const crownY = usable ? fromMask : face.y - face.height * CROWN_RISE;

  return {
    crownY,
    chinY,
    eyeY: eyes.y,
    centreX: eyes.x,
    origin: usable ? 'detected' : 'estimated',
  };
}

function withoutFace(
  sourceWidth: number,
  sourceHeight: number,
  mask: MaskData | null,
): Measurements {
  const top = mask ? findCrown(mask, sourceWidth, sourceHeight, 0, sourceWidth) : null;
  const crownY = top ?? sourceHeight * 0.1;
  const headHeight = sourceHeight * 0.4;
  return {
    crownY,
    chinY: crownY + headHeight,
    // Roughly where eyes sit in a head: a little above halfway
    eyeY: crownY + headHeight * 0.55,
    centreX: sourceWidth / 2,
    origin: 'estimated',
  };
}

// `spread` runs 0 to 1
export function backgroundSpread(
  pixels: ImageData,
  mask: MaskData,
): { spread: number; colour: [number, number, number]; sampled: number } {
  const scaleX = mask.width / pixels.width;
  const scaleY = mask.height / pixels.height;
  const step = Math.max(1, Math.round(Math.min(pixels.width, pixels.height) / 160));

  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const values: number[] = [];

  for (let y = 0; y < pixels.height; y += step) {
    const maskRow = Math.min(mask.height - 1, Math.floor(y * scaleY)) * mask.width;
    for (let x = 0; x < pixels.width; x += step) {
      const maskCol = Math.min(mask.width - 1, Math.floor(x * scaleX));
      // Anything with a trace of the person in it is an edge, not background
      if (mask.alpha[maskRow + maskCol] > 8) continue;
      const p = (y * pixels.width + x) * 4;
      sumR += pixels.data[p];
      sumG += pixels.data[p + 1];
      sumB += pixels.data[p + 2];
      values.push(pixels.data[p] * 0.299 + pixels.data[p + 1] * 0.587 + pixels.data[p + 2] * 0.114);
      count++;
    }
  }

  if (count < 30) return { spread: 0, colour: [255, 255, 255], sampled: count };

  const mean = values.reduce((a, b) => a + b, 0) / count;
  let variance = 0;
  for (const value of values) variance += (value - mean) ** 2;
  const deviation = Math.sqrt(variance / count);

  return {
    // 40 levels of deviation is already a visibly busy wall, so treat that as the top
    spread: Math.min(1, deviation / 40),
    colour: [sumR / count, sumG / count, sumB / count],
    sampled: count,
  };
}
