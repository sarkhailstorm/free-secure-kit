import { safeFilename } from '@/lib/download';
import { sizeLabel } from './specs';
import {
  PassportPhotoError,
  type Crop,
  type Layout,
  type MaskData,
  type PhotoSpec,
  type RenderOptions,
  type RenderedPhoto,
} from './types';

/**
 * Painting the finished photo.
 *
 * The crop planned in layout.ts is a rectangle of the photo the user picked,
 * and it is allowed to run off the edge: someone who cropped their photo close
 * to the hair still gets a preview with the missing strip filled in, rather
 * than an error. So every draw here trims the rectangle to the photo first and
 * works out where the surviving part lands, instead of handing the browser a
 * source rectangle with a corner outside the image. Some browsers throw on one
 * of those, and others quietly stretch it.
 */

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new PassportPhotoError('This browser wouldn\u2019t provide a 2D canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** A flat colour to paint, and the cut-out to lift the person out with. */
interface Replacement {
  colour: string;
  mask: MaskData;
}

/**
 * Whether the background is really being replaced.
 *
 * Asking for a colour is not enough on its own: without a cut-out there is no
 * way to tell the person from the wall, so the photo keeps the background it
 * came with.
 */
function replacement(options: RenderOptions, mask: MaskData | null): Replacement | null {
  if (options.background.kind !== 'colour') return null;
  if (!mask || mask.width < 1 || mask.height < 1) return null;
  return { colour: options.background.colour, mask };
}

/** The lightest colour the spec allows, for the part the photo does not reach. */
function fallbackColour(spec: PhotoSpec): string {
  return spec.background.swatches[0] ?? '#ffffff';
}

/**
 * Draw `crop` of `source` so that it fills a `width` x `height` canvas.
 *
 * `crop` is in the source's own pixels and may be fractional, and may sit partly
 * or wholly outside it. Only the overlapping part is drawn, at the place in the
 * output it belongs.
 */
function paintCrop(
  context: CanvasRenderingContext2D,
  source: ImageBitmap | HTMLCanvasElement,
  crop: Crop,
  width: number,
  height: number,
): void {
  if (!(crop.width > 0 && crop.height > 0)) return;

  const left = Math.max(0, crop.x);
  const top = Math.max(0, crop.y);
  const right = Math.min(source.width, crop.x + crop.width);
  const bottom = Math.min(source.height, crop.y + crop.height);
  if (!(right > left && bottom > top)) return;

  const across = width / crop.width;
  const down = height / crop.height;

  context.drawImage(
    source,
    left,
    top,
    right - left,
    bottom - top,
    (left - crop.x) * across,
    (top - crop.y) * down,
    (right - left) * across,
    (bottom - top) * down,
  );
}

/**
 * The cut-out as a white image whose alpha channel is the coverage.
 *
 * White everywhere keeps the edges clean: the browser blends colour as well as
 * alpha when it scales this up, and white against white cannot fringe.
 */
function toStencil(mask: MaskData): ImageData {
  const stencil = new ImageData(mask.width, mask.height);
  const out = stencil.data;
  const count = mask.width * mask.height;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    out[p] = 255;
    out[p + 1] = 255;
    out[p + 2] = 255;
    out[p + 3] = mask.alpha[i];
  }
  return stencil;
}

/** The same rectangle, measured in the cut-out's smaller pixels. */
function inMaskPixels(crop: Crop, bitmap: ImageBitmap, mask: MaskData): Crop {
  const across = mask.width / bitmap.width;
  const down = mask.height / bitmap.height;
  return {
    x: crop.x * across,
    y: crop.y * down,
    width: crop.width * across,
    height: crop.height * down,
  };
}

/** Paint the finished photo into `target`, resizing it to the output size first. */
export function drawPhoto(
  target: HTMLCanvasElement,
  bitmap: ImageBitmap,
  options: RenderOptions,
  mask: MaskData | null,
): void {
  const { layout } = options;
  const swap = replacement(options, mask);

  target.width = layout.outputWidth;
  target.height = layout.outputHeight;
  const context = context2d(target);

  // A colour the browser cannot read leaves fillStyle as it was, so start from
  // white rather than the canvas default of black.
  context.fillStyle = '#ffffff';
  context.fillStyle = swap ? swap.colour : fallbackColour(options.spec);
  context.fillRect(0, 0, layout.outputWidth, layout.outputHeight);

  if (!swap) {
    paintCrop(context, bitmap, layout.crop, layout.outputWidth, layout.outputHeight);
    return;
  }

  const person = document.createElement('canvas');
  const stencil = document.createElement('canvas');
  try {
    person.width = layout.outputWidth;
    person.height = layout.outputHeight;
    const cut = context2d(person);
    paintCrop(cut, bitmap, layout.crop, layout.outputWidth, layout.outputHeight);

    stencil.width = swap.mask.width;
    stencil.height = swap.mask.height;
    context2d(stencil).putImageData(toStencil(swap.mask), 0, 0);

    // The cut-out is much smaller than the photo, so it is scaled up smoothly
    // here: a nearest-neighbour edge would come out as visible steps.
    cut.globalCompositeOperation = 'destination-in';
    paintCrop(
      cut,
      stencil,
      inMaskPixels(layout.crop, bitmap, swap.mask),
      layout.outputWidth,
      layout.outputHeight,
    );
    cut.globalCompositeOperation = 'source-over';

    context.drawImage(person, 0, 0);
  } finally {
    release(person);
    release(stencil);
  }
}

function extensionFor(format: RenderOptions['format']): string {
  return format === 'image/png' ? 'png' : 'jpg';
}

function photoFilename(spec: PhotoSpec, format: RenderOptions['format']): string {
  const name = `${spec.country} ${spec.document.toLowerCase()} photo - ${sizeLabel(spec)}`;
  return `${safeFilename(name, 'passport photo')}.${extensionFor(format)}`;
}

/** Paint the finished photo on a canvas of its own and encode it as a file. */
export async function renderPhoto(
  bitmap: ImageBitmap,
  options: RenderOptions,
  mask: MaskData | null,
): Promise<RenderedPhoto> {
  // toBlob answers null for a photo with no pixels in it as well as for one
  // that is too big, so the small case is caught here to keep them apart.
  if (options.layout.outputWidth < 1 || options.layout.outputHeight < 1) {
    throw new PassportPhotoError(
      'That size is too small to save. Check the width and height you asked for.',
    );
  }

  const canvas = document.createElement('canvas');
  try {
    drawPhoto(canvas, bitmap, options, mask);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, options.format, options.quality);
    });
    if (!blob) {
      throw new PassportPhotoError(
        'The photo couldn\u2019t be saved. It may be too large for this browser to handle.',
      );
    }

    return {
      blob,
      width: options.layout.outputWidth,
      height: options.layout.outputHeight,
      filename: photoFilename(options.spec, options.format),
    };
  } finally {
    release(canvas);
  }
}

/**
 * Where the crown, chin and eye lines sit, as a share of the photo's height
 * measured down from the top, so a preview can draw them without repeating the
 * sums.
 *
 * A value below 0 or above 1 means that line falls off the photo, which is what
 * a crop that does not fit looks like.
 */
export function guideOverlay(
  layout: Layout,
  spec: PhotoSpec,
): { crownRatio: number; chinRatio: number; eyeRatio: number } {
  const height = spec.heightMm > 0 ? spec.heightMm : 1;
  return {
    crownRatio: layout.crownMm / height,
    chinRatio: (layout.crownMm + layout.headMm) / height,
    // The eye line is the one measurement taken up from the bottom edge.
    eyeRatio: (height - layout.eyeMm) / height,
  };
}
