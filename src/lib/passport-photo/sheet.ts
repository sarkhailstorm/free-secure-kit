import { pxPerMm } from './layout';
import { PassportPhotoError, type SheetSpec } from './types';

/** iOS caps total canvas area and hands back a blank canvas rather than throwing. */
const MAX_SHEET_PIXELS = 16_777_216;

const DEFAULT_DPI = 300;
const DEFAULT_GAP_MM = 2;
const DEFAULT_MARGIN_MM = 4;

const MIN_DPI = 72;
const DPI_STEP = 25;

/** How far a cut mark reaches out from the corner of a photo. */
const TICK_MM = 2.5;
const HAIRLINE_MM = 0.1;
const CUT_MARK_COLOUR = '#b0b0b0';

const JPEG_QUALITY = 0.92;

export interface SheetOptions {
  dpi?: number;
  gapMm?: number;
  marginMm?: number;
  cutMarks?: boolean;
}

export interface SheetResult {
  blob: Blob;
  width: number;
  height: number;
  copies: number;
  columns: number;
  rows: number;
}

interface Settings {
  dpi: number;
  gapMm: number;
  marginMm: number;
  cutMarks: boolean;
}

/** In millimetres, on the sheet turned whichever way fits more copies. */
interface Grid {
  columns: number;
  rows: number;
  copies: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
}

interface Placement {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  gapX: number;
  gapY: number;
  originX: number;
  originY: number;
  /** How far a cut mark may reach between two photos, and out into the border. */
  innerReachX: number;
  innerReachY: number;
  outerReachX: number;
  outerReachY: number;
  thickness: number;
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function notNegative(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function settle(options: SheetOptions): Settings {
  return {
    dpi: positive(options.dpi, DEFAULT_DPI),
    gapMm: notNegative(options.gapMm, DEFAULT_GAP_MM),
    marginMm: notNegative(options.marginMm, DEFAULT_MARGIN_MM),
    cutMarks: options.cutMarks ?? true,
  };
}

/** Rescues a row that fits exactly: the decimal sum lands a hair under the whole number. */
const HAIR = 1e-9;

function countAcross(spaceMm: number, itemMm: number, gapMm: number): number {
  if (!(itemMm > 0) || !(spaceMm > 0)) return 0;
  return Math.max(0, Math.floor((spaceMm + gapMm) / (itemMm + gapMm) + HAIR));
}

function gridFor(
  sheetWidthMm: number,
  sheetHeightMm: number,
  photoWidthMm: number,
  photoHeightMm: number,
  settings: Settings,
): Grid {
  const columns = countAcross(sheetWidthMm - settings.marginMm * 2, photoWidthMm, settings.gapMm);
  const rows = countAcross(sheetHeightMm - settings.marginMm * 2, photoHeightMm, settings.gapMm);
  return { columns, rows, copies: columns * rows, sheetWidthMm, sheetHeightMm };
}

function plan(
  sheet: SheetSpec,
  photoWidthMm: number,
  photoHeightMm: number,
  settings: Settings,
): Grid {
  const upright = gridFor(sheet.widthMm, sheet.heightMm, photoWidthMm, photoHeightMm, settings);
  const turned = gridFor(sheet.heightMm, sheet.widthMm, photoWidthMm, photoHeightMm, settings);
  return turned.copies > upright.copies ? turned : upright;
}

/** How many copies fit on one sheet, trying it both ways round. */
export function sheetCapacity(
  sheet: SheetSpec,
  photoWidthMm: number,
  photoHeightMm: number,
  options: SheetOptions = {},
): { columns: number; rows: number; copies: number } {
  const { columns, rows, copies } = plan(sheet, photoWidthMm, photoHeightMm, settle(options));
  return { columns, rows, copies };
}

function fitDpi(dpi: number, widthMm: number, heightMm: number): number {
  const area = (value: number) =>
    Math.round(widthMm * pxPerMm(value)) * Math.round(heightMm * pxPerMm(value));

  let value = dpi;
  const asked = area(value);
  if (asked > MAX_SHEET_PIXELS) {
    value = Math.floor((dpi * Math.sqrt(MAX_SHEET_PIXELS / asked)) / DPI_STEP) * DPI_STEP;
  }
  value = Math.max(MIN_DPI, value);

  // Better grainy than blank, so the MIN_DPI floor gives way if it has to.
  while (value > 1 && area(value) > MAX_SHEET_PIXELS) {
    value -= value > MIN_DPI ? DPI_STEP : 1;
  }
  return Math.max(1, value);
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new PassportPhotoError('This browser wouldn\u2019t provide a 2D canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

/** Sizes round down, never up: rounded up, a row eats the margin and shaves the last photo. */
function place(
  grid: Grid,
  photoWidthMm: number,
  photoHeightMm: number,
  width: number,
  height: number,
  scale: number,
  settings: Settings,
): Placement {
  const cellWidth = Math.max(1, Math.floor(photoWidthMm * scale));
  const cellHeight = Math.max(1, Math.floor(photoHeightMm * scale));
  const gapX = Math.floor(settings.gapMm * scale);
  const gapY = gapX;

  const spanWidth = grid.columns * cellWidth + (grid.columns - 1) * gapX;
  const spanHeight = grid.rows * cellHeight + (grid.rows - 1) * gapY;
  const originX = Math.max(0, Math.floor((width - spanWidth) / 2));
  const originY = Math.max(0, Math.floor((height - spanHeight) / 2));

  const tick = Math.round(TICK_MM * scale);

  return {
    columns: grid.columns,
    rows: grid.rows,
    cellWidth,
    cellHeight,
    gapX,
    gapY,
    originX,
    originY,
    innerReachX: Math.min(tick, gapX),
    innerReachY: Math.min(tick, gapY),
    outerReachX: Math.min(tick, originX),
    outerReachY: Math.min(tick, originY),
    thickness: Math.max(1, Math.round(HAIRLINE_MM * scale)),
  };
}

function cellAt(spot: Placement, column: number, row: number): { x: number; y: number } {
  return {
    x: spot.originX + column * (spot.cellWidth + spot.gapX),
    y: spot.originY + row * (spot.cellHeight + spot.gapY),
  };
}

function drawPhotos(context: CanvasRenderingContext2D, photo: ImageBitmap, spot: Placement): void {
  for (let row = 0; row < spot.rows; row++) {
    for (let column = 0; column < spot.columns; column++) {
      const cell = cellAt(spot, column, row);
      context.drawImage(photo, cell.x, cell.y, spot.cellWidth, spot.cellHeight);
    }
  }
}

/** Ticks reach only into the space beside a photo, so nothing is ever drawn over one. */
function drawCutMarks(context: CanvasRenderingContext2D, spot: Placement): void {
  context.fillStyle = CUT_MARK_COLOUR;
  const half = spot.thickness / 2;

  for (let row = 0; row < spot.rows; row++) {
    for (let column = 0; column < spot.columns; column++) {
      const cell = cellAt(spot, column, row);
      const sides = [
        { x: cell.x, reach: column > 0 ? spot.innerReachX : spot.outerReachX, outward: -1 },
        {
          x: cell.x + spot.cellWidth,
          reach: column < spot.columns - 1 ? spot.innerReachX : spot.outerReachX,
          outward: 1,
        },
      ];
      const levels = [
        { y: cell.y, reach: row > 0 ? spot.innerReachY : spot.outerReachY, outward: -1 },
        {
          y: cell.y + spot.cellHeight,
          reach: row < spot.rows - 1 ? spot.innerReachY : spot.outerReachY,
          outward: 1,
        },
      ];

      for (const side of sides) {
        for (const level of levels) {
          if (side.reach > 0) {
            const from = side.outward < 0 ? side.x - side.reach : side.x;
            context.fillRect(from, Math.round(level.y - half), side.reach, spot.thickness);
          }
          if (level.reach > 0) {
            const from = level.outward < 0 ? level.y - level.reach : level.y;
            context.fillRect(Math.round(side.x - half), from, spot.thickness, level.reach);
          }
        }
      }
    }
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new PassportPhotoError('The sheet couldn\u2019t be saved as a photo.'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/** Fill a sheet with copies of one finished photo. The blob is a JPEG. */
export async function renderSheet(
  photo: Blob,
  photoWidthMm: number,
  photoHeightMm: number,
  sheet: SheetSpec,
  options: SheetOptions = {},
): Promise<SheetResult> {
  const settings = settle(options);
  const grid = plan(sheet, photoWidthMm, photoHeightMm, settings);
  if (grid.copies < 1) {
    throw new PassportPhotoError(
      'The photo is larger than the print, so not even one copy fits. Try a bigger sheet, or a smaller photo size.',
    );
  }

  const dpi = fitDpi(settings.dpi, grid.sheetWidthMm, grid.sheetHeightMm);
  const scale = pxPerMm(dpi);
  const width = Math.round(grid.sheetWidthMm * scale);
  const height = Math.round(grid.sheetHeightMm * scale);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo);
  } catch {
    throw new PassportPhotoError('The finished photo couldn\u2019t be read back.');
  }

  const canvas = document.createElement('canvas');
  try {
    canvas.width = width;
    canvas.height = height;
    const context = context2d(canvas);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    const spot = place(grid, photoWidthMm, photoHeightMm, width, height, scale, settings);
    drawPhotos(context, bitmap, spot);
    if (settings.cutMarks) drawCutMarks(context, spot);

    const blob = await toJpeg(canvas);
    return {
      blob,
      width,
      height,
      copies: grid.copies,
      columns: grid.columns,
      rows: grid.rows,
    };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
