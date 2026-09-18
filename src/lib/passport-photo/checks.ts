import { formatBytes } from '@/lib/format';
import { eyeLine, turn } from './detect';
import { overhang } from './layout';
import type {
  Check,
  Crop,
  FaceDetection,
  Layout,
  Measurements,
  PhotoSpec,
  Severity,
} from './types';

/**
 * Everything that gets a passport photo turned away, found before it is sent.
 *
 * A rejection costs weeks and another fee, so this is the part of the tool that
 * earns its keep. The arithmetic here is dull; the wording is not. Each check
 * says what is wrong in the words the person would use themselves, and carries
 * a fix only where there is something they can actually go and do.
 */

/** Past this the head reads as leaning, in degrees. */
const MAX_TILT_DEGREES = 5;

/** Nose drift, as a share of the gap between the eyes. Past this the face is turned. */
const MAX_TURN = 0.22;

/** Background variation past this is clutter rather than a wall. */
const MAX_SPREAD = 0.35;

/** Under this the photo is stretched far enough to print soft. */
const MIN_SOURCE_PER_OUTPUT = 0.6;

/** Plain RGB distance from the nearest allowed swatch before the wall is the wrong colour. */
const MAX_SWATCH_DISTANCE = 60;

/** Half a source pixel: below this the crop is inside the photo bar rounding. */
const EDGE_SLACK = 0.5;

/**
 * A missing strip thinner than this share of the finished photo is not worth
 * stopping someone over: on a 35 x 45 mm print it is under half a millimetre of
 * flat colour along one edge, thinner than the scissors are accurate. Measuring
 * the same head twice moves the crop about that far on its own, so without this
 * a photo that came out of this very tool comes back as unusable.
 */
const EDGE_TOLERANCE = 0.01;

const RANK: Record<Severity, number> = { blocker: 0, warning: 1, note: 2 };

export interface CheckInput {
  spec: PhotoSpec;
  layout: Layout;
  measurements: Measurements;
  faces: readonly FaceDetection[];
  sourceWidth: number;
  sourceHeight: number;
  fileBytes: number;
  background: { spread: number; colour: readonly [number, number, number] } | null;
}

type Rgb = readonly [number, number, number];

function parseSwatch(hex: string): Rgb | null {
  const text = hex.trim().replace(/^#/, '');
  const full = text.length === 3 ? text.replace(/./g, (digit) => digit + digit) : text;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** Distance to the closest swatch the rule allows, or null when none can be read. */
function nearestSwatch(colour: Rgb, swatches: readonly string[]): number | null {
  let best: number | null = null;
  for (const hex of swatches) {
    const swatch = parseSwatch(hex);
    if (!swatch) continue;
    const gap = Math.hypot(colour[0] - swatch[0], colour[1] - swatch[1], colour[2] - swatch[2]);
    if (best === null || gap < best) best = gap;
  }
  return best;
}

/** "a", "a and b", "a, b and c". */
function joinParts(parts: readonly string[]): string {
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Which way the crop runs off the photo, said the way a person would say it. */
function missingRoom(
  over: { left: number; top: number; right: number; bottom: number },
  crop: Crop,
): string[] {
  const across = Math.max(EDGE_SLACK, crop.width * EDGE_TOLERANCE);
  const down = Math.max(EDGE_SLACK, crop.height * EDGE_TOLERANCE);

  const parts: string[] = [];
  if (over.top > down) parts.push('above your head');
  if (over.bottom > down) parts.push('below your chin');
  if (over.left > across && over.right > across) parts.push('on both sides of you');
  else if (over.left > across) parts.push('on the left');
  else if (over.right > across) parts.push('on the right');
  return parts;
}

// The specs carry the no-retouching rule as ordinary note text rather than a
// flag, so the note is what we read.
function mentionsRetouching(notes: readonly string[] | undefined): boolean {
  return (notes ?? []).some((note) => /retouch/i.test(note));
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Everything wrong with this photo, worst first. */
export function runChecks(input: CheckInput): Check[] {
  const { spec, layout, measurements, faces, background, fileBytes } = input;
  const checks: Check[] = [];

  if (faces.length === 0) {
    const byHand = measurements.origin === 'manual';
    checks.push({
      id: 'no-face',
      severity: 'blocker',
      message: byHand
        ? 'The tool could not find a face in this photo, so nothing here was measured for you.'
        : 'The tool could not find a face in this photo.',
      fix: byHand
        ? 'Check the top of the head, the chin and the eye line against the photo before you save it.'
        : 'Set the top of the head, the chin and the eye line by hand, or try a photo where the face is clearer.',
    });
  } else if (faces.length > 1) {
    checks.push({
      id: 'many-faces',
      severity: 'warning',
      message: `This photo has ${faces.length} faces in it, and only one person may be in a passport photo.`,
      fix: 'Take it again with nobody else in the frame.',
    });
  }

  const over = overhang(layout.crop, input.sourceWidth, input.sourceHeight);
  const room = missingRoom(over, layout.crop);
  if (room.length > 0) {
    checks.push({
      id: 'not-enough-photo',
      severity: 'blocker',
      message: `There is not enough room ${joinParts(room)} in this photo.`,
      fix: 'Stand further back from the camera, or take the photo again with more space around your head.',
    });
  }

  if (layout.sourcePerOutput < MIN_SOURCE_PER_OUTPUT) {
    checks.push({
      id: 'too-few-pixels',
      severity: 'warning',
      message: 'This photo is too small for a print this size, so it will come out blurry.',
      fix: 'Use the photo straight from the camera rather than a copy sent through a messaging app, or take a new one on a better camera.',
    });
  }

  // Both of these read the five landmarks, so a face without them is skipped.
  const face = faces.length > 0 && faces[0].points.length >= 3 ? faces[0] : null;
  if (face) {
    const tilt = Math.abs(eyeLine(face).tiltDegrees);
    if (tilt > MAX_TILT_DEGREES) {
      checks.push({
        id: 'head-tilted',
        severity: 'warning',
        message: `Your head is leaning about ${Math.round(tilt)} degrees to one side.`,
        fix: 'Hold your head level, with both eyes at the same height.',
      });
    }
    if (turn(face) > MAX_TURN) {
      checks.push({
        id: 'looking-away',
        severity: 'warning',
        message: 'You are not looking straight at the camera.',
        fix: 'Face the camera square on and look into the lens.',
      });
    }
  }

  if (background) {
    if (background.spread > MAX_SPREAD) {
      checks.push({
        id: 'busy-background',
        severity: 'warning',
        message: 'What is behind you is too busy for a passport photo.',
        fix: 'Stand in front of a plain wall with nothing on it.',
      });
    } else {
      const gap = nearestSwatch(background.colour, spec.background.swatches);
      if (gap !== null && gap > MAX_SWATCH_DISTANCE) {
        checks.push({
          id: 'background-not-plain',
          severity: 'note',
          message: `The wall behind you is plain, but its colour may not be accepted: this document asks for ${lowerFirst(spec.background.label)}.`,
          fix: 'Take the photo again in front of a wall of that colour.',
        });
      }
    }
  }

  const digital = spec.digital;
  if (digital?.maxBytes != null && fileBytes > digital.maxBytes) {
    checks.push({
      id: 'file-too-large',
      severity: 'warning',
      message: `This photo is ${formatBytes(fileBytes)}, and the form allows at most ${formatBytes(digital.maxBytes)}.`,
      fix: 'Save it as a JPEG at a lower quality to bring the size down.',
    });
  }
  if (digital?.minBytes != null && fileBytes < digital.minBytes) {
    checks.push({
      id: 'file-too-small',
      severity: 'warning',
      message: `This photo is only ${formatBytes(fileBytes)}, and the form asks for at least ${formatBytes(digital.minBytes)}.`,
      fix: 'Save it as a JPEG at full quality, or use a photo from a better camera.',
    });
  }

  if (mentionsRetouching(spec.notes)) {
    checks.push({
      id: 'edited-photo',
      severity: 'note',
      message:
        'Most authorities refuse a photo that has been edited, and changing the background here counts as editing.',
      fix: 'Where you can, take the photo in front of the right wall and leave the background as it came out of the camera.',
    });
  }

  return checks.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** The worst thing found, or null when nothing was. */
export function worstSeverity(checks: readonly Check[]): Severity | null {
  let worst: Severity | null = null;
  for (const check of checks) {
    if (worst === null || RANK[check.severity] < RANK[worst]) worst = check.severity;
  }
  return worst;
}
