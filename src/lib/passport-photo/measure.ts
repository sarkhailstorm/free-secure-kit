import type { Stencil } from '@/lib/background-remover/infer';
import { eyeLine } from './detect';
import type { FaceDetection, MaskData, Measurements } from './types';

/**
 * Turning a face box and a cut-out into the four numbers a crop needs.
 *
 * The crown is the hard one. A face detector finds the face, and the top of a
 * face box sits somewhere around the eyebrows — nowhere near the top of the
 * hair, which is what every authority measures to. The cut-out knows where the
 * hair ends, so that is where the crown comes from whenever there is one.
 */

/** Alpha above this counts as part of the person. */
const SOLID = 128;

/** A row needs this share of the band filled before it counts as the head. */
const ROW_SHARE = 0.06;

/** How far either side of the face box to look for the top of the hair. */
const BAND_SPREAD = 0.25;

/** Where the chin sits below the bottom of a YuNet box, as a share of box height. */
const CHIN_DROP = 0.04;

/** Where the crown sits above a face box when there is no cut-out to ask. */
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

/**
 * The topmost row of the cut-out inside a horizontal band, in source pixels.
 *
 * The band keeps a raised arm or a second person out of the answer. Null when
 * the band holds nothing solid, which happens when the cut-out failed.
 */
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

/**
 * Where the head is, from whatever evidence there is.
 *
 * With a face and a cut-out this is close enough to download without touching.
 * With only one of them it is a starting point the user is expected to drag,
 * which is why `origin` travels with the numbers.
 */
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

  // A cut-out that puts the crown below the eyes has found something other than
  // a head — a hat brim lost against the wall, or nothing at all.
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

/**
 * A guess for a photo with no face in it, so the editor still opens with
 * something to drag rather than an error.
 */
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
    // Roughly where eyes sit in a head: a little above halfway.
    eyeY: crownY + headHeight * 0.55,
    centreX: sourceWidth / 2,
    origin: 'estimated',
  };
}

/**
 * How much the background varies, 0 to 1, and its average colour.
 *
 * Only pixels well clear of the cut-out are sampled, so hair edges do not count
 * as clutter. A plain wall lands near 0; a bookcase or a doorframe climbs fast.
 */
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
      // Anything with a trace of the person in it is an edge, not background.
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
    // 40 levels of spread is already a visibly busy wall; treat that as the top.
    spread: Math.min(1, deviation / 40),
    colour: [sumR / count, sumG / count, sumB / count],
    sampled: count,
  };
}
